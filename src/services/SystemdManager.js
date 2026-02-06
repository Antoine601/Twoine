/**
 * TWOINE - Systemd Manager Service
 * Gestion des services systemd pour les sites hébergés
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Constantes
const SYSTEMD_DIR = '/etc/systemd/system';
const SUDO_PATH = '/usr/bin/sudo';
const SYSTEMCTL_PATH = '/usr/bin/systemctl';

/**
 * Valide un nom de service pour éviter l'injection
 * @param {string} serviceName 
 * @returns {boolean}
 */
function validateServiceName(serviceName) {
    // Seuls les caractères alphanumériques, tirets et underscores sont autorisés
    const validPattern = /^twoine-[a-z][a-z0-9_-]+-[a-z][a-z0-9_-]+$/;
    return validPattern.test(serviceName) && serviceName.length <= 100;
}

/**
 * Échappe les caractères dangereux pour les commandes shell
 * @param {string} str 
 * @returns {string}
 */
function escapeShellArg(str) {
    return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Exécute une commande systemctl via sudo
 * @param {string[]} args - Arguments pour systemctl
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function systemctl(...args) {
    const safeArgs = args.map(arg => {
        if (typeof arg !== 'string') {
            throw new Error('Invalid argument type');
        }
        return arg;
    });
    
    const command = `${SUDO_PATH} ${SYSTEMCTL_PATH} ${safeArgs.join(' ')}`;
    
    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: 30000, // 30 secondes timeout
            maxBuffer: 1024 * 1024, // 1MB
        });
        return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
        throw new Error(`systemctl failed: ${error.message}`);
    }
}

class SystemdManager {
    constructor(options = {}) {
        this.systemdDir = options.systemdDir || SYSTEMD_DIR;
        this.dryRun = options.dryRun || false;
    }

    /**
     * Vérifie si systemd est disponible
     * @returns {Promise<boolean>}
     */
    async isSystemdAvailable() {
        try {
            await execAsync('systemctl --version');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Crée un fichier unit systemd pour un service
     * @param {string} serviceName - Nom du service (ex: twoine-site1-frontend)
     * @param {string} unitContent - Contenu du fichier unit
     * @returns {Promise<void>}
     */
    async createUnitFile(serviceName, unitContent) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        const unitPath = path.join(this.systemdDir, `${serviceName}.service`);

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create: ${unitPath}`);
            console.log(unitContent);
            return;
        }

        // Écrire via sudo
        const tempPath = `/tmp/${serviceName}.service.tmp`;
        await fs.writeFile(tempPath, unitContent, 'utf8');
        
        try {
            await execAsync(`${SUDO_PATH} mv ${escapeShellArg(tempPath)} ${escapeShellArg(unitPath)}`);
            await execAsync(`${SUDO_PATH} chmod 644 ${escapeShellArg(unitPath)}`);
            await execAsync(`${SUDO_PATH} chown root:root ${escapeShellArg(unitPath)}`);
        } catch (error) {
            // Nettoyer le fichier temp si erreur
            await fs.unlink(tempPath).catch(() => {});
            throw error;
        }
    }

    /**
     * Supprime un fichier unit systemd
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async removeUnitFile(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        const unitPath = path.join(this.systemdDir, `${serviceName}.service`);

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would remove: ${unitPath}`);
            return;
        }

        try {
            await execAsync(`${SUDO_PATH} rm -f ${escapeShellArg(unitPath)}`);
        } catch (error) {
            throw new Error(`Failed to remove unit file: ${error.message}`);
        }
    }

    /**
     * Recharge la configuration systemd
     * @returns {Promise<void>}
     */
    async daemonReload() {
        if (this.dryRun) {
            console.log('[DRY-RUN] Would run: systemctl daemon-reload');
            return;
        }

        await systemctl('daemon-reload');
    }

    /**
     * Active un service (enable)
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async enableService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would enable: ${serviceName}`);
            return;
        }

        await systemctl('enable', `${serviceName}.service`);
    }

    /**
     * Désactive un service (disable)
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async disableService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would disable: ${serviceName}`);
            return;
        }

        await systemctl('disable', `${serviceName}.service`);
    }

    /**
     * Démarre un service
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async startService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would start: ${serviceName}`);
            return;
        }

        await systemctl('start', `${serviceName}.service`);
    }

    /**
     * Arrête un service
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async stopService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would stop: ${serviceName}`);
            return;
        }

        await systemctl('stop', `${serviceName}.service`);
    }

    /**
     * Redémarre un service
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async restartService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would restart: ${serviceName}`);
            return;
        }

        await systemctl('restart', `${serviceName}.service`);
    }

    /**
     * Recharge un service (reload)
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async reloadService(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would reload: ${serviceName}`);
            return;
        }

        await systemctl('reload', `${serviceName}.service`);
    }

    /**
     * Obtient le statut d'un service
     * @param {string} serviceName 
     * @returns {Promise<ServiceStatus>}
     */
    async getServiceStatus(serviceName) {
        if (!validateServiceName(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }

        const status = {
            name: serviceName,
            active: 'unknown',
            enabled: false,
            running: false,
            pid: null,
            uptime: null,
            memory: null,
            cpu: null,
            lastStateChange: null,
            failureCount: 0,
            error: null,
        };

        try {
            // Vérifier si le service est actif
            const { stdout: activeState } = await systemctl('is-active', `${serviceName}.service`).catch(() => ({ stdout: 'inactive' }));
            status.active = activeState.trim();
            status.running = status.active === 'active';

            // Vérifier si le service est enabled
            const { stdout: enabledState } = await systemctl('is-enabled', `${serviceName}.service`).catch(() => ({ stdout: 'disabled' }));
            status.enabled = enabledState.trim() === 'enabled';

            // Obtenir les détails via show
            const { stdout: showOutput } = await systemctl(
                'show',
                `${serviceName}.service`,
                '--property=MainPID,ActiveEnterTimestamp,MemoryCurrent,CPUUsageNSec,NRestarts,Result'
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
                status.pid = parseInt(props.MainPID, 10);
            }

            // Uptime
            if (props.ActiveEnterTimestamp && props.ActiveEnterTimestamp !== '') {
                const startTime = new Date(props.ActiveEnterTimestamp);
                if (!isNaN(startTime.getTime())) {
                    status.uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
                    status.lastStateChange = startTime;
                }
            }

            // Memory (en bytes, convertir en MB)
            if (props.MemoryCurrent && props.MemoryCurrent !== '[not set]') {
                const memBytes = parseInt(props.MemoryCurrent, 10);
                if (!isNaN(memBytes)) {
                    status.memory = Math.round(memBytes / (1024 * 1024) * 100) / 100;
                }
            }

            // CPU (en nanosecondes)
            if (props.CPUUsageNSec && props.CPUUsageNSec !== '[not set]') {
                const cpuNs = parseInt(props.CPUUsageNSec, 10);
                if (!isNaN(cpuNs)) {
                    status.cpu = Math.round(cpuNs / 1000000) / 1000; // Convertir en secondes
                }
            }

            // Nombre de restarts
            if (props.NRestarts) {
                status.failureCount = parseInt(props.NRestarts, 10) || 0;
            }

            // Résultat (erreur si échec)
            if (props.Result && props.Result !== 'success') {
                status.error = props.Result;
            }

        } catch (error) {
            status.error = error.message;
        }

        return status;
    }

    /**
     * Obtient le statut de plusieurs services
     * @param {string[]} serviceNames 
     * @returns {Promise<Map<string, ServiceStatus>>}
     */
    async getMultipleServicesStatus(serviceNames) {
        const results = new Map();
        
        // Exécuter en parallèle avec limite de concurrence
        const batchSize = 10;
        for (let i = 0; i < serviceNames.length; i += batchSize) {
            const batch = serviceNames.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(name => this.getServiceStatus(name).catch(err => ({
                    name,
                    active: 'error',
                    running: false,
                    error: err.message,
                })))
            );
            batchResults.forEach(status => results.set(status.name, status));
        }
        
        return results;
    }

    /**
     * Vérifie si un service existe
     * @param {string} serviceName 
     * @returns {Promise<boolean>}
     */
    async serviceExists(serviceName) {
        if (!validateServiceName(serviceName)) {
            return false;
        }

        try {
            const unitPath = path.join(this.systemdDir, `${serviceName}.service`);
            await fs.access(unitPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Liste tous les services Twoine
     * @returns {Promise<string[]>}
     */
    async listTwoineServices() {
        try {
            const { stdout } = await systemctl('list-units', '--type=service', '--all', '--no-pager', '--plain');
            
            const services = [];
            const lines = stdout.split('\n');
            
            for (const line of lines) {
                const match = line.match(/^(twoine-[a-z][a-z0-9_-]+-[a-z][a-z0-9_-]+)\.service/);
                if (match) {
                    services.push(match[1]);
                }
            }
            
            return services;
        } catch {
            return [];
        }
    }

    /**
     * Crée et active un nouveau service
     * @param {string} serviceName 
     * @param {string} unitContent 
     * @param {boolean} startImmediately 
     * @returns {Promise<void>}
     */
    async setupService(serviceName, unitContent, startImmediately = false) {
        // 1. Créer le fichier unit
        await this.createUnitFile(serviceName, unitContent);
        
        // 2. Recharger systemd
        await this.daemonReload();
        
        // 3. Activer le service
        await this.enableService(serviceName);
        
        // 4. Démarrer si demandé
        if (startImmediately) {
            await this.startService(serviceName);
        }
    }

    /**
     * Supprime complètement un service
     * @param {string} serviceName 
     * @returns {Promise<void>}
     */
    async teardownService(serviceName) {
        // 1. Arrêter le service s'il tourne
        try {
            await this.stopService(serviceName);
        } catch {
            // Ignorer si déjà arrêté
        }
        
        // 2. Désactiver le service
        try {
            await this.disableService(serviceName);
        } catch {
            // Ignorer si déjà désactivé
        }
        
        // 3. Supprimer le fichier unit
        await this.removeUnitFile(serviceName);
        
        // 4. Recharger systemd
        await this.daemonReload();
    }

    /**
     * Met à jour un service existant
     * @param {string} serviceName 
     * @param {string} unitContent 
     * @param {boolean} restartIfRunning 
     * @returns {Promise<void>}
     */
    async updateService(serviceName, unitContent, restartIfRunning = true) {
        const status = await this.getServiceStatus(serviceName);
        const wasRunning = status.running;
        
        // 1. Mettre à jour le fichier unit
        await this.createUnitFile(serviceName, unitContent);
        
        // 2. Recharger systemd
        await this.daemonReload();
        
        // 3. Redémarrer si nécessaire
        if (wasRunning && restartIfRunning) {
            await this.restartService(serviceName);
        }
    }
}

// Export singleton et classe
const defaultManager = new SystemdManager();

module.exports = {
    SystemdManager,
    systemdManager: defaultManager,
    validateServiceName,
};
