/**
 * TWOINE - Domain Manager Service
 * Gestion des domaines, certificats SSL auto-signés et configuration Nginx
 */

const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const Domain = require('../models/Domain');
const Site = require('../models/Site');
const Service = require('../models/Service');

const execAsync = promisify(exec);

// Configuration paths
const CERTS_DIR = process.env.CERTS_DIR || '/etc/twoine/certs';
const NGINX_AVAILABLE = process.env.NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
const NGINX_ENABLED = process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';
const SCRIPTS_DIR = process.env.TWOINE_SCRIPTS_DIR || '/opt/twoine/scripts';

// Server IP (à configurer)
const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const SERVER_IPV6 = process.env.SERVER_IPV6 || null;

class DomainManager {
    // ============================================
    // DOMAIN CRUD OPERATIONS
    // ============================================

    /**
     * Ajoute un nouveau domaine
     * @param {object} options
     * @param {string} options.domain - Nom de domaine
     * @param {string} options.type - 'platform' ou 'site'
     * @param {string} options.siteId - ID du site (requis si type='site')
     * @param {string} options.serviceId - ID du service (optionnel)
     * @param {number} options.targetPort - Port cible
     * @param {boolean} options.enableSsl - Activer SSL auto-signé
     * @param {string} options.userId - ID de l'utilisateur créateur
     * @returns {Promise<Domain>}
     */
    async addDomain(options) {
        const {
            domain,
            type = 'site',
            siteId = null,
            serviceId = null,
            targetPort,
            enableSsl = true,
            userId,
        } = options;

        // Validation du domaine
        const validation = Domain.validateDomain(domain);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const normalizedDomain = domain.trim().toLowerCase();

        // Vérifier disponibilité
        const isAvailable = await Domain.isAvailable(normalizedDomain);
        if (!isAvailable) {
            throw new Error(`Domain '${normalizedDomain}' is already registered`);
        }

        // Vérifier le site si spécifié
        let site = null;
        let service = null;
        let port = targetPort;

        if (type === 'site') {
            if (!siteId) {
                throw new Error('Site ID is required for site domains');
            }

            site = await Site.findById(siteId);
            if (!site) {
                throw new Error('Site not found');
            }

            // Si service spécifié, vérifier qu'il appartient au site
            if (serviceId) {
                service = await Service.findById(serviceId);
                if (!service) {
                    throw new Error('Service not found');
                }
                if (service.site.toString() !== siteId) {
                    throw new Error('Service does not belong to the specified site');
                }
                // Utiliser le port du service
                port = port || service.port;
            }
        }

        if (!port) {
            throw new Error('Target port is required');
        }

        // Créer le domaine
        const newDomain = new Domain({
            domain: normalizedDomain,
            type,
            site: siteId,
            service: serviceId,
            targetPort: port,
            ssl: {
                enabled: enableSsl,
                type: enableSsl ? 'self-signed' : 'none',
            },
            createdBy: userId,
            status: 'pending',
        });

        await newDomain.save();

        // Générer le certificat si SSL activé
        if (enableSsl) {
            try {
                await this.generateCertificate(normalizedDomain);
                newDomain.ssl.generatedAt = new Date();
                // Certificat auto-signé valide 1 an
                newDomain.ssl.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            } catch (error) {
                console.error(`[DOMAIN] Failed to generate certificate for ${normalizedDomain}:`, error.message);
                newDomain.status = 'error';
                newDomain.errorMessage = `Certificate generation failed: ${error.message}`;
                await newDomain.save();
                throw error;
            }
        }

        // Configurer Nginx
        try {
            await this.createNginxConfig(newDomain);
            await this.enableNginxSite(normalizedDomain);
            await this.reloadNginx();
            newDomain.nginx.configured = true;
            newDomain.nginx.lastReload = new Date();
            newDomain.status = 'active';
        } catch (error) {
            console.error(`[DOMAIN] Failed to configure Nginx for ${normalizedDomain}:`, error.message);
            newDomain.status = 'error';
            newDomain.errorMessage = `Nginx configuration failed: ${error.message}`;
            // Rollback: supprimer le certificat si créé
            await this.rollbackDomain(normalizedDomain);
        }

        await newDomain.save();

        // Stocker les enregistrements DNS attendus
        newDomain.dns.expectedRecords = newDomain.generateDnsRecords(SERVER_IP, SERVER_IPV6);
        await newDomain.save();

        return newDomain;
    }

    /**
     * Supprime un domaine
     * @param {string} domainId - ID du domaine
     * @param {boolean} force - Forcer la suppression même en cas d'erreur
     * @returns {Promise<boolean>}
     */
    async removeDomain(domainId, force = false) {
        const domain = await Domain.findById(domainId);
        if (!domain) {
            throw new Error('Domain not found');
        }

        if (domain.type === 'platform' && !force) {
            throw new Error('Cannot delete platform domain without force flag');
        }

        const domainName = domain.domain;

        try {
            // Désactiver le site Nginx
            await this.disableNginxSite(domainName);
            
            // Supprimer la config Nginx
            await this.removeNginxConfig(domainName);
            
            // Recharger Nginx
            await this.reloadNginx();
            
            // Supprimer le certificat
            await this.removeCertificate(domainName);
            
        } catch (error) {
            console.error(`[DOMAIN] Error during removal of ${domainName}:`, error.message);
            if (!force) {
                throw error;
            }
        }

        // Marquer comme supprimé
        domain.status = 'deleted';
        await domain.save();

        return true;
    }

    /**
     * Assigne un domaine à un site/service
     * @param {string} domainId - ID du domaine
     * @param {string} siteId - ID du site
     * @param {string} serviceId - ID du service (optionnel)
     * @returns {Promise<Domain>}
     */
    async assignDomain(domainId, siteId, serviceId = null) {
        const domain = await Domain.findById(domainId);
        if (!domain) {
            throw new Error('Domain not found');
        }

        if (domain.type === 'platform') {
            throw new Error('Cannot reassign platform domain');
        }

        // Vérifier le site
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        let service = null;
        let port = domain.targetPort;

        // Si service spécifié
        if (serviceId) {
            service = await Service.findById(serviceId);
            if (!service) {
                throw new Error('Service not found');
            }
            if (service.site.toString() !== siteId) {
                throw new Error('Service does not belong to the specified site');
            }
            port = service.port;
        }

        // Mettre à jour le domaine
        domain.site = siteId;
        domain.service = serviceId;
        domain.targetPort = port;
        domain.status = 'configuring';

        await domain.save();

        // Reconfigurer Nginx
        try {
            await this.createNginxConfig(domain);
            await this.reloadNginx();
            domain.nginx.lastReload = new Date();
            domain.status = 'active';
        } catch (error) {
            domain.status = 'error';
            domain.errorMessage = `Nginx reconfiguration failed: ${error.message}`;
        }

        await domain.save();
        return domain;
    }

    /**
     * Désassigne un domaine (le détache du site/service)
     * @param {string} domainId - ID du domaine
     * @returns {Promise<Domain>}
     */
    async unassignDomain(domainId) {
        const domain = await Domain.findById(domainId);
        if (!domain) {
            throw new Error('Domain not found');
        }

        if (domain.type === 'platform') {
            throw new Error('Cannot unassign platform domain');
        }

        // Désactiver Nginx pour ce domaine
        try {
            await this.disableNginxSite(domain.domain);
            await this.reloadNginx();
        } catch (error) {
            console.error(`[DOMAIN] Error disabling ${domain.domain}:`, error.message);
        }

        domain.site = null;
        domain.service = null;
        domain.status = 'pending';
        domain.nginx.configured = false;

        await domain.save();
        return domain;
    }

    /**
     * Liste tous les domaines
     * @param {object} filters - Filtres optionnels
     * @returns {Promise<Domain[]>}
     */
    async listDomains(filters = {}) {
        const query = { status: { $ne: 'deleted' } };

        if (filters.type) {
            query.type = filters.type;
        }
        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.siteId) {
            query.site = filters.siteId;
        }

        return Domain.find(query)
            .populate('site', 'name displayName status')
            .populate('service', 'name displayName port')
            .populate('createdBy', 'username displayName')
            .sort({ domain: 1 });
    }

    /**
     * Liste les domaines d'un site
     * @param {string} siteId - ID du site
     * @returns {Promise<Domain[]>}
     */
    async listDomainsBySite(siteId) {
        return Domain.findBySite(siteId);
    }

    /**
     * Obtient les informations DNS pour un domaine
     * @param {string} domainId - ID du domaine
     * @returns {Promise<object>}
     */
    async getDnsInfo(domainId) {
        const domain = await Domain.findById(domainId);
        if (!domain) {
            throw new Error('Domain not found');
        }

        const records = domain.generateDnsRecords(SERVER_IP, SERVER_IPV6);

        return {
            domain: domain.domain,
            serverIp: SERVER_IP,
            serverIpv6: SERVER_IPV6,
            records,
            instructions: `
Pour faire pointer votre domaine vers ce serveur, ajoutez les enregistrements DNS suivants
chez votre registrar ou hébergeur DNS :

${records.map(r => r.example).join('\n')}

Note: La propagation DNS peut prendre jusqu'à 48h.
            `.trim(),
        };
    }

    // ============================================
    // CERTIFICATE MANAGEMENT
    // ============================================

    /**
     * Génère un certificat auto-signé pour un domaine
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async generateCertificate(domainName) {
        const certDir = path.join(CERTS_DIR, domainName);
        const certPath = path.join(certDir, 'cert.pem');
        const keyPath = path.join(certDir, 'key.pem');

        // Créer le répertoire
        await fs.mkdir(certDir, { recursive: true });

        // Générer le certificat avec OpenSSL
        const opensslCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${keyPath}" \
            -out "${certPath}" \
            -subj "/CN=${domainName}/O=Twoine/C=FR" \
            -addext "subjectAltName=DNS:${domainName}"`;

        try {
            await execAsync(opensslCmd);
            console.log(`[DOMAIN] Certificate generated for ${domainName}`);
        } catch (error) {
            // Nettoyer en cas d'erreur
            try {
                await fs.rmdir(certDir, { recursive: true });
            } catch (e) { /* ignore */ }
            throw new Error(`Failed to generate certificate: ${error.message}`);
        }

        // Définir les permissions
        await fs.chmod(keyPath, 0o600);
        await fs.chmod(certPath, 0o644);
    }

    /**
     * Supprime le certificat d'un domaine
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async removeCertificate(domainName) {
        const certDir = path.join(CERTS_DIR, domainName);

        try {
            await fs.rm(certDir, { recursive: true, force: true });
            console.log(`[DOMAIN] Certificate removed for ${domainName}`);
        } catch (error) {
            console.warn(`[DOMAIN] Could not remove certificate for ${domainName}:`, error.message);
        }
    }

    /**
     * Régénère un certificat
     * @param {string} domainId - ID du domaine
     * @returns {Promise<Domain>}
     */
    async regenerateCertificate(domainId) {
        const domain = await Domain.findById(domainId);
        if (!domain) {
            throw new Error('Domain not found');
        }

        if (!domain.ssl.enabled) {
            throw new Error('SSL is not enabled for this domain');
        }

        // Supprimer l'ancien certificat
        await this.removeCertificate(domain.domain);

        // Générer le nouveau
        await this.generateCertificate(domain.domain);

        // Mettre à jour le domaine
        domain.ssl.generatedAt = new Date();
        domain.ssl.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        // Recharger Nginx
        await this.reloadNginx();
        domain.nginx.lastReload = new Date();

        await domain.save();
        return domain;
    }

    // ============================================
    // NGINX MANAGEMENT
    // ============================================

    /**
     * Crée la configuration Nginx pour un domaine
     * @param {Domain} domain - Instance Domain
     * @returns {Promise<void>}
     */
    async createNginxConfig(domain) {
        const config = domain.generateNginxConfig();
        const configPath = path.join(NGINX_AVAILABLE, `${domain.domain}.conf`);

        // Backup de l'ancienne config si elle existe
        try {
            const existingConfig = await fs.readFile(configPath, 'utf-8');
            const backupPath = `${configPath}.backup.${Date.now()}`;
            await fs.writeFile(backupPath, existingConfig);
        } catch (e) { /* Pas de config existante */ }

        // Écrire la nouvelle config
        await fs.writeFile(configPath, config);
        console.log(`[DOMAIN] Nginx config created for ${domain.domain}`);

        // Tester la config
        await this.testNginxConfig();
    }

    /**
     * Supprime la configuration Nginx d'un domaine
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async removeNginxConfig(domainName) {
        const configPath = path.join(NGINX_AVAILABLE, `${domainName}.conf`);

        try {
            await fs.unlink(configPath);
            console.log(`[DOMAIN] Nginx config removed for ${domainName}`);
        } catch (error) {
            console.warn(`[DOMAIN] Could not remove Nginx config for ${domainName}:`, error.message);
        }
    }

    /**
     * Active un site Nginx (crée le lien symbolique)
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async enableNginxSite(domainName) {
        const availablePath = path.join(NGINX_AVAILABLE, `${domainName}.conf`);
        const enabledPath = path.join(NGINX_ENABLED, `${domainName}.conf`);

        try {
            // Supprimer le lien existant si présent
            await fs.unlink(enabledPath).catch(() => {});
            
            // Créer le lien symbolique
            await fs.symlink(availablePath, enabledPath);
            console.log(`[DOMAIN] Nginx site enabled for ${domainName}`);
        } catch (error) {
            throw new Error(`Failed to enable Nginx site: ${error.message}`);
        }
    }

    /**
     * Désactive un site Nginx (supprime le lien symbolique)
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async disableNginxSite(domainName) {
        const enabledPath = path.join(NGINX_ENABLED, `${domainName}.conf`);

        try {
            await fs.unlink(enabledPath);
            console.log(`[DOMAIN] Nginx site disabled for ${domainName}`);
        } catch (error) {
            console.warn(`[DOMAIN] Could not disable Nginx site for ${domainName}:`, error.message);
        }
    }

    /**
     * Teste la configuration Nginx
     * @returns {Promise<void>}
     */
    async testNginxConfig() {
        try {
            await execAsync('nginx -t');
        } catch (error) {
            throw new Error(`Nginx configuration test failed: ${error.stderr || error.message}`);
        }
    }

    /**
     * Recharge Nginx de manière sécurisée
     * @returns {Promise<void>}
     */
    async reloadNginx() {
        // Tester la config avant de recharger
        await this.testNginxConfig();

        try {
            await execAsync('systemctl reload nginx');
            console.log('[DOMAIN] Nginx reloaded successfully');
        } catch (error) {
            throw new Error(`Failed to reload Nginx: ${error.message}`);
        }
    }

    // ============================================
    // ROLLBACK & CLEANUP
    // ============================================

    /**
     * Rollback d'un domaine en cas d'erreur
     * @param {string} domainName - Nom de domaine
     * @returns {Promise<void>}
     */
    async rollbackDomain(domainName) {
        console.log(`[DOMAIN] Rolling back domain ${domainName}`);

        try {
            await this.disableNginxSite(domainName);
        } catch (e) { /* ignore */ }

        try {
            await this.removeNginxConfig(domainName);
        } catch (e) { /* ignore */ }

        try {
            await this.removeCertificate(domainName);
        } catch (e) { /* ignore */ }

        try {
            await this.reloadNginx();
        } catch (e) { /* ignore */ }
    }

    /**
     * Nettoie les domaines orphelins (site supprimé)
     * @returns {Promise<number>} Nombre de domaines nettoyés
     */
    async cleanupOrphanDomains() {
        const domains = await Domain.find({
            type: 'site',
            site: { $ne: null },
            status: { $ne: 'deleted' },
        });

        let cleaned = 0;

        for (const domain of domains) {
            const site = await Site.findById(domain.site);
            
            if (!site || site.status === 'deleted') {
                console.log(`[DOMAIN] Cleaning orphan domain ${domain.domain}`);
                await this.removeDomain(domain._id, true);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Nettoie les domaines avec service supprimé
     * @returns {Promise<number>} Nombre de domaines mis à jour
     */
    async cleanupInvalidServiceDomains() {
        const domains = await Domain.find({
            service: { $ne: null },
            status: { $ne: 'deleted' },
        });

        let updated = 0;

        for (const domain of domains) {
            const service = await Service.findById(domain.service);
            
            if (!service || service.status === 'deleted') {
                console.log(`[DOMAIN] Removing invalid service reference from ${domain.domain}`);
                domain.service = null;
                domain.status = 'error';
                domain.errorMessage = 'Service has been deleted';
                await domain.save();
                updated++;
            }
        }

        return updated;
    }

    // ============================================
    // PLATFORM DOMAIN
    // ============================================

    /**
     * Configure le domaine de la plateforme Twoine
     * @param {object} options
     * @param {string} options.domain - Nom de domaine
     * @param {number} options.port - Port de la plateforme
     * @param {boolean} options.enableSsl - Activer SSL
     * @param {string} options.userId - ID de l'utilisateur admin
     * @returns {Promise<Domain>}
     */
    async setupPlatformDomain(options) {
        const { domain, port, enableSsl = true, userId } = options;

        // Vérifier qu'il n'y a pas déjà un domaine platform
        const existing = await Domain.getPlatformDomain();
        if (existing) {
            throw new Error('Platform domain already configured. Use updatePlatformDomain instead.');
        }

        return this.addDomain({
            domain,
            type: 'platform',
            targetPort: port,
            enableSsl,
            userId,
        });
    }

    /**
     * Met à jour le domaine de la plateforme
     * @param {object} options
     * @param {string} options.domain - Nouveau nom de domaine (optionnel)
     * @param {number} options.port - Nouveau port (optionnel)
     * @returns {Promise<Domain>}
     */
    async updatePlatformDomain(options) {
        const { domain: newDomain, port } = options;

        const platformDomain = await Domain.getPlatformDomain();
        if (!platformDomain) {
            throw new Error('No platform domain configured');
        }

        // Si changement de domaine
        if (newDomain && newDomain !== platformDomain.domain) {
            // Vérifier disponibilité
            const isAvailable = await Domain.isAvailable(newDomain);
            if (!isAvailable) {
                throw new Error(`Domain '${newDomain}' is already registered`);
            }

            // Supprimer l'ancienne config
            await this.disableNginxSite(platformDomain.domain);
            await this.removeNginxConfig(platformDomain.domain);
            await this.removeCertificate(platformDomain.domain);

            // Mettre à jour le domaine
            platformDomain.domain = newDomain.toLowerCase();

            // Générer nouveau certificat
            if (platformDomain.ssl.enabled) {
                await this.generateCertificate(platformDomain.domain);
                platformDomain.ssl.generatedAt = new Date();
                platformDomain.ssl.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            }
        }

        // Si changement de port
        if (port) {
            platformDomain.targetPort = port;
        }

        // Reconfigurer Nginx
        await this.createNginxConfig(platformDomain);
        await this.enableNginxSite(platformDomain.domain);
        await this.reloadNginx();

        platformDomain.nginx.lastReload = new Date();
        await platformDomain.save();

        return platformDomain;
    }
}

// Singleton
const domainManager = new DomainManager();

module.exports = domainManager;
module.exports.DomainManager = DomainManager;
