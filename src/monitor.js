/**
 * TWOINE - System Monitor
 * 
 * Ce service surveille l'état du système et collecte les métriques:
 * - Santé des services
 * - Utilisation des ressources
 * - Métriques des sites
 * - Alertes automatiques
 */

require('dotenv').config();
const mongoose = require('mongoose');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/twoine';
const API_PORT = process.env.PORT || 3000;
const LOG_PREFIX = '[MONITOR]';

// Intervalles de collecte (en millisecondes)
const INTERVALS = {
    SYSTEM_METRICS: 60 * 1000,      // 1 minute
    SERVICE_CHECK: 30 * 1000,        // 30 secondes
    SITE_METRICS: 5 * 60 * 1000,     // 5 minutes
    DISK_CHECK: 10 * 60 * 1000       // 10 minutes
};

// Seuils d'alerte
const THRESHOLDS = {
    CPU_PERCENT: 90,
    MEMORY_PERCENT: 85,
    DISK_PERCENT: 90
};

// État du moniteur
let isRunning = false;
let timers = [];
let lastMetrics = {};

/**
 * Logger avec timestamp
 */
function log(level, message) {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${LOG_PREFIX} [${level.toUpperCase()}] ${message}`;
    if (level === 'error' || level === 'warn') {
        console.error(line);
    } else {
        console.log(line);
    }
}

/**
 * Connexion à MongoDB
 */
async function connectDatabase(retries = 5, delay = 3000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await mongoose.connect(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000
            });
            log('info', 'Connected to MongoDB');
            return true;
        } catch (error) {
            log('error', `MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);
            if (attempt < retries) {
                log('info', `Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                delay = Math.min(delay * 2, 30000);
            }
        }
    }
    return false;
}

/**
 * Collecter les métriques système
 */
async function collectSystemMetrics() {
    try {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        // Calcul CPU (moyenne sur tous les cores)
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        const cpuPercent = Math.round(100 - (totalIdle / totalTick * 100));
        const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
        
        const metrics = {
            timestamp: new Date(),
            type: 'system',
            cpu: {
                percent: cpuPercent,
                cores: cpus.length,
                loadAvg: os.loadavg()
            },
            memory: {
                total: totalMemory,
                used: usedMemory,
                free: freeMemory,
                percent: memoryPercent
            },
            uptime: os.uptime()
        };
        
        // Sauvegarder les métriques
        await saveMetrics(metrics);
        
        // Vérifier les seuils
        if (cpuPercent > THRESHOLDS.CPU_PERCENT) {
            log('warn', `High CPU usage: ${cpuPercent}%`);
        }
        
        if (memoryPercent > THRESHOLDS.MEMORY_PERCENT) {
            log('warn', `High memory usage: ${memoryPercent}%`);
        }
        
        lastMetrics.system = metrics;
        
    } catch (error) {
        log('error', `System metrics collection failed: ${error.message}`);
    }
}

/**
 * Vérifier l'espace disque
 */
async function checkDiskSpace() {
    try {
        const { execSync } = require('child_process');
        
        // Obtenir l'utilisation du disque principal
        const dfOutput = execSync("df -B1 / | tail -1 | awk '{print $2, $3, $4}'", {
            encoding: 'utf8'
        }).trim();
        
        const [total, used, available] = dfOutput.split(' ').map(Number);
        const percent = Math.round((used / total) * 100);
        
        const metrics = {
            timestamp: new Date(),
            type: 'disk',
            total,
            used,
            available,
            percent
        };
        
        await saveMetrics(metrics);
        
        if (percent > THRESHOLDS.DISK_PERCENT) {
            log('warn', `High disk usage: ${percent}%`);
        }
        
        lastMetrics.disk = metrics;
        
    } catch (error) {
        log('error', `Disk check failed: ${error.message}`);
    }
}

/**
 * Vérifier la santé des services
 */
async function checkServiceHealth() {
    const services = {
        api: { url: `http://localhost:${API_PORT}/api/health`, status: 'unknown' },
        mongodb: { status: 'unknown' }
    };
    
    // Vérifier l'API
    try {
        const response = await httpGet(`http://localhost:${API_PORT}/api/health`);
        services.api.status = response ? 'healthy' : 'unhealthy';
        services.api.responseTime = response?.responseTime;
    } catch (error) {
        services.api.status = 'unhealthy';
        services.api.error = error.message;
        log('warn', `API health check failed: ${error.message}`);
    }
    
    // Vérifier MongoDB
    try {
        if (mongoose.connection.readyState === 1) {
            const start = Date.now();
            await mongoose.connection.db.admin().ping();
            services.mongodb.status = 'healthy';
            services.mongodb.responseTime = Date.now() - start;
        } else {
            services.mongodb.status = 'disconnected';
        }
    } catch (error) {
        services.mongodb.status = 'unhealthy';
        services.mongodb.error = error.message;
        log('warn', `MongoDB health check failed: ${error.message}`);
    }
    
    const metrics = {
        timestamp: new Date(),
        type: 'services',
        services
    };
    
    await saveMetrics(metrics);
    lastMetrics.services = metrics;
}

/**
 * Collecter les métriques des sites
 */
async function collectSiteMetrics() {
    try {
        const sitesDir = process.env.SITES_DIR || '/var/www/twoine';
        
        const sites = await fs.readdir(sitesDir).catch(() => []);
        const siteMetrics = [];
        
        for (const siteName of sites) {
            const sitePath = path.join(sitesDir, siteName);
            const stat = await fs.stat(sitePath).catch(() => null);
            
            if (stat && stat.isDirectory()) {
                // Calculer la taille du site
                const size = await getDirSize(sitePath);
                
                siteMetrics.push({
                    name: siteName,
                    size,
                    lastModified: stat.mtime
                });
            }
        }
        
        const metrics = {
            timestamp: new Date(),
            type: 'sites',
            count: siteMetrics.length,
            sites: siteMetrics
        };
        
        await saveMetrics(metrics);
        lastMetrics.sites = metrics;
        
    } catch (error) {
        log('error', `Site metrics collection failed: ${error.message}`);
    }
}

/**
 * Effectuer une requête HTTP GET
 */
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        
        const req = http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    parsed.responseTime = Date.now() - start;
                    resolve(parsed);
                } catch {
                    resolve({ status: 'ok', responseTime: Date.now() - start });
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Calculer la taille d'un répertoire
 */
async function getDirSize(dirPath) {
    let size = 0;
    
    try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            
            if (file.isDirectory()) {
                size += await getDirSize(filePath);
            } else {
                const stat = await fs.stat(filePath).catch(() => ({ size: 0 }));
                size += stat.size;
            }
        }
    } catch {
        // Ignorer les erreurs de permission
    }
    
    return size;
}

/**
 * Sauvegarder les métriques en base de données
 */
async function saveMetrics(metrics) {
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.collection('metrics').insertOne(metrics);
        }
    } catch (error) {
        log('error', `Failed to save metrics: ${error.message}`);
    }
}

/**
 * Obtenir les dernières métriques (pour API interne)
 */
function getLastMetrics() {
    return {
        ...lastMetrics,
        collectedAt: new Date()
    };
}

/**
 * Démarrage de la collecte de métriques
 */
function startMetricsCollection() {
    log('info', 'Starting metrics collection...');
    
    // Métriques système
    timers.push(setInterval(collectSystemMetrics, INTERVALS.SYSTEM_METRICS));
    
    // Vérification des services
    timers.push(setInterval(checkServiceHealth, INTERVALS.SERVICE_CHECK));
    
    // Métriques des sites
    timers.push(setInterval(collectSiteMetrics, INTERVALS.SITE_METRICS));
    
    // Vérification disque
    timers.push(setInterval(checkDiskSpace, INTERVALS.DISK_CHECK));
    
    log('info', 'Metrics collection started');
}

/**
 * Arrêt propre du moniteur
 */
async function shutdown(signal) {
    log('info', `Received ${signal}, shutting down...`);
    
    isRunning = false;
    
    // Annuler tous les timers
    timers.forEach(timer => clearInterval(timer));
    timers = [];
    
    // Fermer la connexion MongoDB
    try {
        await mongoose.connection.close();
        log('info', 'MongoDB connection closed');
    } catch (error) {
        log('error', `Error closing MongoDB: ${error.message}`);
    }
    
    log('info', 'Monitor shutdown complete');
    process.exit(0);
}

/**
 * Point d'entrée principal
 */
async function main() {
    log('info', 'Twoine Monitor starting...');
    log('info', `Node.js ${process.version}`);
    log('info', `Environment: ${process.env.NODE_ENV || 'development'}`);
    log('info', `WorkingDirectory: ${process.cwd()}`);
    log('info', `MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@')}`);
    
    // Gestionnaires de signaux
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => {
        log('info', 'Received SIGHUP, reloading configuration...');
    });
    
    // Connexion à la base de données avec retry
    const connected = await connectDatabase(5, 3000);
    if (!connected) {
        log('error', 'Failed to connect to database after 5 attempts, exiting...');
        process.exit(1);
    }
    
    // Démarrer la collecte
    isRunning = true;
    startMetricsCollection();
    
    // Collecte initiale
    await collectSystemMetrics();
    await checkServiceHealth();
    await checkDiskSpace();
    
    log('info', 'Twoine Monitor is ready');
}

// Exporter pour utilisation comme module
module.exports = { getLastMetrics };

// Lancer le moniteur
main().catch(error => {
    log('error', `Fatal error: ${error.message}`);
    process.exit(1);
});
