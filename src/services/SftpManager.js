/**
 * TWOINE - SFTP Manager Service
 * Gestion des utilisateurs SFTP (création, suppression, reset password)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const Site = require('../models/Site');

const execAsync = promisify(exec);

// Configuration
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || '/opt/twoine/scripts';
const SITES_DIR = process.env.SITES_DIR || '/var/www/sites';

class SftpManager {
    constructor(options = {}) {
        this.scriptsDir = options.scriptsDir || SCRIPTS_DIR;
        this.sitesDir = options.sitesDir || SITES_DIR;
        this.dryRun = options.dryRun || false;
    }

    /**
     * Génère un mot de passe aléatoire sécurisé
     * @param {number} length - Longueur du mot de passe
     * @returns {string}
     */
    generatePassword(length = 20) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            password += charset[randomBytes[i] % charset.length];
        }
        return password;
    }

    /**
     * Crée un utilisateur SFTP pour un site
     * @param {string} siteName - Nom du site
     * @param {string} [password] - Mot de passe (généré si non fourni)
     * @returns {Promise<Object>} - Informations du compte SFTP
     */
    async createSftpUser(siteName, password = null) {
        if (!this.validateSiteName(siteName)) {
            throw new Error('Invalid site name format');
        }

        const sftpPassword = password || this.generatePassword();

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create SFTP user for site: ${siteName}`);
            return {
                success: true,
                username: `site_${siteName}`,
                password: sftpPassword,
                homeDir: `${this.sitesDir}/${siteName}`,
                dryRun: true,
            };
        }

        try {
            const scriptPath = `${this.scriptsDir}/sftp-user-create.sh`;
            const { stdout, stderr } = await execAsync(
                `sudo "${scriptPath}" "${siteName}" "${sftpPassword}"`,
                { timeout: 30000 }
            );

            // Parser la sortie JSON
            const jsonMatch = stdout.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    ...result,
                    password: sftpPassword,
                };
            }

            return {
                success: true,
                username: `site_${siteName}`,
                password: sftpPassword,
                homeDir: `${this.sitesDir}/${siteName}`,
            };
        } catch (error) {
            throw new Error(`Failed to create SFTP user: ${error.message}`);
        }
    }

    /**
     * Supprime un utilisateur SFTP
     * @param {string} siteName - Nom du site
     * @param {boolean} deleteFiles - Supprimer également les fichiers
     * @returns {Promise<Object>}
     */
    async deleteSftpUser(siteName, deleteFiles = false) {
        if (!this.validateSiteName(siteName)) {
            throw new Error('Invalid site name format');
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete SFTP user for site: ${siteName}`);
            return { success: true, username: `site_${siteName}`, dryRun: true };
        }

        try {
            const scriptPath = `${this.scriptsDir}/sftp-user-delete.sh`;
            const deleteFlag = deleteFiles ? '--delete-files' : '';
            const { stdout } = await execAsync(
                `sudo "${scriptPath}" "${siteName}" ${deleteFlag}`,
                { timeout: 30000 }
            );

            const jsonMatch = stdout.match(/\{[^}]+\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return { success: true, username: `site_${siteName}` };
        } catch (error) {
            throw new Error(`Failed to delete SFTP user: ${error.message}`);
        }
    }

    /**
     * Réinitialise le mot de passe SFTP
     * @param {string} siteName - Nom du site
     * @param {string} [newPassword] - Nouveau mot de passe (généré si non fourni)
     * @returns {Promise<Object>}
     */
    async resetPassword(siteName, newPassword = null) {
        if (!this.validateSiteName(siteName)) {
            throw new Error('Invalid site name format');
        }

        const password = newPassword || this.generatePassword();

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would reset password for site: ${siteName}`);
            return {
                success: true,
                username: `site_${siteName}`,
                password,
                dryRun: true,
            };
        }

        try {
            const scriptPath = `${this.scriptsDir}/sftp-password-reset.sh`;
            const { stdout } = await execAsync(
                `sudo "${scriptPath}" "${siteName}" "${password}"`,
                { timeout: 30000 }
            );

            const jsonMatch = stdout.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return { ...result, password };
            }

            return {
                success: true,
                username: `site_${siteName}`,
                password,
            };
        } catch (error) {
            throw new Error(`Failed to reset SFTP password: ${error.message}`);
        }
    }

    /**
     * Active ou désactive l'accès SFTP
     * @param {string} siteName - Nom du site
     * @param {boolean} enable - Activer (true) ou désactiver (false)
     * @returns {Promise<Object>}
     */
    async setAccessEnabled(siteName, enable) {
        if (!this.validateSiteName(siteName)) {
            throw new Error('Invalid site name format');
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would ${enable ? 'enable' : 'disable'} SFTP for site: ${siteName}`);
            return {
                success: true,
                username: `site_${siteName}`,
                enabled: enable,
                dryRun: true,
            };
        }

        try {
            const scriptPath = `${this.scriptsDir}/sftp-user-disable.sh`;
            const action = enable ? 'enable' : 'disable';
            const { stdout } = await execAsync(
                `sudo "${scriptPath}" "${siteName}" "${action}"`,
                { timeout: 30000 }
            );

            const jsonMatch = stdout.match(/\{[^}]+\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            return {
                success: true,
                username: `site_${siteName}`,
                enabled: enable,
            };
        } catch (error) {
            throw new Error(`Failed to ${enable ? 'enable' : 'disable'} SFTP: ${error.message}`);
        }
    }

    /**
     * Obtient les informations SFTP pour un site
     * @param {string} siteId - ID du site
     * @returns {Promise<Object>}
     */
    async getSftpInfo(siteId) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        const username = site.linuxUser.username;
        let userExists = false;
        let isEnabled = false;

        try {
            const { stdout } = await execAsync(`id ${username}`);
            userExists = true;

            // Vérifier si le compte est verrouillé
            const { stdout: passwdStatus } = await execAsync(`sudo passwd -S ${username}`);
            isEnabled = !passwdStatus.includes(' L ');
        } catch {
            userExists = false;
        }

        return {
            username,
            homeDir: site.paths.root,
            host: process.env.SFTP_HOST || 'localhost',
            port: parseInt(process.env.SFTP_PORT || '22', 10),
            userExists,
            isEnabled,
            connectionString: `sftp://${username}@${process.env.SFTP_HOST || 'localhost'}:${process.env.SFTP_PORT || '22'}`,
        };
    }

    /**
     * Valide le format du nom de site
     * @param {string} name 
     * @returns {boolean}
     */
    validateSiteName(name) {
        const pattern = /^[a-z][a-z0-9_-]{2,29}$/;
        return pattern.test(name);
    }
}

// Export singleton et classe
const defaultManager = new SftpManager();

module.exports = {
    SftpManager,
    sftpManager: defaultManager,
};
