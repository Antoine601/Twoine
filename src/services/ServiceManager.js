/**
 * TWOINE - Service Manager
 * Gestion des services individuels au sein des sites
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const Site = require('../models/Site');
const Service = require('../models/Service');
const { SystemdManager } = require('./SystemdManager');

const execAsync = promisify(exec);

class ServiceManager {
    constructor(options = {}) {
        this.systemd = new SystemdManager(options.systemdOptions || {});
        this.dryRun = options.dryRun || false;
    }

    /**
     * Valide le nom d'un service
     * @param {string} name 
     * @returns {boolean}
     */
    validateServiceName(name) {
        const pattern = /^[a-z][a-z0-9_-]{1,29}$/;
        return pattern.test(name);
    }

    /**
     * Valide une commande de démarrage (sécurité anti-injection)
     * @param {string} command 
     * @returns {boolean}
     */
    validateStartCommand(command) {
        // Liste blanche de commandes autorisées
        const allowedPrefixes = [
            'npm', 'node', 'yarn', 'pnpm',
            'python', 'python3', 'pip',
            'php', 'php-fpm',
            'ruby', 'bundle',
            'go', 'cargo',
            'java', 'dotnet',
            './start', './run', './app',
        ];

        // Caractères interdits (injection shell)
        const forbiddenPatterns = [
            /[;&|`$(){}[\]<>\\]/,  // Caractères shell dangereux
            /\.\./,                 // Path traversal
            /\/etc\//,              // Accès système
            /\/root/,               // Accès root
            /sudo|su\s/,            // Élévation de privilèges
            /chmod|chown/,          // Modification permissions
            /rm\s+-rf/,             // Suppression récursive
            /wget|curl.*\|/,        // Téléchargement et exécution
        ];

        // Vérifier les patterns interdits
        for (const pattern of forbiddenPatterns) {
            if (pattern.test(command)) {
                return false;
            }
        }

        // Vérifier que la commande commence par un préfixe autorisé
        const commandLower = command.toLowerCase().trim();
        const hasAllowedPrefix = allowedPrefixes.some(prefix => 
            commandLower.startsWith(prefix + ' ') || 
            commandLower === prefix ||
            commandLower.startsWith('./' + prefix)
        );

        return hasAllowedPrefix;
    }

    /**
     * Crée un nouveau service pour un site
     * @param {Object} serviceData 
     * @returns {Promise<Service>}
     */
    async createService(serviceData) {
        const {
            siteId,
            name,
            displayName,
            description,
            type,
            commands,
            port,
            environment,
            autoStart,
        } = serviceData;

        // Validation du nom
        if (!this.validateServiceName(name)) {
            throw new Error('Invalid service name');
        }

        // Récupérer le site
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Vérifier que le site est actif
        if (site.status !== 'active') {
            throw new Error(`Cannot create service: site is ${site.status}`);
        }

        // Valider la commande de démarrage
        if (!this.validateStartCommand(commands.start)) {
            throw new Error('Invalid or forbidden start command');
        }

        // Vérifier si le service existe déjà
        const existing = await Service.findOne({ site: siteId, name });
        if (existing) {
            throw new Error(`Service '${name}' already exists in this site`);
        }

        // Vérifier/attribuer le port
        let servicePort = port;
        if (servicePort) {
            const portAvailable = await site.isPortAvailable(servicePort);
            if (!portAvailable) {
                throw new Error(`Port ${servicePort} is not available`);
            }
        } else {
            servicePort = await site.getNextAvailablePort();
        }

        // Déterminer le binaire selon le type
        const runtimeConfig = this.getRuntimeConfig(type);

        // Créer le service
        const service = new Service({
            site: siteId,
            name,
            displayName: displayName || name,
            description,
            type,
            commands: {
                install: commands.install || runtimeConfig.defaultInstall,
                build: commands.build,
                start: commands.start,
                healthCheck: commands.healthCheck,
            },
            runtime: {
                version: runtimeConfig.version,
                binary: runtimeConfig.binary,
            },
            workingDir: `${site.paths.services}/${name}`,
            port: servicePort,
            environment: environment || new Map(),
            autoStart: autoStart !== false,
            status: {
                current: 'stopped',
                desired: 'stopped',
            },
        });

        await service.save();

        try {
            // 1. Créer le répertoire du service
            await this.createServiceDirectory(site, service);

            // 2. Générer et créer le fichier unit systemd
            const unitContent = await service.generateSystemdUnit();
            await this.systemd.setupService(service.systemd.serviceName, unitContent, false);

            // 3. Créer le fichier .env
            await this.createEnvFile(site, service);

            // Marquer comme créé
            service.systemd.unitFileCreated = true;
            service.systemd.unitFileUpdatedAt = new Date();
            await service.save();

            return service;

        } catch (error) {
            // Rollback: supprimer le service
            await service.deleteOne();
            throw error;
        }
    }

    /**
     * Obtient la configuration runtime par type
     * @param {string} type 
     * @returns {Object}
     */
    getRuntimeConfig(type) {
        const configs = {
            node: {
                binary: '/usr/bin/node',
                version: '20',
                defaultInstall: 'npm install --production',
            },
            python: {
                binary: '/usr/bin/python3',
                version: '3.11',
                defaultInstall: 'pip install -r requirements.txt',
            },
            php: {
                binary: '/usr/bin/php',
                version: '8.2',
                defaultInstall: 'composer install --no-dev',
            },
            ruby: {
                binary: '/usr/bin/ruby',
                version: '3.0',
                defaultInstall: 'bundle install --deployment',
            },
            go: {
                binary: '/usr/bin/go',
                version: '1.21',
                defaultInstall: 'go build -o app',
            },
            rust: {
                binary: '/usr/bin/cargo',
                version: '1.70',
                defaultInstall: 'cargo build --release',
            },
            java: {
                binary: '/usr/bin/java',
                version: '17',
                defaultInstall: 'mvn package -DskipTests',
            },
            dotnet: {
                binary: '/usr/bin/dotnet',
                version: '8.0',
                defaultInstall: 'dotnet restore && dotnet build -c Release',
            },
            static: {
                binary: null,
                version: null,
                defaultInstall: null,
            },
            custom: {
                binary: null,
                version: null,
                defaultInstall: null,
            },
        };

        return configs[type] || configs.custom;
    }

    /**
     * Crée le répertoire d'un service
     * @param {Site} site 
     * @param {Service} service 
     * @returns {Promise<void>}
     */
    async createServiceDirectory(site, service) {
        const serviceDir = `${site.paths.services}/${service.name}`;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create directory: ${serviceDir}`);
            return;
        }

        try {
            await execAsync(`sudo mkdir -p "${serviceDir}"`);
            await execAsync(`sudo chown ${site.linuxUser.username}:${site.linuxUser.username} "${serviceDir}"`);
            await execAsync(`sudo chmod 750 "${serviceDir}"`);
        } catch (error) {
            throw new Error(`Failed to create service directory: ${error.message}`);
        }
    }

    /**
     * Crée le fichier .env d'un service
     * @param {Site} site 
     * @param {Service} service 
     * @returns {Promise<void>}
     */
    async createEnvFile(site, service) {
        const envContent = await service.generateEnvFile();
        const envPath = `${site.paths.services}/${service.name}/.env`;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create .env at: ${envPath}`);
            return;
        }

        try {
            // Écrire via un fichier temporaire
            const tempPath = `/tmp/twoine-env-${service._id}.tmp`;
            await fs.writeFile(tempPath, envContent, 'utf8');
            await execAsync(`sudo mv "${tempPath}" "${envPath}"`);
            await execAsync(`sudo chown ${site.linuxUser.username}:${site.linuxUser.username} "${envPath}"`);
            await execAsync(`sudo chmod 600 "${envPath}"`);
        } catch (error) {
            throw new Error(`Failed to create .env file: ${error.message}`);
        }
    }

    /**
     * Supprime un service
     * @param {string} serviceId 
     * @param {boolean} force 
     * @returns {Promise<void>}
     */
    async deleteService(serviceId, force = false) {
        const service = await Service.findById(serviceId).populate('site');
        if (!service) {
            throw new Error('Service not found');
        }

        // Vérifier si le service tourne
        const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
        if (status.running && !force) {
            throw new Error('Cannot delete running service. Stop it first or use force=true');
        }

        try {
            // 1. Supprimer le service systemd
            await this.systemd.teardownService(service.systemd.serviceName);

            // 2. Supprimer le répertoire du service (optionnel)
            if (force && service.site) {
                const serviceDir = `${service.site.paths.services}/${service.name}`;
                await execAsync(`sudo rm -rf "${serviceDir}"`).catch(() => {});
            }

            // 3. Supprimer le document
            await service.deleteOne();

        } catch (error) {
            throw new Error(`Failed to delete service: ${error.message}`);
        }
    }

    /**
     * Démarre un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async startService(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        try {
            await this.systemd.startService(service.systemd.serviceName);
            
            // Mettre à jour le statut
            service.status.current = 'running';
            service.status.desired = 'running';
            service.status.lastStateChange = new Date();
            service.processInfo.startedAt = new Date();
            await service.save();

            // Récupérer le statut actuel
            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            
            return {
                success: true,
                service: service.name,
                status,
            };
        } catch (error) {
            service.status.current = 'failed';
            service.status.lastError = error.message;
            service.status.failureCount += 1;
            await service.save();
            
            throw error;
        }
    }

    /**
     * Arrête un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async stopService(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        try {
            await this.systemd.stopService(service.systemd.serviceName);
            
            service.status.current = 'stopped';
            service.status.desired = 'stopped';
            service.status.lastStateChange = new Date();
            service.processInfo.pid = null;
            service.processInfo.startedAt = null;
            await service.save();

            return {
                success: true,
                service: service.name,
            };
        } catch (error) {
            service.status.lastError = error.message;
            await service.save();
            throw error;
        }
    }

    /**
     * Redémarre un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async restartService(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        try {
            await this.systemd.restartService(service.systemd.serviceName);
            
            service.status.current = 'running';
            service.status.desired = 'running';
            service.status.lastStateChange = new Date();
            service.processInfo.startedAt = new Date();
            await service.save();

            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            
            return {
                success: true,
                service: service.name,
                status,
            };
        } catch (error) {
            service.status.current = 'failed';
            service.status.lastError = error.message;
            service.status.failureCount += 1;
            await service.save();
            throw error;
        }
    }

    /**
     * Obtient le statut d'un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async getServiceStatus(serviceId) {
        const service = await Service.findById(serviceId).populate('site', 'name displayName');
        if (!service) {
            throw new Error('Service not found');
        }

        const systemdStatus = await this.systemd.getServiceStatus(service.systemd.serviceName);

        // Mettre à jour le statut en base
        service.status.current = systemdStatus.running ? 'running' : 'stopped';
        service.status.lastCheck = new Date();
        if (systemdStatus.pid) service.processInfo.pid = systemdStatus.pid;
        if (systemdStatus.memory) service.processInfo.memoryUsageMB = systemdStatus.memory;
        await service.save();

        return {
            service: service.toObject(),
            systemd: systemdStatus,
        };
    }

    /**
     * Met à jour un service
     * @param {string} serviceId 
     * @param {Object} updates 
     * @returns {Promise<Service>}
     */
    async updateService(serviceId, updates) {
        const service = await Service.findById(serviceId).populate('site');
        if (!service) {
            throw new Error('Service not found');
        }

        const wasRunning = (await this.systemd.getServiceStatus(service.systemd.serviceName)).running;

        // Mettre à jour les champs autorisés
        const allowedFields = [
            'displayName', 'description', 'commands', 'environment',
            'autoStart', 'startPriority', 'resources', 'healthCheck',
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                if (field === 'commands' && updates.commands.start) {
                    if (!this.validateStartCommand(updates.commands.start)) {
                        throw new Error('Invalid start command');
                    }
                }
                service[field] = updates[field];
            }
        }

        await service.save();

        // Régénérer le fichier unit si nécessaire
        if (updates.commands || updates.resources) {
            const unitContent = await service.generateSystemdUnit();
            await this.systemd.updateService(service.systemd.serviceName, unitContent, wasRunning);
            service.systemd.unitFileUpdatedAt = new Date();
            await service.save();
        }

        // Régénérer le fichier .env si nécessaire
        if (updates.environment) {
            await this.createEnvFile(service.site, service);
        }

        return service;
    }

    /**
     * Exécute la commande d'installation d'un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async installService(serviceId) {
        const service = await Service.findById(serviceId).populate('site');
        if (!service) {
            throw new Error('Service not found');
        }

        if (!service.commands.install) {
            return { success: true, message: 'No install command defined' };
        }

        const site = service.site;
        const workingDir = `${site.paths.services}/${service.name}`;

        try {
            const { stdout, stderr } = await execAsync(
                `sudo -u ${site.linuxUser.username} bash -c 'cd "${workingDir}" && ${service.commands.install}'`,
                {
                    timeout: 300000, // 5 minutes
                    maxBuffer: 10 * 1024 * 1024, // 10MB
                }
            );

            return {
                success: true,
                stdout,
                stderr,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stdout: error.stdout,
                stderr: error.stderr,
            };
        }
    }

    /**
     * Exécute la commande de build d'un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async buildService(serviceId) {
        const service = await Service.findById(serviceId).populate('site');
        if (!service) {
            throw new Error('Service not found');
        }

        if (!service.commands.build) {
            return { success: true, message: 'No build command defined' };
        }

        const site = service.site;
        const workingDir = `${site.paths.services}/${service.name}`;

        try {
            const { stdout, stderr } = await execAsync(
                `sudo -u ${site.linuxUser.username} bash -c 'cd "${workingDir}" && ${service.commands.build}'`,
                {
                    timeout: 600000, // 10 minutes
                    maxBuffer: 10 * 1024 * 1024,
                }
            );

            return {
                success: true,
                stdout,
                stderr,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stdout: error.stdout,
                stderr: error.stderr,
            };
        }
    }

    /**
     * Vérifie la santé d'un service
     * @param {string} serviceId 
     * @returns {Promise<Object>}
     */
    async checkServiceHealth(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        if (!service.healthCheck.enabled) {
            return { healthy: null, message: 'Health check disabled' };
        }

        const url = `http://127.0.0.1:${service.port}${service.healthCheck.endpoint}`;

        try {
            const { stdout } = await execAsync(
                `curl -s -o /dev/null -w "%{http_code}" --max-time ${service.healthCheck.timeoutSec} "${url}"`,
                { timeout: (service.healthCheck.timeoutSec + 2) * 1000 }
            );

            const statusCode = parseInt(stdout.trim(), 10);
            const healthy = statusCode >= 200 && statusCode < 400;

            service.healthCheck.lastCheck = new Date();
            service.healthCheck.lastStatus = healthy ? 'healthy' : 'unhealthy';
            await service.save();

            return {
                healthy,
                statusCode,
                url,
            };
        } catch (error) {
            service.healthCheck.lastCheck = new Date();
            service.healthCheck.lastStatus = 'unhealthy';
            await service.save();

            return {
                healthy: false,
                error: error.message,
                url,
            };
        }
    }

    /**
     * Valide une commande custom (sécurité anti-injection)
     * @param {string} command 
     * @returns {boolean}
     */
    validateCustomCommand(command) {
        // Caractères interdits (injection shell)
        const forbiddenPatterns = [
            /[;&|`$(){}[\]<>\\]/,  // Caractères shell dangereux
            /\.\.\//,              // Path traversal
            /\/etc\//,             // Accès système
            /\/root/,              // Accès root
            /sudo|su\s/,           // Élévation de privilèges
            /chmod|chown/,         // Modification permissions
            /rm\s+-rf/,            // Suppression récursive
            /wget|curl.*\|/,       // Téléchargement et exécution
            /mkfs|dd\s/,           // Commandes destructrices
            /shutdown|reboot/,     // Commandes système
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(command)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Exécute une commande custom sur un service
     * @param {string} serviceId 
     * @param {string} commandName - Nom de la commande (ex: 'migrate', 'seed')
     * @returns {Promise<Object>}
     */
    async executeCustomCommand(serviceId, commandName) {
        const service = await Service.findById(serviceId).populate('site');
        if (!service) {
            throw new Error('Service not found');
        }

        // Trouver la commande custom
        const customCmd = service.customCommands.find(c => c.name === commandName);
        if (!customCmd) {
            throw new Error(`Custom command '${commandName}' not found`);
        }

        // Valider la commande
        if (!this.validateCustomCommand(customCmd.command)) {
            throw new Error('Command contains forbidden patterns');
        }

        const site = service.site;
        const workingDir = `${site.paths.services}/${service.name}`;

        // Si la commande requiert l'arrêt du service
        let wasRunning = false;
        if (customCmd.requiresStop) {
            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            wasRunning = status.running;
            if (wasRunning) {
                await this.stopService(serviceId);
            }
        }

        try {
            const { stdout, stderr } = await execAsync(
                `sudo -u ${site.linuxUser.username} bash -c 'cd "${workingDir}" && ${customCmd.command}'`,
                {
                    timeout: customCmd.timeout * 1000,
                    maxBuffer: 10 * 1024 * 1024, // 10MB
                }
            );

            // Redémarrer si nécessaire
            if (customCmd.requiresStop && wasRunning) {
                await this.startService(serviceId);
            }

            return {
                success: true,
                command: commandName,
                stdout,
                stderr,
            };
        } catch (error) {
            // Tenter de redémarrer même en cas d'erreur
            if (customCmd.requiresStop && wasRunning) {
                try {
                    await this.startService(serviceId);
                } catch (restartError) {
                    // Log mais ne pas masquer l'erreur originale
                }
            }

            return {
                success: false,
                command: commandName,
                error: error.message,
                stdout: error.stdout,
                stderr: error.stderr,
            };
        }
    }

    /**
     * Liste les commandes custom d'un service
     * @param {string} serviceId 
     * @returns {Promise<Object[]>}
     */
    async listCustomCommands(serviceId) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        return service.customCommands.map(cmd => ({
            name: cmd.name,
            displayName: cmd.displayName || cmd.name,
            description: cmd.description,
            timeout: cmd.timeout,
            requiresStop: cmd.requiresStop,
            dangerous: cmd.dangerous,
        }));
    }

    /**
     * Ajoute une commande custom à un service
     * @param {string} serviceId 
     * @param {Object} commandData 
     * @returns {Promise<Service>}
     */
    async addCustomCommand(serviceId, commandData) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        const { name, displayName, description, command, timeout, requiresStop, dangerous } = commandData;

        // Valider le nom
        if (!/^[a-z][a-z0-9_-]{1,29}$/.test(name)) {
            throw new Error('Invalid command name');
        }

        // Vérifier que la commande n'existe pas déjà
        if (service.customCommands.some(c => c.name === name)) {
            throw new Error(`Command '${name}' already exists`);
        }

        // Valider la commande
        if (!this.validateCustomCommand(command)) {
            throw new Error('Command contains forbidden patterns');
        }

        // Noms réservés
        const reservedNames = ['start', 'stop', 'restart', 'install', 'build', 'status', 'logs'];
        if (reservedNames.includes(name)) {
            throw new Error(`Command name '${name}' is reserved`);
        }

        service.customCommands.push({
            name,
            displayName: displayName || name,
            description,
            command,
            timeout: timeout || 300,
            requiresStop: requiresStop || false,
            dangerous: dangerous || false,
        });

        await service.save();
        return service;
    }

    /**
     * Supprime une commande custom d'un service
     * @param {string} serviceId 
     * @param {string} commandName 
     * @returns {Promise<Service>}
     */
    async removeCustomCommand(serviceId, commandName) {
        const service = await Service.findById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        const cmdIndex = service.customCommands.findIndex(c => c.name === commandName);
        if (cmdIndex === -1) {
            throw new Error(`Command '${commandName}' not found`);
        }

        service.customCommands.splice(cmdIndex, 1);
        await service.save();
        return service;
    }

    /**
     * Supprime tous les services d'un site
     * @param {string} siteId 
     * @returns {Promise<number>} Nombre de services supprimés
     */
    async deleteAllServicesForSite(siteId) {
        const services = await Service.find({ site: siteId });
        let deletedCount = 0;

        for (const service of services) {
            try {
                await this.deleteService(service._id, true);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete service ${service.name}: ${error.message}`);
            }
        }

        return deletedCount;
    }

    /**
     * Liste les services d'un site
     * @param {string} siteId 
     * @returns {Promise<Object[]>}
     */
    async listServices(siteId) {
        const services = await Service.findBySite(siteId);
        const result = [];

        for (const service of services) {
            const status = await this.systemd.getServiceStatus(service.systemd.serviceName);
            result.push({
                ...service.toObject(),
                systemdStatus: status,
            });
        }

        return result;
    }
}

// Export singleton et classe
const defaultManager = new ServiceManager();

module.exports = {
    ServiceManager,
    serviceManager: defaultManager,
};
