/**
 * TWOINE - System Stats Routes
 * Routes pour les statistiques système et monitoring complet
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { adminOnly, anyAuthenticated } = require('../middleware/authorize');
const { statsService } = require('../services/StatsService');
const { systemMonitor } = require('../services/SystemMonitor');
const Site = require('../models/Site');
const Service = require('../models/Service');
const User = require('../models/User');

/**
 * GET /stats/server
 * Statistiques serveur globales (admin only)
 */
router.get('/server', authenticate, adminOnly, async (req, res) => {
    try {
        const stats = await statsService.getServerStats();
        
        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('[STATS] Server stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get server stats',
        });
    }
});

/**
 * GET /stats/server/history
 * Historique des statistiques serveur (admin only)
 */
router.get('/server/history', authenticate, adminOnly, async (req, res) => {
    try {
        const hours = Math.min(parseInt(req.query.hours, 10) || 1, 24);
        const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
        
        const history = await statsService.getServerHistory(hours, limit);
        
        res.json({
            success: true,
            data: history,
        });
    } catch (error) {
        console.error('[STATS] Server history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get server history',
        });
    }
});

/**
 * GET /stats/system
 * Statistiques système en temps réel (tous les utilisateurs authentifiés)
 * Version simplifiée pour les non-admins
 */
router.get('/system', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const stats = await statsService.getServerStats();
        
        // Si non-admin, masquer certaines infos sensibles
        if (req.user.role !== 'admin') {
            delete stats.network;
            delete stats.processes;
            delete stats.system;
            delete stats.networks;
        }
        
        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('[STATS] System stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system stats',
        });
    }
});

/**
 * GET /stats/sites
 * Statistiques de tous les sites (admin only)
 */
router.get('/sites', authenticate, adminOnly, async (req, res) => {
    try {
        const sitesStats = await statsService.getAllSitesStats();
        
        res.json({
            success: true,
            data: sitesStats,
        });
    } catch (error) {
        console.error('[STATS] Sites stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sites stats',
        });
    }
});

/**
 * GET /stats/site/:siteId
 * Statistiques d'un site spécifique
 */
router.get('/site/:siteId', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const { siteId } = req.params;
        
        // Vérifier l'accès au site
        if (req.user.role !== 'admin') {
            const user = await User.findById(req.user.userId);
            const hasAccess = user?.sites?.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this site',
                });
            }
        }
        
        const stats = await statsService.getSiteStats(siteId);
        
        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('[STATS] Site stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get site stats',
        });
    }
});

/**
 * GET /stats/site/:siteId/history
 * Historique des statistiques d'un site
 */
router.get('/site/:siteId/history', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const { siteId } = req.params;
        
        // Vérifier l'accès au site
        if (req.user.role !== 'admin') {
            const user = await User.findById(req.user.userId);
            const hasAccess = user?.sites?.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this site',
                });
            }
        }
        
        const hours = Math.min(parseInt(req.query.hours, 10) || 1, 24);
        const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
        
        const history = await statsService.getSiteHistory(siteId, hours, limit);
        
        res.json({
            success: true,
            data: history,
        });
    } catch (error) {
        console.error('[STATS] Site history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get site history',
        });
    }
});

/**
 * GET /stats/services/:siteId
 * Statistiques des services d'un site
 */
router.get('/services/:siteId', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const { siteId } = req.params;
        
        // Vérifier l'accès au site
        if (req.user.role !== 'admin') {
            const user = await User.findById(req.user.userId);
            const hasAccess = user?.sites?.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this site',
                });
            }
        }
        
        const servicesStats = await statsService.getSiteServicesStats(siteId);
        
        res.json({
            success: true,
            data: servicesStats,
        });
    } catch (error) {
        console.error('[STATS] Services stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get services stats',
        });
    }
});

/**
 * GET /stats/services
 * Statistiques globales des services (admin only)
 */
router.get('/services', authenticate, adminOnly, async (req, res) => {
    try {
        const [total, running, stopped, failed] = await Promise.all([
            Service.countDocuments(),
            Service.countDocuments({ 'status.current': 'running' }),
            Service.countDocuments({ 'status.current': 'stopped' }),
            Service.countDocuments({ 'status.current': 'failed' }),
        ]);

        // Liste de tous les services avec leur état
        const twoineServices = await systemMonitor.listTwoineServicesStatus();

        res.json({
            success: true,
            data: {
                total,
                running,
                stopped,
                failed,
                services: twoineServices,
            },
        });
    } catch (error) {
        console.error('[STATS] Services stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get services stats',
        });
    }
});

/**
 * GET /stats/databases
 * Statistiques des bases de données (admin only)
 */
router.get('/databases', authenticate, adminOnly, async (req, res) => {
    try {
        const Database = require('../models/Database');
        
        const [total, mongodb, mysql, postgresql] = await Promise.all([
            Database.countDocuments(),
            Database.countDocuments({ type: 'mongodb' }),
            Database.countDocuments({ type: 'mysql' }),
            Database.countDocuments({ type: 'postgresql' }),
        ]);

        res.json({
            success: true,
            data: {
                total,
                byType: {
                    mongodb,
                    mysql,
                    postgresql,
                },
            },
        });
    } catch (error) {
        console.error('[STATS] Databases stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get databases stats',
        });
    }
});

/**
 * GET /stats/alerts
 * Liste des alertes actives
 */
router.get('/alerts', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const filter = {};
        
        // Filtrer par statut si spécifié
        if (req.query.status) {
            filter.status = req.query.status;
        }
        
        // Filtrer par site si non-admin
        if (req.user.role !== 'admin') {
            const user = await User.findById(req.user.userId);
            const siteIds = user?.sites?.map(s => s.site) || [];
            filter.$or = [
                { site: { $in: siteIds } },
                { site: null }, // Alertes globales visibles pour info
            ];
        }
        
        const alerts = await statsService.getAlerts(filter);
        
        res.json({
            success: true,
            data: alerts,
        });
    } catch (error) {
        console.error('[STATS] Alerts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get alerts',
        });
    }
});

/**
 * POST /stats/alerts/:alertId/acknowledge
 * Acquitter une alerte
 */
router.post('/alerts/:alertId/acknowledge', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const { alertId } = req.params;
        
        const alert = await statsService.acknowledgeAlert(alertId, req.user.userId);
        
        res.json({
            success: true,
            data: alert,
        });
    } catch (error) {
        console.error('[STATS] Acknowledge alert error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to acknowledge alert',
        });
    }
});

/**
 * POST /stats/alerts/:alertId/resolve
 * Résoudre une alerte (admin only)
 */
router.post('/alerts/:alertId/resolve', authenticate, adminOnly, async (req, res) => {
    try {
        const { alertId } = req.params;
        
        const alert = await statsService.resolveAlert(alertId);
        
        res.json({
            success: true,
            data: alert,
        });
    } catch (error) {
        console.error('[STATS] Resolve alert error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to resolve alert',
        });
    }
});

/**
 * GET /stats/config
 * Configuration du monitoring (admin only)
 */
router.get('/config', authenticate, adminOnly, async (req, res) => {
    try {
        const config = await statsService.getConfig();
        
        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        console.error('[STATS] Config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get monitoring config',
        });
    }
});

/**
 * PUT /stats/config
 * Mettre à jour la configuration du monitoring (admin only)
 */
router.put('/config', authenticate, adminOnly, async (req, res) => {
    try {
        const allowedFields = [
            'collectionInterval',
            'alertThresholds',
            'alertsEnabled',
            'siteStatsEnabled',
            'retentionHours',
        ];
        
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }
        
        const config = await statsService.updateConfig(updates);
        
        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        console.error('[STATS] Update config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update monitoring config',
        });
    }
});

/**
 * GET /stats/websocket
 * Statistiques du service WebSocket (admin only)
 */
router.get('/websocket', authenticate, adminOnly, async (req, res) => {
    try {
        const { webSocketService } = require('../services/WebSocketService');
        const wsStats = webSocketService.getStats();
        
        res.json({
            success: true,
            data: wsStats,
        });
    } catch (error) {
        console.error('[STATS] WebSocket stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get WebSocket stats',
        });
    }
});

module.exports = router;
