/**
 * TWOINE - Background Worker
 * 
 * Ce service gère les tâches asynchrones et planifiées:
 * - Nettoyage des fichiers temporaires
 * - Rotation des métriques
 * - Tâches de maintenance planifiées
 * - Traitement des jobs en file d'attente
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/twoine';
const LOG_PREFIX = '[WORKER]';

// Intervalles des tâches (en millisecondes)
const INTERVALS = {
    CLEANUP_TEMP: 60 * 60 * 1000,        // 1 heure
    CLEANUP_SESSIONS: 6 * 60 * 60 * 1000, // 6 heures
    METRICS_ROTATION: 24 * 60 * 60 * 1000, // 24 heures
    HEALTH_CHECK: 5 * 60 * 1000           // 5 minutes
};

// État du worker
let isRunning = false;
let timers = [];

/**
 * Logger avec timestamp
 */
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${LOG_PREFIX} [${level.toUpperCase()}] ${message}`);
}

/**
 * Connexion à MongoDB
 */
async function connectDatabase() {
    try {
        await mongoose.connect(MONGODB_URI);
        log('info', 'Connected to MongoDB');
        return true;
    } catch (error) {
        log('error', `MongoDB connection failed: ${error.message}`);
        return false;
    }
}

/**
 * Nettoyage des fichiers temporaires
 */
async function cleanupTempFiles() {
    log('info', 'Running temp files cleanup...');
    
    try {
        const fs = require('fs').promises;
        const path = require('path');
        const tmpDir = process.env.TMP_DIR || '/opt/twoine/tmp';
        
        const files = await fs.readdir(tmpDir).catch(() => []);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 heure
        
        let cleaned = 0;
        for (const file of files) {
            const filePath = path.join(tmpDir, file);
            const stats = await fs.stat(filePath).catch(() => null);
            
            if (stats && (now - stats.mtimeMs) > maxAge) {
                await fs.unlink(filePath).catch(() => {});
                cleaned++;
            }
        }
        
        log('info', `Temp cleanup completed: ${cleaned} files removed`);
    } catch (error) {
        log('error', `Temp cleanup failed: ${error.message}`);
    }
}

/**
 * Nettoyage des sessions expirées
 */
async function cleanupExpiredSessions() {
    log('info', 'Running expired sessions cleanup...');
    
    try {
        // Supprimer les tokens de rafraîchissement expirés
        const result = await mongoose.connection.db.collection('refreshtokens').deleteMany({
            expiresAt: { $lt: new Date() }
        });
        
        log('info', `Sessions cleanup completed: ${result.deletedCount} expired tokens removed`);
    } catch (error) {
        log('error', `Sessions cleanup failed: ${error.message}`);
    }
}

/**
 * Rotation des métriques anciennes
 */
async function rotateOldMetrics() {
    log('info', 'Running metrics rotation...');
    
    try {
        const retentionDays = parseInt(process.env.METRICS_RETENTION_DAYS) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        const result = await mongoose.connection.db.collection('metrics').deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        
        log('info', `Metrics rotation completed: ${result.deletedCount} old entries removed`);
    } catch (error) {
        log('error', `Metrics rotation failed: ${error.message}`);
    }
}

/**
 * Vérification de santé interne
 */
async function healthCheck() {
    try {
        // Vérifier la connexion MongoDB
        if (mongoose.connection.readyState !== 1) {
            log('warn', 'MongoDB connection lost, attempting reconnect...');
            await connectDatabase();
        }
    } catch (error) {
        log('error', `Health check failed: ${error.message}`);
    }
}

/**
 * Démarrage des tâches planifiées
 */
function startScheduledTasks() {
    log('info', 'Starting scheduled tasks...');
    
    // Nettoyage des fichiers temporaires
    timers.push(setInterval(cleanupTempFiles, INTERVALS.CLEANUP_TEMP));
    
    // Nettoyage des sessions
    timers.push(setInterval(cleanupExpiredSessions, INTERVALS.CLEANUP_SESSIONS));
    
    // Rotation des métriques
    timers.push(setInterval(rotateOldMetrics, INTERVALS.METRICS_ROTATION));
    
    // Health check
    timers.push(setInterval(healthCheck, INTERVALS.HEALTH_CHECK));
    
    log('info', 'Scheduled tasks started');
}

/**
 * Arrêt propre du worker
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
    
    log('info', 'Worker shutdown complete');
    process.exit(0);
}

/**
 * Point d'entrée principal
 */
async function main() {
    log('info', 'Twoine Worker starting...');
    log('info', `Node.js ${process.version}`);
    log('info', `Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Gestionnaires de signaux
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => {
        log('info', 'Received SIGHUP, reloading configuration...');
    });
    
    // Connexion à la base de données
    const connected = await connectDatabase();
    if (!connected) {
        log('error', 'Failed to connect to database, exiting...');
        process.exit(1);
    }
    
    // Démarrer les tâches planifiées
    isRunning = true;
    startScheduledTasks();
    
    // Exécuter un premier nettoyage au démarrage
    await cleanupTempFiles();
    await cleanupExpiredSessions();
    
    log('info', 'Twoine Worker is ready');
}

// Lancer le worker
main().catch(error => {
    log('error', `Fatal error: ${error.message}`);
    process.exit(1);
});
