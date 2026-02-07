/**
 * TWOINE - Sites API Routes
 * Endpoints pour la gestion des sites hébergés
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { SiteManager, siteManager } = require('../services/SiteManager');
const { ServiceManager, serviceManager } = require('../services/ServiceManager');
const Site = require('../models/Site');
const Service = require('../models/Service');

// Middleware d'authentification (à implémenter selon votre système)
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Middleware de validation des erreurs
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array(),
        });
    }
    next();
};

// ============================================================================
// SITES CRUD
// ============================================================================

/**
 * GET /api/sites
 * Liste tous les sites (filtré par permissions)
 */
router.get('/',
    authenticate,
    [
        query('status').optional({ values: 'falsy' }).isIn(['pending', 'creating', 'active', 'stopped', 'error', 'deleting', 'deleted']),
        query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
        query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).toInt(),
    ],
    validate,
    async (req, res) => {
        try {
            const { status, search, page = 1, limit = 20 } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
            const filters = {};

            // Si pas admin, filtrer par propriétaire
            if (req.user.role !== 'admin') {
                filters.owner = req.user._id;
            }

            if (status) {
                filters.status = status;
            }

            if (search) {
                const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filters.$or = [
                    { name: { $regex: escapedSearch, $options: 'i' } },
                    { displayName: { $regex: escapedSearch, $options: 'i' } },
                ];
            }

            const sites = await Site.find(filters)
                .populate('owner', 'email username')
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .sort({ createdAt: -1 });

            const total = await Site.countDocuments(filters);

            res.json({
                success: true,
                data: sites,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            console.error('[SITES] List error:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites
 * Créer un nouveau site
 */
router.post('/',
    authenticate,
    authorize('admin', 'user'),
    [
        body('name')
            .trim()
            .isLength({ min: 3, max: 30 })
            .matches(/^[a-z][a-z0-9_-]*$/)
            .withMessage('Name must start with a letter, contain only lowercase letters, numbers, hyphens, underscores'),
        body('displayName')
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('Display name is required'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 }),
    ],
    validate,
    async (req, res) => {
        try {
            const { name, displayName, description } = req.body;

            const site = await siteManager.createSite({
                name,
                displayName,
                description,
                owner: req.user._id,
            });

            res.status(201).json({
                success: true,
                data: site,
                message: `Site '${name}' created successfully`,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * GET /api/sites/:siteId
 * Obtenir les détails d'un site
 */
router.get('/:siteId',
    authenticate,
    [
        param('siteId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const siteInfo = await siteManager.getSiteInfo(req.params.siteId);

            // Vérifier les permissions
            if (req.user.role !== 'admin' && 
                siteInfo.site.owner._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            res.json({
                success: true,
                data: siteInfo,
            });
        } catch (error) {
            res.status(404).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * PATCH /api/sites/:siteId
 * Mettre à jour un site
 */
router.patch('/:siteId',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
        body('description').optional().trim().isLength({ max: 500 }),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found',
                });
            }

            // Vérifier les permissions
            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            const { displayName, description } = req.body;
            
            if (displayName) site.displayName = displayName;
            if (description !== undefined) site.description = description;
            
            await site.save();

            res.json({
                success: true,
                data: site,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * DELETE /api/sites/:siteId
 * Supprimer un site
 */
router.delete('/:siteId',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        query('force').optional().isBoolean().toBoolean(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found',
                });
            }

            // Vérifier les permissions
            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            await siteManager.deleteSite(req.params.siteId, req.query.force === true);

            res.json({
                success: true,
                message: `Site '${site.name}' deleted successfully`,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

// ============================================================================
// SITES ACTIONS (Start/Stop/Restart)
// ============================================================================

/**
 * POST /api/sites/:siteId/start
 * Démarrer tous les services d'un site
 */
router.post('/:siteId/start',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            // Vérifier les permissions
            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const results = await siteManager.startSite(req.params.siteId);

            res.json({
                success: true,
                data: results,
                message: `Started ${results.started.length} services`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/stop
 * Arrêter tous les services d'un site
 */
router.post('/:siteId/stop',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const results = await siteManager.stopSite(req.params.siteId);

            res.json({
                success: true,
                data: results,
                message: `Stopped ${results.stopped.length} services`,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/restart
 * Redémarrer tous les services d'un site
 */
router.post('/:siteId/restart',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const results = await siteManager.restartSite(req.params.siteId);

            res.json({
                success: true,
                data: results,
                message: 'Site restarted',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);

// ============================================================================
// DOMAINS
// ============================================================================

/**
 * POST /api/sites/:siteId/domains
 * Ajouter un domaine à un site
 */
router.post('/:siteId/domains',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        body('domain')
            .trim()
            .isLength({ min: 3, max: 253 })
            .matches(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/),
        body('isPrimary').optional().isBoolean(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const { domain, isPrimary } = req.body;
            const updatedSite = await siteManager.addDomain(req.params.siteId, domain, isPrimary);

            res.status(201).json({
                success: true,
                data: updatedSite.domains,
                message: `Domain '${domain}' added`,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * DELETE /api/sites/:siteId/domains/:domain
 * Supprimer un domaine d'un site
 */
router.delete('/:siteId/domains/:domain',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        param('domain').trim().isLength({ min: 3 }),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const updatedSite = await siteManager.removeDomain(req.params.siteId, req.params.domain);

            res.json({
                success: true,
                data: updatedSite.domains,
                message: `Domain '${req.params.domain}' removed`,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * PUT /api/sites/:siteId/environment
 * Mettre à jour les variables d'environnement d'un site
 */
router.put('/:siteId/environment',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        body('variables').isObject(),
    ],
    validate,
    async (req, res) => {
        try {
            const site = await Site.findById(req.params.siteId);
            
            if (!site) {
                return res.status(404).json({ success: false, error: 'Site not found' });
            }

            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const updatedSite = await siteManager.updateEnvironment(
                req.params.siteId,
                req.body.variables
            );

            res.json({
                success: true,
                data: Object.fromEntries(updatedSite.environment),
                message: 'Environment variables updated',
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        }
    }
);

module.exports = router;
