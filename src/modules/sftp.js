/**
 * Module de gestion des utilisateurs SFTP et configuration SSH
 */

import fs from 'fs';
import path from 'path';
import { SFTP_USER_PREFIX, SFTP_GROUP, SSH_CONFIG_PATH, BASE_PATH } from '../config/constants.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';

/**
 * Configuration SFTP à ajouter dans sshd_config
 */
const SFTP_CONFIG_MARKER = '# === NODEJS TWOINE SFTP CONFIG ===';
const SFTP_CONFIG_END_MARKER = '# === END NODEJS TWOINE SFTP CONFIG ===';

/**
 * Crée le groupe SFTP s'il n'existe pas
 * @returns {Promise<void>}
 */
export async function ensureSftpGroup() {
    if (!shell.groupExists(SFTP_GROUP)) {
        logger.info(`Création du groupe ${SFTP_GROUP}...`);
        await shell.execCommand(`groupadd ${SFTP_GROUP}`);
        logger.success(`Groupe ${SFTP_GROUP} créé`);
    } else {
        logger.debug(`Groupe ${SFTP_GROUP} existe déjà`);
    }
}

/**
 * Crée un utilisateur SFTP pour un projet
 * @param {string} projectName - Nom du projet
 * @param {string} password - Mot de passe de l'utilisateur
 * @returns {Promise<string>} - Nom de l'utilisateur créé
 */
export async function createSftpUser(projectName, password) {
    const username = `${SFTP_USER_PREFIX}${projectName}`;
    const projectPath = path.join(BASE_PATH, projectName);
    const sitesPath = path.join(projectPath, 'sites');

    // Vérifier si l'utilisateur existe déjà
    if (shell.userExists(username)) {
        throw new Error(`L'utilisateur ${username} existe déjà`);
    }

    // S'assurer que le groupe SFTP existe
    await ensureSftpGroup();

    logger.info(`Création de l'utilisateur ${username}...`);

    // Créer l'utilisateur avec le groupe SFTP, sans shell
    await shell.execCommand(
        `useradd -g ${SFTP_GROUP} -d ${projectPath} -s /usr/sbin/nologin ${username}`
    );

    // Définir le mot de passe
    await shell.execCommand(`echo "${username}:${password}" | chpasswd`);

    // Configurer les permissions pour le chroot SFTP
    // Le dossier racine doit appartenir à root pour le chroot
    await shell.execCommand(`chown root:root ${projectPath}`);
    await shell.execCommand(`chmod 755 ${projectPath}`);

    // Le dossier sites appartient à l'utilisateur SFTP
    await shell.execCommand(`chown ${username}:${SFTP_GROUP} ${sitesPath}`);
    await shell.execCommand(`chmod 755 ${sitesPath}`);

    logger.success(`Utilisateur ${username} créé avec succès`);
    return username;
}

/**
 * Supprime un utilisateur SFTP
 * @param {string} projectName - Nom du projet
 * @returns {Promise<void>}
 */
export async function deleteSftpUser(projectName) {
    const username = `${SFTP_USER_PREFIX}${projectName}`;

    if (!shell.userExists(username)) {
        logger.warn(`L'utilisateur ${username} n'existe pas`);
        return;
    }

    logger.info(`Suppression de l'utilisateur ${username}...`);
    
    // Tuer tous les processus de l'utilisateur
    try {
        await shell.execCommand(`pkill -u ${username}`);
    } catch {
        // Ignorer si aucun processus n'est en cours
    }

    // Supprimer l'utilisateur
    await shell.execCommand(`userdel ${username}`);
    logger.success(`Utilisateur ${username} supprimé`);
}

/**
 * Lit la configuration SSH actuelle
 * @returns {string}
 */
function readSSHConfig() {
    try {
        return fs.readFileSync(SSH_CONFIG_PATH, 'utf8');
    } catch (error) {
        throw new Error(`Impossible de lire ${SSH_CONFIG_PATH}: ${error.message}`);
    }
}

/**
 * Écrit la configuration SSH
 * @param {string} content - Contenu de la configuration
 */
function writeSSHConfig(content) {
    try {
        // Créer une sauvegarde
        const backupPath = `${SSH_CONFIG_PATH}.backup.${Date.now()}`;
        fs.copyFileSync(SSH_CONFIG_PATH, backupPath);
        logger.debug(`Backup créé: ${backupPath}`);

        fs.writeFileSync(SSH_CONFIG_PATH, content);
    } catch (error) {
        throw new Error(`Impossible d'écrire ${SSH_CONFIG_PATH}: ${error.message}`);
    }
}

/**
 * Génère la configuration SFTP pour tous les projets
 * @param {Array} projects - Liste des projets
 * @returns {string}
 */
function generateSftpConfig(projects) {
    if (!projects || projects.length === 0) {
        return '';
    }

    let config = `\n${SFTP_CONFIG_MARKER}\n`;
    config += `# Configuration générée automatiquement - Ne pas modifier manuellement\n\n`;

    // Configuration du groupe SFTP
    config += `Match Group ${SFTP_GROUP}\n`;
    config += `    ChrootDirectory %h\n`;
    config += `    ForceCommand internal-sftp\n`;
    config += `    AllowTcpForwarding no\n`;
    config += `    X11Forwarding no\n`;
    config += `    PasswordAuthentication yes\n`;

    config += `\n${SFTP_CONFIG_END_MARKER}\n`;

    return config;
}

/**
 * Met à jour la configuration SSH pour le SFTP
 * @param {Array} projects - Liste des projets
 * @returns {Promise<void>}
 */
export async function updateSSHConfig(projects) {
    logger.info('Mise à jour de la configuration SSH...');

    let sshConfig = readSSHConfig();

    // Supprimer l'ancienne configuration du projet manager
    const startIndex = sshConfig.indexOf(SFTP_CONFIG_MARKER);
    const endIndex = sshConfig.indexOf(SFTP_CONFIG_END_MARKER);

    if (startIndex !== -1 && endIndex !== -1) {
        sshConfig = sshConfig.substring(0, startIndex) + 
                    sshConfig.substring(endIndex + SFTP_CONFIG_END_MARKER.length);
    }

    // Ajouter la nouvelle configuration
    const newConfig = generateSftpConfig(projects);
    sshConfig = sshConfig.trimEnd() + newConfig;

    // Écrire la configuration
    writeSSHConfig(sshConfig);

    // Tester la configuration
    const isValid = await shell.testSSHConfig();
    if (!isValid) {
        throw new Error('La configuration SSH générée est invalide');
    }

    // Redémarrer SSH
    await shell.restartSSH();
    logger.success('Configuration SSH mise à jour');
}

/**
 * Vérifie si la configuration SFTP de base est présente
 * @returns {boolean}
 */
export function isSftpConfigured() {
    const sshConfig = readSSHConfig();
    return sshConfig.includes(SFTP_CONFIG_MARKER);
}

/**
 * Renomme un utilisateur SFTP
 * @param {string} oldProjectName - Ancien nom du projet
 * @param {string} newProjectName - Nouveau nom du projet
 * @returns {Promise<void>}
 */
export async function renameSftpUser(oldProjectName, newProjectName) {
    const oldUsername = `${SFTP_USER_PREFIX}${oldProjectName}`;
    const newUsername = `${SFTP_USER_PREFIX}${newProjectName}`;

    if (!shell.userExists(oldUsername)) {
        throw new Error(`L'utilisateur ${oldUsername} n'existe pas`);
    }

    if (shell.userExists(newUsername)) {
        throw new Error(`L'utilisateur ${newUsername} existe déjà`);
    }

    logger.info(`Renommage de l'utilisateur ${oldUsername} vers ${newUsername}...`);

    // Renommer l'utilisateur avec usermod
    await shell.execCommand(`usermod -l ${newUsername} ${oldUsername}`);
    
    logger.success(`Utilisateur SFTP renommé: ${oldUsername} → ${newUsername}`);
}

/**
 * Change le mot de passe d'un utilisateur SFTP
 * @param {string} projectName - Nom du projet
 * @param {string} newPassword - Nouveau mot de passe
 * @returns {Promise<void>}
 */
export async function changeSftpPassword(projectName, newPassword) {
    const username = `${SFTP_USER_PREFIX}${projectName}`;

    if (!shell.userExists(username)) {
        throw new Error(`L'utilisateur ${username} n'existe pas`);
    }

    await shell.execCommand(`echo "${username}:${newPassword}" | chpasswd`);
    logger.success(`Mot de passe de ${username} modifié`);
}

/**
 * Récupère les informations d'un utilisateur SFTP
 * @param {string} projectName - Nom du projet
 * @returns {object|null}
 */
export function getSftpUserInfo(projectName) {
    const username = `${SFTP_USER_PREFIX}${projectName}`;

    if (!shell.userExists(username)) {
        return null;
    }

    try {
        const userInfo = shell.execSyncSafe(`id ${username}`);
        return {
            username,
            exists: true,
            info: userInfo
        };
    } catch {
        return null;
    }
}

export default {
    ensureSftpGroup,
    createSftpUser,
    deleteSftpUser,
    updateSSHConfig,
    isSftpConfigured,
    changeSftpPassword,
    getSftpUserInfo
};
