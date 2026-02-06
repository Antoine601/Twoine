/**
 * TWOINE - Stats Service
 * Service de gestion des statistiques avec historique et alertes
 */

const { ServerStats, SiteStats, Alert, MonitoringConfig } = require('../models/Stats');
const { systemMonitor } = require('./SystemMonitor');
const Site = require('../models/Site');
const Service = require('../models/Service');
const User = require('../models/User');
const EventEmitter = require('events');

/**
 * Service de collecte et gestion des statistiques
 */
class StatsService extends EventEmitter {
    constructor() {
        super();
        this.collectionInterval = null;
        this.config = null;
        this.isCollecting = false;
        this.lastServerStats = null;
        this.lastSiteStats = new Map();
    }

    /**
     * Initialise le service de statistiques
     */
    async initialize() {
        try {
            this.config = await MonitoringConfig.getConfig();
            console.log('[StatsService] Initialized with config:', {
                interval: this.config.collectionInterval,
                alertsEnabled: this.config.alertsEnabled,
            });
        } catch (error) {
            console.error('[StatsService] Failed to initialize:', error.message);
            // Utiliser config par défaut
            this.config = {
                collectionInterval: 30,
                alertsEnabled: true,
                siteStatsEnabled: true,
                alertThresholds: {
                    cpu: { warning: 70, critical: 90 },
                    memory: { warning: 75, critical: 90 },
                    disk: { warning: 80, critical: 95 },
                },
            };
        }
    }

    /**
     * Démarre la collecte périodique
     */
    startCollection() {
        if (this.collectionInterval) {
            console.log('[StatsService] Collection already running');
            return;
        }

        const intervalMs = (this.config?.collectionInterval || 30) * 1000;
        
        // Collecte initiale
        this.collectAndStore();

        // Collecte périodique
        this.collectionInterval = setInterval(() => {
            this.collectAndStore();
        }, intervalMs);

        console.log(`[StatsService] Started collection every ${intervalMs / 1000}s`);
    }

    /**
     * Arrête la collecte périodique
     */
    stopCollection() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
            console.log('[StatsService] Stopped collection');
        }
    }

    /**
     * Collecte et stocke les statistiques
     */
    async collectAndStore() {
        if (this.isCollecting) {
            console.log('[StatsService] Skipping collection - previous still running');
            return;
        }

        this.isCollecting = true;
        const startTime = Date.now();

        try {
            // Collecte stats serveur
            const systemStats = await systemMonitor.collectSystemStats();
            
            // Compteurs globaux
            const [sitesCount, servicesCount, usersCount, runningServices, stoppedServices] = await Promise.all([
                Site.countDocuments({ status: { $ne: 'deleted' } }),
                Service.countDocuments(),
                User.countDocuments({ status: { $ne: 'deleted' } }),
                Service.countDocuments({ 'status.current': 'running' }),
                Service.countDocuments({ 'status.current': { $in: ['stopped', 'failed'] } }),
            ]);

            // Créer snapshot serveur
            const serverStats = new ServerStats({
                cpu: systemStats.cpu,
                memory: systemStats.memory,
                disk: systemStats.disk,
                network: systemStats.network,
                processes: systemStats.processes,
                uptime: systemStats.uptime,
                totals: {
                    sites: sitesCount,
                    services: servicesCount,
                    users: usersCount,
                    servicesRunning: runningServices,
                    servicesStopped: stoppedServices,
                },
            });

            await serverStats.save();
            this.lastServerStats = serverStats;

            // Émettre pour WebSocket
            this.emit('serverStats', this.formatServerStats(serverStats));

            // Vérifier alertes serveur
            if (this.config?.alertsEnabled) {
                await this.checkServerAlerts(systemStats);
            }

            // Collecte stats par site
            if (this.config?.siteStatsEnabled) {
                await this.collectSiteStats();
            }

            const duration = Date.now() - startTime;
            if (duration > 5000) {
                console.log(`[StatsService] Collection took ${duration}ms`);
            }
        } catch (error) {
            console.error('[StatsService] Collection error:', error.message);
        } finally {
            this.isCollecting = false;
        }
    }

    /**
     * Collecte les statistiques de tous les sites
     */
    async collectSiteStats() {
        try {
            const sites = await Site.find({ status: 'active' }).lean();
            
            for (const site of sites) {
                try {
                    const stats = await systemMonitor.getSiteStats(site);
                    
                    // Compter services du site
                    const services = await Service.find({ site: site._id }).lean();
                    stats.services.total = services.length;
                    stats.services.running = services.filter(s => s.status?.current === 'running').length;
                    stats.services.stopped = services.filter(s => s.status?.current === 'stopped').length;
                    stats.services.failed = services.filter(s => s.status?.current === 'failed').length;

                    // Créer snapshot site
                    const siteStats = new SiteStats({
                        site: site._id,
                        cpu: stats.cpu,
                        memory: stats.memory,
                        disk: stats.disk,
                        services: stats.services,
                    });

                    await siteStats.save();
                    this.lastSiteStats.set(site._id.toString(), siteStats);

                    // Émettre pour WebSocket
                    this.emit('siteStats', {
                        siteId: site._id.toString(),
                        stats: this.formatSiteStats(siteStats),
                    });
                } catch (error) {
                    console.error(`[StatsService] Error collecting stats for site ${site.name}:`, error.message);
                }
            }
        } catch (error) {
            console.error('[StatsService] Error collecting site stats:', error.message);
        }
    }

    /**
     * Vérifie les seuils d'alerte serveur
     * @param {Object} stats 
     */
    async checkServerAlerts(stats) {
        const thresholds = this.config?.alertThresholds || {};

        // CPU
        if (stats.cpu?.percent >= (thresholds.cpu?.critical || 90)) {
            await this.createAlert('cpu_high', 'critical', `CPU critique: ${stats.cpu.percent}%`, { value: stats.cpu.percent });
        } else if (stats.cpu?.percent >= (thresholds.cpu?.warning || 70)) {
            await this.createAlert('cpu_high', 'warning', `CPU élevé: ${stats.cpu.percent}%`, { value: stats.cpu.percent });
        }

        // Memory
        if (stats.memory?.percent >= (thresholds.memory?.critical || 90)) {
            await this.createAlert('memory_high', 'critical', `Mémoire critique: ${stats.memory.percent}%`, { value: stats.memory.percent });
        } else if (stats.memory?.percent >= (thresholds.memory?.warning || 75)) {
            await this.createAlert('memory_high', 'warning', `Mémoire élevée: ${stats.memory.percent}%`, { value: stats.memory.percent });
        }

        // Disk
        if (stats.disk?.percent >= (thresholds.disk?.critical || 95)) {
            await this.createAlert('disk_high', 'critical', `Disque critique: ${stats.disk.percent}%`, { value: stats.disk.percent });
        } else if (stats.disk?.percent >= (thresholds.disk?.warning || 80)) {
            await this.createAlert('disk_high', 'warning', `Disque élevé: ${stats.disk.percent}%`, { value: stats.disk.percent });
        }
    }

    /**
     * Crée une alerte si elle n'existe pas déjà
     * @param {string} type 
     * @param {string} severity 
     * @param {string} message 
     * @param {Object} data 
     * @param {string} siteId 
     * @param {string} serviceId 
     */
    async createAlert(type, severity, message, data = {}, siteId = null, serviceId = null) {
        try {
            // Vérifier si une alerte similaire existe déjà (active dans les 5 dernières minutes)
            const recentAlert = await Alert.findOne({
                type,
                severity,
                status: 'active',
                createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
                site: siteId,
                service: serviceId,
            });

            if (recentAlert) {
                return recentAlert;
            }

            const alert = new Alert({
                type,
                severity,
                message,
                data,
                site: siteId,
                service: serviceId,
            });

            await alert.save();
            
            // Émettre pour WebSocket
            this.emit('alert', this.formatAlert(alert));

            console.log(`[StatsService] Alert created: ${type} (${severity}) - ${message}`);
            return alert;
        } catch (error) {
            console.error('[StatsService] Error creating alert:', error.message);
            return null;
        }
    }

    /**
     * Obtient les dernières statistiques serveur
     * @returns {Promise<Object>}
     */
    async getServerStats() {
        // Retourner les stats en cache si récentes (< 5s)
        if (this.lastServerStats && 
            (Date.now() - new Date(this.lastServerStats.timestamp).getTime()) < 5000) {
            return this.formatServerStats(this.lastServerStats);
        }

        // Sinon collecter fraîches
        const systemStats = await systemMonitor.collectSystemStats();
        
        const [sitesCount, servicesCount, usersCount, runningServices, stoppedServices] = await Promise.all([
            Site.countDocuments({ status: { $ne: 'deleted' } }),
            Service.countDocuments(),
            User.countDocuments({ status: { $ne: 'deleted' } }),
            Service.countDocuments({ 'status.current': 'running' }),
            Service.countDocuments({ 'status.current': { $in: ['stopped', 'failed'] } }),
        ]);

        return {
            cpu: systemStats.cpu,
            memory: systemStats.memory,
            disk: systemStats.disk,
            network: systemStats.network,
            processes: systemStats.processes,
            uptime: systemStats.uptime,
            totals: {
                sites: sitesCount,
                services: servicesCount,
                users: usersCount,
                servicesRunning: runningServices,
                servicesStopped: stoppedServices,
            },
            system: systemMonitor.getSystemInfo(),
            networks: systemMonitor.getNetworkInterfaces(),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Obtient l'historique des stats serveur
     * @param {number} hours - Nombre d'heures d'historique
     * @param {number} limit - Nombre max de points
     * @returns {Promise<Object[]>}
     */
    async getServerHistory(hours = 1, limit = 60) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        const stats = await ServerStats.find({
            timestamp: { $gte: since },
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return stats.reverse().map(s => this.formatServerStats(s));
    }

    /**
     * Obtient les statistiques d'un site
     * @param {string} siteId 
     * @returns {Promise<Object>}
     */
    async getSiteStats(siteId) {
        const site = await Site.findById(siteId).lean();
        if (!site) {
            throw new Error('Site not found');
        }

        // Stats en cache
        const cached = this.lastSiteStats.get(siteId);
        if (cached && (Date.now() - new Date(cached.timestamp).getTime()) < 10000) {
            return this.formatSiteStats(cached);
        }

        // Collecter fraîches
        const stats = await systemMonitor.getSiteStats(site);
        
        // Compter services
        const services = await Service.find({ site: siteId }).lean();
        stats.services = {
            total: services.length,
            running: services.filter(s => s.status?.current === 'running').length,
            stopped: services.filter(s => s.status?.current === 'stopped').length,
            failed: services.filter(s => s.status?.current === 'failed').length,
        };

        // Domaines
        const Domain = require('../models/Domain');
        const domains = await Domain.find({ site: siteId }).lean();

        return {
            ...stats,
            site: {
                id: site._id,
                name: site.name,
                displayName: site.displayName,
                status: site.status,
            },
            domains: domains.map(d => ({ domain: d.domain, ssl: d.ssl?.enabled })),
            ports: {
                start: site.portRange?.start,
                end: site.portRange?.end,
            },
            limits: {
                memory: site.resources?.maxMemoryMB || 512,
                cpu: site.resources?.maxCpuPercent || 100,
                disk: site.resources?.maxDiskMB || 1024,
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Obtient l'historique des stats d'un site
     * @param {string} siteId 
     * @param {number} hours 
     * @param {number} limit 
     * @returns {Promise<Object[]>}
     */
    async getSiteHistory(siteId, hours = 1, limit = 60) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        const stats = await SiteStats.find({
            site: siteId,
            timestamp: { $gte: since },
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return stats.reverse().map(s => this.formatSiteStats(s));
    }

    /**
     * Obtient les statistiques de tous les sites
     * @returns {Promise<Object[]>}
     */
    async getAllSitesStats() {
        const sites = await Site.find({ status: { $ne: 'deleted' } }).lean();
        const results = [];

        for (const site of sites) {
            try {
                const stats = await this.getSiteStats(site._id.toString());
                results.push(stats);
            } catch (error) {
                results.push({
                    site: {
                        id: site._id,
                        name: site.name,
                        displayName: site.displayName,
                        status: site.status,
                    },
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Obtient les stats de tous les services d'un site
     * @param {string} siteId 
     * @returns {Promise<Object[]>}
     */
    async getSiteServicesStats(siteId) {
        const services = await Service.find({ site: siteId }).lean();
        const results = [];

        for (const service of services) {
            const systemdStats = await systemMonitor.getServiceStats(service.systemd?.serviceName);
            
            results.push({
                id: service._id,
                name: service.name,
                displayName: service.displayName,
                type: service.type,
                port: service.port,
                workingDir: service.workingDir,
                status: {
                    current: service.status?.current,
                    desired: service.status?.desired,
                },
                systemd: {
                    serviceName: service.systemd?.serviceName,
                    ...systemdStats,
                },
                resources: service.resources,
            });
        }

        return results;
    }

    /**
     * Obtient les alertes actives
     * @param {Object} filter 
     * @returns {Promise<Object[]>}
     */
    async getAlerts(filter = {}) {
        const query = { ...filter };
        if (!query.status) {
            query.status = { $in: ['active', 'acknowledged'] };
        }

        const alerts = await Alert.find(query)
            .populate('site', 'name displayName')
            .populate('service', 'name displayName')
            .populate('acknowledgedBy', 'username email')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return alerts.map(a => this.formatAlert(a));
    }

    /**
     * Acquitte une alerte
     * @param {string} alertId 
     * @param {string} userId 
     * @returns {Promise<Object>}
     */
    async acknowledgeAlert(alertId, userId) {
        const alert = await Alert.findByIdAndUpdate(
            alertId,
            {
                status: 'acknowledged',
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            },
            { new: true }
        ).populate('site service acknowledgedBy');

        if (!alert) {
            throw new Error('Alert not found');
        }

        this.emit('alertUpdated', this.formatAlert(alert));
        return this.formatAlert(alert);
    }

    /**
     * Résout une alerte
     * @param {string} alertId 
     * @returns {Promise<Object>}
     */
    async resolveAlert(alertId) {
        const alert = await Alert.findByIdAndUpdate(
            alertId,
            {
                status: 'resolved',
                resolvedAt: new Date(),
            },
            { new: true }
        ).populate('site service acknowledgedBy');

        if (!alert) {
            throw new Error('Alert not found');
        }

        this.emit('alertUpdated', this.formatAlert(alert));
        return this.formatAlert(alert);
    }

    /**
     * Met à jour la configuration du monitoring
     * @param {Object} updates 
     * @returns {Promise<Object>}
     */
    async updateConfig(updates) {
        const config = await MonitoringConfig.findByIdAndUpdate(
            'monitoring_config',
            { ...updates, updatedAt: new Date() },
            { new: true, upsert: true }
        );

        this.config = config;

        // Redémarrer la collecte si l'intervalle a changé
        if (updates.collectionInterval && this.collectionInterval) {
            this.stopCollection();
            this.startCollection();
        }

        return config;
    }

    /**
     * Obtient la configuration du monitoring
     * @returns {Promise<Object>}
     */
    async getConfig() {
        return await MonitoringConfig.getConfig();
    }

    /**
     * Formate les stats serveur pour l'API
     * @param {Object} stats 
     * @returns {Object}
     */
    formatServerStats(stats) {
        return {
            cpu: stats.cpu,
            memory: stats.memory,
            disk: stats.disk,
            network: stats.network,
            processes: stats.processes,
            uptime: stats.uptime,
            totals: stats.totals,
            timestamp: stats.timestamp?.toISOString() || new Date().toISOString(),
        };
    }

    /**
     * Formate les stats site pour l'API
     * @param {Object} stats 
     * @returns {Object}
     */
    formatSiteStats(stats) {
        return {
            cpu: stats.cpu,
            memory: stats.memory,
            disk: stats.disk,
            services: stats.services,
            requests: stats.requests,
            visitors: stats.visitors,
            timestamp: stats.timestamp?.toISOString() || new Date().toISOString(),
        };
    }

    /**
     * Formate une alerte pour l'API
     * @param {Object} alert 
     * @returns {Object}
     */
    formatAlert(alert) {
        return {
            id: alert._id,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            data: alert.data,
            status: alert.status,
            site: alert.site ? {
                id: alert.site._id || alert.site,
                name: alert.site.name,
                displayName: alert.site.displayName,
            } : null,
            service: alert.service ? {
                id: alert.service._id || alert.service,
                name: alert.service.name,
                displayName: alert.service.displayName,
            } : null,
            acknowledgedBy: alert.acknowledgedBy ? {
                id: alert.acknowledgedBy._id,
                username: alert.acknowledgedBy.username,
            } : null,
            acknowledgedAt: alert.acknowledgedAt?.toISOString(),
            createdAt: alert.createdAt?.toISOString(),
            resolvedAt: alert.resolvedAt?.toISOString(),
        };
    }
}

// Export singleton
const statsService = new StatsService();

module.exports = {
    StatsService,
    statsService,
};
