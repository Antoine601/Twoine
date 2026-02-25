/**
 * Module de logging pour l'outil de gestion de projets
 */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Chemin du fichier de log
const LOG_DIR = '/var/log/nodejs-project-manager';
const LOG_FILE = path.join(LOG_DIR, 'manager.log');

/**
 * Initialise le dossier de logs
 */
export function initLogDir() {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    } catch (error) {
        // Silently fail if we can't create log dir (might not be root)
    }
}

/**
 * Écrit un message dans le fichier de log
 * @param {string} level - Niveau de log (INFO, ERROR, WARN, DEBUG)
 * @param {string} message - Message à logger
 */
function writeToFile(level, message) {
    try {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] ${message}\n`;
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        // Silently fail if we can't write to log file
    }
}

/**
 * Log un message d'information
 * @param {string} message - Message à afficher
 */
export function info(message) {
    console.log(chalk.cyan('ℹ ') + message);
    writeToFile('INFO', message);
}

/**
 * Log un message de succès
 * @param {string} message - Message à afficher
 */
export function success(message) {
    console.log(chalk.green('✔ ') + message);
    writeToFile('INFO', message);
}

/**
 * Log un message d'erreur
 * @param {string} message - Message à afficher
 */
export function error(message) {
    console.log(chalk.red('✖ ') + message);
    writeToFile('ERROR', message);
}

/**
 * Log un message d'avertissement
 * @param {string} message - Message à afficher
 */
export function warn(message) {
    console.log(chalk.yellow('⚠ ') + message);
    writeToFile('WARN', message);
}

/**
 * Log un message de debug (non affiché par défaut)
 * @param {string} message - Message à logger
 */
export function debug(message) {
    writeToFile('DEBUG', message);
    if (process.env.DEBUG) {
        console.log(chalk.gray('🔍 ') + message);
    }
}

/**
 * Affiche un titre de section
 * @param {string} title - Titre de la section
 */
export function section(title) {
    console.log('\n' + chalk.bold.blue('═══ ' + title + ' ═══') + '\n');
}

/**
 * Affiche une ligne vide
 */
export function newline() {
    console.log('');
}

export default {
    initLogDir,
    info,
    success,
    error,
    warn,
    debug,
    section,
    newline
};
