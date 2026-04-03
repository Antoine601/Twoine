/**
 * Module d'exécution de commandes shell
 */

import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';

const execAsync = promisify(exec);

/**
 * Exécute une commande shell de manière synchrone
 * @param {string} command - Commande à exécuter
 * @param {object} options - Options d'exécution
 * @returns {string} - Sortie de la commande
 */
export function execSyncSafe(command, options = {}) {
    try {
        logger.debug(`Executing: ${command}`);
        const result = execSync(command, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options
        });
        return result.trim();
    } catch (error) {
        logger.debug(`Command failed: ${command} - ${error.message}`);
        throw error;
    }
}

/**
 * Exécute une commande shell de manière asynchrone
 * @param {string} command - Commande à exécuter
 * @param {object} options - Options d'exécution
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function execCommand(command, options = {}) {
    try {
        logger.debug(`Executing async: ${command}`);
        const { stdout, stderr } = await execAsync(command, {
            encoding: 'utf8',
            ...options
        });
        return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
        logger.debug(`Async command failed: ${command} - ${error.message}`);
        throw error;
    }
}

/**
 * Vérifie si une commande existe dans le système
 * @param {string} command - Nom de la commande
 * @returns {boolean}
 */
export function commandExists(command) {
    try {
        execSyncSafe(`which ${command}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Vérifie si l'utilisateur est root
 * @returns {boolean}
 */
export function isRoot() {
    try {
        const uid = execSyncSafe('id -u');
        return uid === '0';
    } catch {
        return false;
    }
}

/**
 * Vérifie si un utilisateur Linux existe
 * @param {string} username - Nom d'utilisateur
 * @returns {boolean}
 */
export function userExists(username) {
    try {
        execSyncSafe(`id ${username}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Vérifie si un groupe Linux existe
 * @param {string} groupname - Nom du groupe
 * @returns {boolean}
 */
export function groupExists(groupname) {
    try {
        execSyncSafe(`getent group ${groupname}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Redémarre le service SSH
 * @returns {Promise<void>}
 */
export async function restartSSH() {
    try {
        await execCommand('systemctl restart sshd');
        logger.success('Service SSH redémarré');
    } catch (error) {
        // Essayer avec ssh au lieu de sshd sur certains systèmes
        try {
            await execCommand('systemctl restart ssh');
            logger.success('Service SSH redémarré');
        } catch (e) {
            throw new Error(`Impossible de redémarrer SSH: ${e.message}`);
        }
    }
}

/**
 * Vérifie la configuration SSH
 * @returns {Promise<boolean>}
 */
export async function testSSHConfig() {
    try {
        await execCommand('sshd -t');
        return true;
    } catch (error) {
        logger.error(`Configuration SSH invalide: ${error.message}`);
        return false;
    }
}

/**
 * Exécute une commande PM2
 * @param {string} args - Arguments PM2
 * @returns {Promise<string>}
 */
export async function pm2Command(args) {
    try {
        const { stdout } = await execCommand(`pm2 ${args}`);
        return stdout;
    } catch (error) {
        throw new Error(`Erreur PM2: ${error.message}`);
    }
}

/**
 * Récupère le statut d'un processus PM2
 * @param {string} processName - Nom du processus
 * @returns {Promise<object|null>}
 */
export async function getPm2ProcessStatus(processName) {
    try {
        const { stdout } = await execCommand('pm2 jlist');
        const processes = JSON.parse(stdout);
        return processes.find(p => p.name === processName) || null;
    } catch {
        return null;
    }
}

/**
 * Récupère les logs d'un processus PM2
 * @param {string} processName - Nom du processus
 * @param {number} lines - Nombre de lignes
 * @returns {Promise<string>}
 */
export async function getPm2Logs(processName, lines = 50) {
    try {
        const { stdout } = await execCommand(`pm2 logs ${processName} --nostream --lines ${lines}`);
        return stdout;
    } catch (error) {
        throw new Error(`Impossible de récupérer les logs: ${error.message}`);
    }
}

export default {
    execSyncSafe,
    execCommand,
    commandExists,
    isRoot,
    userExists,
    groupExists,
    restartSSH,
    testSSHConfig,
    pm2Command,
    getPm2ProcessStatus,
    getPm2Logs
};
