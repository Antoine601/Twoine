/**
 * TWOINE - User Routes
 * Routes pour les utilisateurs connectés (non-admin)
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Site = require('../models/Site');
const Service = require('../models/Service');
const authenticate = require('../middleware/authenticate');
const { checkMustChangePassword } = require('../middleware/authenticate');
const { 
    userOnly, 
    anyAuthenticated, 
    requireSiteAccess,
    requireSiteWriteAccess,
} = require('../middleware/authorize');

// Toutes les routes nécessitent authentification
router.use(authenticate);
router.use(checkMustChangePassword);

// ============================================
// MES SITES
// ============================================

/**
 * GET /me/sites
 * Obtenir la liste de mes sites
 */
router.get('/sites', anyAuthenticated, async (req, res) => {
    try {
        const user = req.user;

        // Admin voit tous les sites
        if (user.role === 'admin') {
            const sites = await Site.find()
                .select('name displayName status domains portRange createdAt')
                .populate('owner', 'username email')
                .sort({ createdAt: -1 });

            return res.json({
                success: true,
                data: sites,
            });
        }

        // User normal voit seulement ses sites
        const siteIds = user.sites.map(s => s.site);
        
        const sites = await Site.find({ _id: { $in: siteIds } })
            .select('name displayName status domains portRange createdAt')
            .populate('owner', 'username email');

        // Ajouter le niveau d'accès à chaque site
        const sitesWithAccess = sites.map(site => {
            const access = user.sites.find(s => s.site.toString() === site._id.toString());
            return {
                ...site.toObject(),
                accessLevel: access?.accessLevel || 'readonly',
            };
        });

        res.json({
            success: true,
            data: sitesWithAccess,
        });
    } catch (error) {
        console.error('[USER] Get sites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sites',
        });
    }
});

/**
 * GET /me/sites/:siteId
 * Obtenir les détails d'un de mes sites
 */
router.get('/sites/:siteId', requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;

        const site = await Site.findById(siteId)
            .populate('owner', 'username email');

        if (!site) {
            return res.status(404).json({
                success: false,
                error: 'Site not found',
            });
        }

        // Charger les services du site
        const services = await Service.find({ site: siteId })
            .select('name type status port');

        res.json({
            success: true,
            data: {
                site,
                services,
                accessLevel: req.siteAccess.accessLevel,
            },
        });
    } catch (error) {
        console.error('[USER] Get site error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get site',
        });
    }
});

/**
 * GET /me/sites/:siteId/services
 * Obtenir les services d'un de mes sites
 */
router.get('/sites/:siteId/services', requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;

        const services = await Service.find({ site: siteId });

        res.json({
            success: true,
            data: services,
        });
    } catch (error) {
        console.error('[USER] Get services error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get services',
        });
    }
});

/**
 * GET /me/sites/:siteId/stats
 * Obtenir les statistiques d'un de mes sites
 */
router.get('/sites/:siteId/stats', requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;

        const site = await Site.findById(siteId);
        if (!site) {
            return res.status(404).json({
                success: false,
                error: 'Site not found',
            });
        }

        const services = await Service.find({ site: siteId });

        // Calculer les stats
        const stats = {
            servicesCount: services.length,
            runningServices: services.filter(s => s.status === 'running').length,
            stoppedServices: services.filter(s => s.status === 'stopped').length,
            errorServices: services.filter(s => s.status === 'error').length,
            domainsCount: site.domains?.length || 0,
            sslEnabled: site.domains?.some(d => d.sslEnabled) || false,
            databaseEnabled: site.database?.enabled || false,
            portRange: site.portRange,
            usedPorts: services.map(s => s.port).filter(Boolean),
        };

        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error('[USER] Get site stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get site stats',
        });
    }
});

// ============================================
// COLLABORATEURS (pour les owners)
// ============================================

/**
 * GET /me/sites/:siteId/collaborators
 * Obtenir la liste des collaborateurs d'un site (si owner)
 */
router.get('/sites/:siteId/collaborators', requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;

        // Seuls les owners et admins peuvent voir les collaborateurs
        if (req.siteAccess.accessLevel !== 'owner' && !req.siteAccess.isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Only site owners can view collaborators',
            });
        }

        const collaborators = await User.find({ 'sites.site': siteId })
            .select('username email profile role sites');

        const result = collaborators.map(user => {
            const siteAccess = user.sites.find(s => s.site.toString() === siteId);
            return {
                _id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                accessLevel: siteAccess?.accessLevel,
                assignedAt: siteAccess?.assignedAt,
            };
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('[USER] Get collaborators error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get collaborators',
        });
    }
});

// ============================================
// MON COMPTE
// ============================================

/**
 * GET /me/stats
 * Mes statistiques personnelles
 */
router.get('/stats', anyAuthenticated, async (req, res) => {
    try {
        const user = req.user;

        let siteIds;
        if (user.role === 'admin') {
            const allSites = await Site.find().select('_id');
            siteIds = allSites.map(s => s._id);
        } else {
            siteIds = user.sites.map(s => s.site);
        }

        const [
            totalSites,
            totalServices,
            runningServices,
        ] = await Promise.all([
            Site.countDocuments({ _id: { $in: siteIds } }),
            Service.countDocuments({ site: { $in: siteIds } }),
            Service.countDocuments({ site: { $in: siteIds }, status: 'running' }),
        ]);

        res.json({
            success: true,
            data: {
                sites: totalSites,
                services: {
                    total: totalServices,
                    running: runningServices,
                },
                role: user.role,
                lastLogin: user.lastLoginAt,
            },
        });
    } catch (error) {
        console.error('[USER] Get my stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats',
        });
    }
});

/**
 * GET /me/activity
 * Mon activité récente
 */
router.get('/activity', anyAuthenticated, async (req, res) => {
    try {
        // TODO: Implémenter le logging d'activité
        res.json({
            success: true,
            data: [],
            message: 'Activity logging not yet implemented',
        });
    } catch (error) {
        console.error('[USER] Get activity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get activity',
        });
    }
});

module.exports = router;
