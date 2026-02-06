/**
 * TWOINE - System Monitor Service
 * Collecte des métriques système en temps réel
 * Ubuntu 22.04 uniquement
 */

const os = require('os');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Constantes
const SITES_DIR = process.env.SITES_DIR || '/var/www/sites';
const isLinux = process.platform === 'linux';

/**
 * Classe pour la collecte des métriques système
 */
class SystemMonitor {
    constructor() {
        this.lastCpuInfo = null;
        this.lastNetworkInfo = null;
    }

    /**
     * Collecte toutes les métriques système
     * @returns {Promise<Object>}
     */
    async collectSystemStats() {
        const [cpu, memory, disk, network, processes, uptime] = await Promise.all([
            this.getCpuStats(),
            this.getMemoryStats(),
            this.getDiskStats(),
            this.getNetworkStats(),
            this.getProcessStats(),
            this.getUptime(),
        ]);

        return {
            cpu,
            memory,
            disk,
            network,
            processes,
            uptime,
            timestamp: new Date(),
        };
    }

    /**
     * Obtient les statistiques CPU
     * @returns {Promise<Object>}
     */
    async getCpuStats() {
        const cpus = os.cpus();
        const loadAvg = os.loadavg();

        let percent = 0;
        
        if (isLinux) {
            try {
                // Lecture précise via /proc/stat
                const cpuInfo = await this.readProcCpuStats();
                if (this.lastCpuInfo) {
                    percent = this.calculateCpuPercent(this.lastCpuInfo, cpuInfo);
                }
                this.lastCpuInfo = cpuInfo;
            } catch (e) {
                // Fallback sur load average
                percent = Math.min(100, (loadAvg[0] / cpus.length) * 100);
            }
        } else {
            // Fallback pour autres plateformes (dev)
            percent = Math.min(100, (loadAvg[0] / cpus.length) * 100);
        }

        return {
            percent: Math.round(percent * 10) / 10,
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown',
            speed: cpus[0]?.speed || 0,
            loadAvg: {
                one: loadAvg[0],
                five: loadAvg[1],
                fifteen: loadAvg[2],
            },
        };
    }

    /**
     * Lit les stats CPU depuis /proc/stat
     * @returns {Promise<Object>}
     */
    async readProcCpuStats() {
        const content = await fs.readFile('/proc/stat', 'utf8');
        const lines = content.split('\n');
        const cpuLine = lines.find(l => l.startsWith('cpu '));
        
        if (!cpuLine) {
            throw new Error('CPU line not found in /proc/stat');
        }

        const parts = cpuLine.split(/\s+/).slice(1).map(Number);
        const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;

        return {
            user,
            nice,
            system,
            idle,
            iowait: iowait || 0,
            irq: irq || 0,
            softirq: softirq || 0,
            steal: steal || 0,
            total: parts.reduce((a, b) => a + b, 0),
        };
    }

    /**
     * Calcule le pourcentage CPU entre deux lectures
     * @param {Object} prev 
     * @param {Object} curr 
     * @returns {number}
     */
    calculateCpuPercent(prev, curr) {
        const totalDiff = curr.total - prev.total;
        if (totalDiff === 0) return 0;

        const idleDiff = (curr.idle + curr.iowait) - (prev.idle + prev.iowait);
        return ((totalDiff - idleDiff) / totalDiff) * 100;
    }

    /**
     * Obtient les statistiques mémoire
     * @returns {Promise<Object>}
     */
    async getMemoryStats() {
        const total = os.totalmem();
        const free = os.freemem();
        
        let cached = 0;
        let buffers = 0;
        let available = free;

        if (isLinux) {
            try {
                const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
                const lines = meminfo.split('\n');
                
                for (const line of lines) {
                    const [key, value] = line.split(':');
                    if (!key || !value) continue;
                    
                    const kb = parseInt(value.trim().split(' ')[0], 10) * 1024;
                    
                    if (key === 'Cached') cached = kb;
                    if (key === 'Buffers') buffers = kb;
                    if (key === 'MemAvailable') available = kb;
                }
            } catch (e) {
                // Fallback values
            }
        }

        const used = total - available;
        const percent = (used / total) * 100;

        return {
            total,
            used,
            free,
            available,
            percent: Math.round(percent * 10) / 10,
            cached,
            buffers,
        };
    }

    /**
     * Obtient les statistiques disque
     * @returns {Promise<Object>}
     */
    async getDiskStats() {
        const stats = {
            total: 0,
            used: 0,
            free: 0,
            percent: 0,
        };

        if (isLinux) {
            try {
                const { stdout } = await execAsync('df -B1 / 2>/dev/null', { timeout: 5000 });
                const lines = stdout.trim().split('\n');
                
                if (lines.length >= 2) {
                    const parts = lines[1].split(/\s+/);
                    if (parts.length >= 5) {
                        stats.total = parseInt(parts[1], 10) || 0;
                        stats.used = parseInt(parts[2], 10) || 0;
                        stats.free = parseInt(parts[3], 10) || 0;
                        stats.percent = parseInt(parts[4], 10) || 0;
                    }
                }
            } catch (e) {
                console.error('[SystemMonitor] Error getting disk stats:', e.message);
            }
        }

        return stats;
    }

    /**
     * Obtient les statistiques réseau
     * @returns {Promise<Object>}
     */
    async getNetworkStats() {
        const stats = {
            bytesIn: 0,
            bytesOut: 0,
            packetsIn: 0,
            packetsOut: 0,
        };

        if (isLinux) {
            try {
                const content = await fs.readFile('/proc/net/dev', 'utf8');
                const lines = content.split('\n').slice(2); // Skip header
                
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length < 17) continue;
                    
                    const iface = parts[0].replace(':', '');
                    // Skip loopback
                    if (iface === 'lo') continue;
                    
                    stats.bytesIn += parseInt(parts[1], 10) || 0;
                    stats.packetsIn += parseInt(parts[2], 10) || 0;
                    stats.bytesOut += parseInt(parts[9], 10) || 0;
                    stats.packetsOut += parseInt(parts[10], 10) || 0;
                }
            } catch (e) {
                // Ignore errors
            }
        }

        return stats;
    }

    /**
     * Obtient les statistiques processus
     * @returns {Promise<Object>}
     */
    async getProcessStats() {
        const stats = {
            total: 0,
            running: 0,
            sleeping: 0,
            stopped: 0,
        };

        if (isLinux) {
            try {
                const { stdout } = await execAsync('ps -eo stat --no-headers 2>/dev/null', { timeout: 5000 });
                const processes = stdout.trim().split('\n').filter(Boolean);
                
                stats.total = processes.length;
                
                for (const state of processes) {
                    const firstChar = state.charAt(0);
                    if (firstChar === 'R') stats.running++;
                    else if (firstChar === 'S' || firstChar === 'D' || firstChar === 'I') stats.sleeping++;
                    else if (firstChar === 'T') stats.stopped++;
                }
            } catch (e) {
                // Ignore errors
            }
        }

        return stats;
    }

    /**
     * Obtient l'uptime du serveur
     * @returns {Promise<number>}
     */
    async getUptime() {
        return os.uptime();
    }

    /**
     * Obtient les statistiques d'un site
     * @param {Object} site - Document Site
     * @returns {Promise<Object>}
     */
    async getSiteStats(site) {
        const stats = {
            cpu: { percent: 0, timeMs: 0 },
            memory: { usedBytes: 0, percent: 0, limit: site.resources?.maxMemoryMB || 512 },
            disk: { usedBytes: 0, percent: 0, limit: site.resources?.maxDiskMB || 1024, fileCount: 0 },
            services: { total: 0, running: 0, stopped: 0, failed: 0 },
        };

        if (!isLinux) return stats;

        const linuxUser = site.linuxUser?.username;
        if (!linuxUser) return stats;

        try {
            // CPU et mémoire via ps pour l'utilisateur du site
            const { stdout: psOutput } = await execAsync(
                `ps -u ${linuxUser} -o pcpu,rss --no-headers 2>/dev/null || echo ""`,
                { timeout: 5000 }
            );

            const lines = psOutput.trim().split('\n').filter(Boolean);
            let totalCpu = 0;
            let totalMemKb = 0;

            for (const line of lines) {
                const [cpu, mem] = line.trim().split(/\s+/);
                totalCpu += parseFloat(cpu) || 0;
                totalMemKb += parseInt(mem, 10) || 0;
            }

            stats.cpu.percent = Math.round(totalCpu * 10) / 10;
            stats.memory.usedBytes = totalMemKb * 1024;
            stats.memory.percent = Math.round((totalMemKb / 1024 / stats.memory.limit) * 1000) / 10;

            // Disque via du
            if (site.paths?.root) {
                try {
                    const { stdout: duOutput } = await execAsync(
                        `du -sb ${site.paths.root} 2>/dev/null || echo "0"`,
                        { timeout: 10000 }
                    );
                    const bytes = parseInt(duOutput.split('\t')[0], 10) || 0;
                    stats.disk.usedBytes = bytes;
                    stats.disk.percent = Math.round((bytes / (stats.disk.limit * 1024 * 1024)) * 1000) / 10;

                    // Compte de fichiers
                    const { stdout: countOutput } = await execAsync(
                        `find ${site.paths.root} -type f 2>/dev/null | wc -l || echo "0"`,
                        { timeout: 10000 }
                    );
                    stats.disk.fileCount = parseInt(countOutput.trim(), 10) || 0;
                } catch (e) {
                    // Ignore disk errors
                }
            }
        } catch (e) {
            console.error(`[SystemMonitor] Error getting site stats for ${site.name}:`, e.message);
        }

        return stats;
    }

    /**
     * Obtient les statistiques d'un service via systemd
     * @param {string} serviceName - Nom du service systemd
     * @returns {Promise<Object>}
     */
    async getServiceStats(serviceName) {
        const stats = {
            active: 'unknown',
            running: false,
            pid: null,
            uptime: null,
            memory: null,
            cpu: null,
            startedAt: null,
            failureCount: 0,
            error: null,
        };

        if (!isLinux) return stats;

        try {
            // État du service
            const { stdout: activeState } = await execAsync(
                `systemctl is-active ${serviceName}.service 2>/dev/null || echo "inactive"`,
                { timeout: 5000 }
            ).catch(() => ({ stdout: 'inactive' }));
            
            stats.active = activeState.trim();
            stats.running = stats.active === 'active';

            // Détails via systemctl show
            const { stdout: showOutput } = await execAsync(
                `systemctl show ${serviceName}.service --property=MainPID,ActiveEnterTimestamp,MemoryCurrent,CPUUsageNSec,NRestarts,Result 2>/dev/null || echo ""`,
                { timeout: 5000 }
            );

            const props = {};
            showOutput.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key) {
                    props[key.trim()] = valueParts.join('=').trim();
                }
            });

            // PID
            if (props.MainPID && props.MainPID !== '0') {
                stats.pid = parseInt(props.MainPID, 10);
            }

            // Uptime
            if (props.ActiveEnterTimestamp && props.ActiveEnterTimestamp !== '') {
                const startTime = new Date(props.ActiveEnterTimestamp);
                if (!isNaN(startTime.getTime())) {
                    stats.uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
                    stats.startedAt = startTime;
                }
            }

            // Mémoire en bytes
            if (props.MemoryCurrent && props.MemoryCurrent !== '[not set]') {
                stats.memory = parseInt(props.MemoryCurrent, 10) || null;
            }

            // CPU en nanosecondes -> secondes
            if (props.CPUUsageNSec && props.CPUUsageNSec !== '[not set]') {
                const cpuNs = parseInt(props.CPUUsageNSec, 10);
                if (!isNaN(cpuNs)) {
                    stats.cpu = Math.round(cpuNs / 1000000) / 1000;
                }
            }

            // Restarts
            if (props.NRestarts) {
                stats.failureCount = parseInt(props.NRestarts, 10) || 0;
            }

            // Erreur
            if (props.Result && props.Result !== 'success') {
                stats.error = props.Result;
            }
        } catch (e) {
            stats.error = e.message;
        }

        return stats;
    }

    /**
     * Liste tous les services Twoine et leur état
     * @returns {Promise<Object[]>}
     */
    async listTwoineServicesStatus() {
        const services = [];

        if (!isLinux) return services;

        try {
            const { stdout } = await execAsync(
                `systemctl list-units 'twoine-*.service' --all --no-pager --plain --no-legend 2>/dev/null || echo ""`,
                { timeout: 10000 }
            );

            const lines = stdout.trim().split('\n').filter(Boolean);

            for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length < 4) continue;

                const unit = parts[0];
                const match = unit.match(/^(twoine-[a-z][a-z0-9_-]+-[a-z][a-z0-9_-]+)\.service$/);
                if (!match) continue;

                const serviceName = match[1];
                const load = parts[1];
                const active = parts[2];
                const sub = parts[3];

                services.push({
                    name: serviceName,
                    load,
                    active,
                    sub,
                    running: active === 'active' && sub === 'running',
                });
            }
        } catch (e) {
            console.error('[SystemMonitor] Error listing services:', e.message);
        }

        return services;
    }

    /**
     * Obtient les interfaces réseau
     * @returns {Object[]}
     */
    getNetworkInterfaces() {
        const interfaces = os.networkInterfaces();
        const result = [];

        for (const [name, addrs] of Object.entries(interfaces)) {
            for (const addr of addrs) {
                if (!addr.internal && addr.family === 'IPv4') {
                    result.push({
                        name,
                        address: addr.address,
                        mac: addr.mac,
                        netmask: addr.netmask,
                    });
                }
            }
        }

        return result;
    }

    /**
     * Obtient les informations système de base
     * @returns {Object}
     */
    getSystemInfo() {
        return {
            platform: process.platform,
            arch: os.arch(),
            hostname: os.hostname(),
            nodeVersion: process.version,
            release: os.release(),
            type: os.type(),
        };
    }
}

// Export singleton
const systemMonitor = new SystemMonitor();

module.exports = {
    SystemMonitor,
    systemMonitor,
};
