/**
 * TWOINE - Site Manager Service
 * Gestion complète des sites hébergés (création, suppression, configuration)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const Site = require('../models/Site');
const Service = require('../models/Service');
const { SystemdManager } = require('./SystemdManager');
const { SftpManager } = require('./SftpManager');

const execAsync = promisify(exec);

// Chemins des scripts bash
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || '/opt/twoine/scripts';
const SITES_DIR = process.env.SITES_DIR || '/var/www/sites';

class SiteManager {
    constructor(options = {}) {
        this.sitesDir = options.sitesDir || SITES_DIR;
        this.scriptsDir = options.scriptsDir || SCRIPTS_DIR;
        this.systemd = new SystemdManager(options.systemdOptions || {});
        this.sftp = new SftpManager(options.sftpOptions || {});
        this.dryRun = options.dryRun || false;
    }

    /**
     * Valide le nom d'un site
     * @param {string} name 
     * @returns {boolean}
     */
    validateSiteName(name) {
        const pattern = /^[a-z][a-z0-9_-]{2,29}$/;
        return pattern.test(name);
    }

    /**
     * Crée un nouveau site complet
     * @param {Object} siteData - Données du site
     * @param {string} siteData.name - Nom unique du site
     * @param {string} siteData.displayName - Nom d'affichage
     * @param {string} siteData.owner - ID du propriétaire
     * @param {string} [siteData.description] - Description
     * @returns {Promise<Site>}
     */
    async createSite(siteData) {
        const { name, displayName, owner, description } = siteData;

        // Validation
        if (!this.validateSiteName(name)) {
            throw new Error('Invalid site name. Must start with a letter, contain only lowercase letters, numbers, hyphens, underscores, and be 3-30 characters.');
        }

        // Vérifier si le site existe déjà
        const existing = await Site.findOne({ name });
        if (existing) {
            throw new Error(`Site '${name}' already exists`);
        }

        // Générer la plage de ports
        const portRange = await Site.generatePortRange();

        // Créer le document Site
        const site = new Site({
            name,
            displayName,
            description,
            owner,
            portRange,
            status: 'creating',
        });

        await site.save();

        let sftpCredentials = null;
        
        try {
            // 1. Créer l'utilisateur Linux
            await this.createLinuxUser(site);

            // 2. Créer la structure de dossiers
            await this.createSiteDirectories(site);

            // 3. Définir les permissions
            await this.setSitePermissions(site);

            // 4. Configurer l'accès SFTP
            try {
                sftpCredentials = await this.sftp.createSftpUser(site.name);
            } catch (sftpError) {
                console.warn(`SFTP setup warning: ${sftpError.message}`);
                // Continue même si SFTP échoue (l'utilisateur existe peut-être déjà)
            }

            // Marquer comme actif
            site.status = 'active';
            site.linuxUser.created = true;
            await site.save();

            // Retourner le site avec les credentials SFTP (si disponibles)
            const result = site.toObject();
            if (sftpCredentials) {
                result.sftpCredentials = {
                    username: sftpCredentials.username,
                    password: sftpCredentials.password,
                    host: process.env.SFTP_HOST || 'localhost',
                    port: parseInt(process.env.SFTP_PORT || '22', 10),
                };
            }
            return result;
        } catch (error) {
            // En cas d'erreur, marquer le site comme en erreur
            site.status = 'error';
            site.errorMessage = error.message;
            await site.save();
            throw error;
        }
    }

    /**
     * Crée l'utilisateur Linux pour un site
     * @param {Site} site 
     * @returns {Promise<void>}
     */
    async createLinuxUser(site) {
        const username = site.linuxUser.username;
        const homeDir = site.paths.root;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create user: ${username} with home: ${homeDir}`);
            return;
        }

        // Vérifier si l'utilisateur existe déjà
        try {
            await execAsync(`id ${username}`);
            console.log(`User ${username} already exists`);
            return;
        } catch {
            // L'utilisateur n'existe pas, on le crée
        }

        // Créer l'utilisateur système
        const command = [
            'sudo', 'useradd',
            '--system',
            '--create-home',
            `--home-dir`, homeDir,
            '--shell', '/usr/sbin/nologin',
            '--comment', `"Twoine Site: ${site.name}"`,
            username
        ].join(' ');

        try {
            await execAsync(command);
            
            // Récupérer l'UID/GID
            const { stdout: idOutput } = await execAsync(`id ${username}`);
            const uidMatch = idOutput.match(/uid=(\d+)/);
            const gidMatch = idOutput.match(/gid=(\d+)/);
            
            if (uidMatch) site.linuxUser.uid = parseInt(uidMatch[1], 10);
            if (gidMatch) site.linuxUser.gid = parseInt(gidMatch[1], 10);
            
        } catch (error) {
            throw new Error(`Failed to create Linux user: ${error.message}`);
        }
    }

    /**
     * Crée la structure de dossiers pour un site
     * @param {Site} site 
     * @returns {Promise<void>}
     */
    async createSiteDirectories(site) {
        const directories = [
            site.paths.root,
            site.paths.services,
            site.paths.logs,
            site.paths.data,
            site.paths.tmp,
        ];

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create directories:`, directories);
            return;
        }

        for (const dir of directories) {
            try {
                await execAsync(`sudo mkdir -p "${dir}"`);
            } catch (error) {
                throw new Error(`Failed to create directory ${dir}: ${error.message}`);
            }
        }
    }

    /**
     * Définit les permissions pour un site
     * @param {Site} site 
     * @returns {Promise<void>}
     */
    async setSitePermissions(site) {
        const username = site.linuxUser.username;
        const rootPath = site.paths.root;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would set permissions for: ${rootPath}`);
            return;
        }

        const commands = [
            // Propriétaire
            `sudo chown -R ${username}:${username} "${rootPath}"`,
            // Permissions restrictives
            `sudo chmod 750 "${rootPath}"`,
            `sudo chmod 750 "${site.paths.services}"`,
            `sudo chmod 750 "${site.paths.logs}"`,
            `sudo chmod 750 "${site.paths.data}"`,
            `sudo chmod 700 "${site.paths.tmp}"`,
            // ACL pour permettre à Twoine de lire
            `sudo setfacl -R -m u:twoine:rx "${rootPath}"`,
            `sudo setfacl -R -d -m u:twoine:rx "${rootPath}"`,
        ];

        for (const cmd of commands) {
            try {
                await execAsync(cmd);
            } catch (error) {
                console.warn(`Permission command failed: ${cmd} - ${error.message}`);
            }
        }
    }

    /**
     * Supprime un site et toutes ses ressources
     * @param {string} siteId 
     * @param {boolean} force - Forcer même si des services tournent
     * @returns {Promise<void>}
     */
    async deleteSite(siteId, force = false) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Vérifier les services actifs
        const services = await Service.find({ site: siteId });
        const runningServices = [];

        for (const service of services) {
            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            if (status.running) {
                runningServices.push(service.name);
            }
        }

        if (runningServices.length > 0 && !force) {
            throw new Error(`Cannot delete site with running services: ${runningServices.join(', ')}. Use force=true to stop them.`);
        }

        // Marquer comme en cours de suppression
        site.status = 'deleting';
        await site.save();

        try {
            // 1. Arrêter et supprimer tous les services
            for (const service of services) {
                await this.systemd.teardownService(service.systemd.serviceName);
                await service.deleteOne();
            }

            // 2. Supprimer l'utilisateur Linux et SFTP
            await this.deleteLinuxUser(site);
            try {
                await this.sftp.deleteSftpUser(site.name, false);
            } catch (sftpError) {
                console.warn(`SFTP cleanup warning: ${sftpError.message}`);
            }

            // 3. Supprimer les dossiers (optionnel, garder les données?)
            if (force) {
                await this.deleteSiteDirectories(site);
            }

            // 4. Supprimer le document
            site.status = 'deleted';
            await site.save();
            // await site.deleteOne(); // Ou garder pour historique

        } catch (error) {
            site.status = 'error';
            site.errorMessage = error.message;
            await site.save();
            throw error;
        }
    }

    /**
     * Supprime l'utilisateur Linux d'un site
     * @param {Site} site 
     * @returns {Promise<void>}
     */
    async deleteLinuxUser(site) {
        const username = site.linuxUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete user: ${username}`);
            return;
        }

        try {
            // Tuer tous les processus de l'utilisateur
            await execAsync(`sudo pkill -u ${username}`).catch(() => {});
            
            // Supprimer l'utilisateur
            await execAsync(`sudo userdel ${username}`);
        } catch (error) {
            console.warn(`Failed to delete user ${username}: ${error.message}`);
        }
    }

    /**
     * Supprime les dossiers d'un site
     * @param {Site} site 
     * @returns {Promise<void>}
     */
    async deleteSiteDirectories(site) {
        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete: ${site.paths.root}`);
            return;
        }

        // Vérification de sécurité
        if (!site.paths.root.startsWith(this.sitesDir)) {
            throw new Error('Security: Cannot delete directory outside sites dir');
        }

        try {
            await execAsync(`sudo rm -rf "${site.paths.root}"`);
        } catch (error) {
            console.warn(`Failed to delete site directory: ${error.message}`);
        }
    }

    /**
     * Obtient les informations complètes d'un site
     * @param {string} siteId 
     * @returns {Promise<Object>}
     */
    async getSiteInfo(siteId) {
        const site = await Site.findById(siteId).populate('owner', 'email username');
        if (!site) {
            throw new Error('Site not found');
        }

        const services = await Service.find({ site: siteId });
        const servicesStatus = [];

        for (const service of services) {
            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            servicesStatus.push({
                ...service.toObject(),
                systemdStatus: status,
            });
        }

        return {
            site: site.toObject(),
            services: servicesStatus,
        };
    }

    /**
     * Démarre tous les services d'un site
     * @param {string} siteId 
     * @returns {Promise<Object>}
     */
    async startSite(siteId) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        const services = await Service.find({ site: siteId, autoStart: true }).sort({ startPriority: 1 });
        const results = { started: [], failed: [] };

        for (const service of services) {
            try {
                await this.systemd.startService(service.systemd.serviceName);
                service.status.current = 'running';
                service.status.desired = 'running';
                service.status.lastStateChange = new Date();
                await service.save();
                results.started.push(service.name);
            } catch (error) {
                service.status.current = 'failed';
                service.status.lastError = error.message;
                service.status.failureCount += 1;
                await service.save();
                results.failed.push({ name: service.name, error: error.message });
            }
        }

        return results;
    }

    /**
     * Arrête tous les services d'un site
     * @param {string} siteId 
     * @returns {Promise<Object>}
     */
    async stopSite(siteId) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        const services = await Service.find({ site: siteId }).sort({ startPriority: -1 }); // Inverse order
        const results = { stopped: [], failed: [] };

        for (const service of services) {
            try {
                await this.systemd.stopService(service.systemd.serviceName);
                service.status.current = 'stopped';
                service.status.desired = 'stopped';
                service.status.lastStateChange = new Date();
                await service.save();
                results.stopped.push(service.name);
            } catch (error) {
                results.failed.push({ name: service.name, error: error.message });
            }
        }

        return results;
    }

    /**
     * Redémarre tous les services d'un site
     * @param {string} siteId 
     * @returns {Promise<Object>}
     */
    async restartSite(siteId) {
        await this.stopSite(siteId);
        // Petit délai pour laisser les services s'arrêter proprement
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await this.startSite(siteId);
    }

    /**
     * Liste tous les sites
     * @param {Object} filters 
     * @returns {Promise<Site[]>}
     */
    async listSites(filters = {}) {
        const query = {};
        
        if (filters.owner) query.owner = filters.owner;
        if (filters.status) query.status = filters.status;
        
        return Site.find(query)
            .populate('owner', 'email username')
            .sort({ createdAt: -1 });
    }

    /**
     * Ajoute un domaine à un site
     * @param {string} siteId 
     * @param {string} domain 
     * @param {boolean} isPrimary 
     * @returns {Promise<Site>}
     */
    async addDomain(siteId, domain, isPrimary = false) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Vérifier que le domaine n'est pas déjà utilisé
        const existingDomain = await Site.findByDomain(domain);
        if (existingDomain && existingDomain._id.toString() !== siteId) {
            throw new Error(`Domain '${domain}' is already used by another site`);
        }

        // Si isPrimary, retirer le flag des autres domaines
        if (isPrimary) {
            site.domains.forEach(d => d.isPrimary = false);
        }

        // Ajouter le domaine
        site.domains.push({
            domain: domain.toLowerCase(),
            isPrimary,
            sslEnabled: false,
            sslType: 'none',
            verified: false,
        });

        await site.save();
        return site;
    }

    /**
     * Supprime un domaine d'un site
     * @param {string} siteId 
     * @param {string} domain 
     * @returns {Promise<Site>}
     */
    async removeDomain(siteId, domain) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        site.domains = site.domains.filter(d => d.domain !== domain.toLowerCase());
        await site.save();
        return site;
    }

    /**
     * Met à jour les variables d'environnement d'un site
     * @param {string} siteId 
     * @param {Object} envVars 
     * @returns {Promise<Site>}
     */
    async updateEnvironment(siteId, envVars) {
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Valider les clés d'environnement
        for (const key of Object.keys(envVars)) {
            if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
                throw new Error(`Invalid environment variable name: ${key}`);
            }
        }

        // Mettre à jour
        for (const [key, value] of Object.entries(envVars)) {
            if (value === null || value === undefined) {
                site.environment.delete(key);
            } else {
                site.environment.set(key, String(value));
            }
        }

        await site.save();

        // Mettre à jour les fichiers .env de tous les services
        const services = await Service.find({ site: siteId });
        for (const service of services) {
            await this.updateServiceEnvFile(service);
        }

        return site;
    }

    /**
     * Met à jour le fichier .env d'un service
     * @param {Service} service 
     * @returns {Promise<void>}
     */
    async updateServiceEnvFile(service) {
        const envContent = await service.generateEnvFile();
        const envPath = service.envFile.path;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would update: ${envPath}`);
            return;
        }

        try {
            const site = await Site.findById(service.site);
            await execAsync(`sudo -u ${site.linuxUser.username} tee "${envPath}" > /dev/null << 'ENVEOF'
${envContent}
ENVEOF`);
        } catch (error) {
            console.warn(`Failed to update env file: ${error.message}`);
        }
    }
}

// Export singleton et classe
const defaultManager = new SiteManager();

module.exports = {
    SiteManager,
    siteManager: defaultManager,
};
