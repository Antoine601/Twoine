/**
 * TWOINE - Services API Routes
 * Endpoints pour la gestion des services au sein des sites
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { ServiceManager, serviceManager } = require('../services/ServiceManager');
const Site = require('../models/Site');
const Service = require('../models/Service');

// Middleware
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Validation middleware
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

// Middleware pour vérifier l'accès au site parent
const checkSiteAccess = async (req, res, next) => {
    try {
        const siteId = req.params.siteId || req.body.siteId;
        
        if (!siteId) {
            return res.status(400).json({
                success: false,
                error: 'Site ID is required',
            });
        }

        const site = await Site.findById(siteId);
        
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
                error: 'Access denied to this site',
            });
        }

        req.site = site;
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

// ============================================================================
// SERVICES CRUD
// ============================================================================

/**
 * GET /api/sites/:siteId/services
 * Liste tous les services d'un site
 */
router.get('/sites/:siteId/services',
    authenticate,
    [
        param('siteId').isMongoId(),
    ],
    validate,
    checkSiteAccess,
    async (req, res) => {
        try {
            const services = await serviceManager.listServices(req.params.siteId);

            res.json({
                success: true,
                data: services,
                count: services.length,
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
 * POST /api/sites/:siteId/services
 * Créer un nouveau service dans un site
 */
router.post('/sites/:siteId/services',
    authenticate,
    authorize('admin', 'user'),
    [
        param('siteId').isMongoId(),
        body('name')
            .trim()
            .isLength({ min: 2, max: 30 })
            .matches(/^[a-z][a-z0-9_-]*$/),
        body('displayName')
            .trim()
            .isLength({ min: 1, max: 100 }),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 }),
        body('type')
            .isIn(['node', 'python', 'php', 'ruby', 'go', 'rust', 'java', 'dotnet', 'static', 'custom']),
        body('commands.start')
            .trim()
            .isLength({ min: 1, max: 500 }),
        body('commands.install')
            .optional()
            .trim()
            .isLength({ max: 500 }),
        body('commands.build')
            .optional()
            .trim()
            .isLength({ max: 500 }),
        body('port')
            .optional()
            .isInt({ min: 1024, max: 65535 }),
        body('autoStart')
            .optional()
            .isBoolean(),
    ],
    validate,
    checkSiteAccess,
    async (req, res) => {
        try {
            const service = await serviceManager.createService({
                siteId: req.params.siteId,
                name: req.body.name,
                displayName: req.body.displayName,
                description: req.body.description,
                type: req.body.type,
                commands: req.body.commands,
                port: req.body.port,
                environment: req.body.environment,
                autoStart: req.body.autoStart,
            });

            res.status(201).json({
                success: true,
                data: service,
                message: `Service '${service.name}' created successfully`,
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
 * GET /api/services/:serviceId
 * Obtenir les détails d'un service
 */
router.get('/services/:serviceId',
    authenticate,
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const result = await serviceManager.getServiceStatus(req.params.serviceId);

            // Vérifier les permissions via le site
            const site = await Site.findById(result.service.site);
            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            res.json({
                success: true,
                data: result,
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
 * PATCH /api/services/:serviceId
 * Mettre à jour un service
 */
router.patch('/services/:serviceId',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
        body('description').optional().trim().isLength({ max: 500 }),
        body('commands.start').optional().trim().isLength({ min: 1, max: 500 }),
        body('commands.install').optional().trim().isLength({ max: 500 }),
        body('commands.build').optional().trim().isLength({ max: 500 }),
        body('autoStart').optional().isBoolean(),
        body('resources.maxMemoryMB').optional().isInt({ min: 64, max: 4096 }),
        body('resources.maxCpuPercent').optional().isInt({ min: 10, max: 100 }),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({
                    success: false,
                    error: 'Service not found',
                });
            }

            // Vérifier les permissions
            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            const updatedService = await serviceManager.updateService(
                req.params.serviceId,
                req.body
            );

            res.json({
                success: true,
                data: updatedService,
                message: 'Service updated',
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
 * DELETE /api/services/:serviceId
 * Supprimer un service
 */
router.delete('/services/:serviceId',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        query('force').optional().isBoolean().toBoolean(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({
                    success: false,
                    error: 'Service not found',
                });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }

            await serviceManager.deleteService(req.params.serviceId, req.query.force === true);

            res.json({
                success: true,
                message: `Service '${service.name}' deleted`,
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
// SERVICE ACTIONS (Start/Stop/Restart)
// ============================================================================

/**
 * POST /api/services/:serviceId/start
 * Démarrer un service
 */
router.post('/services/:serviceId/start',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.startService(req.params.serviceId);

            res.json({
                success: true,
                data: result,
                message: `Service '${service.name}' started`,
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
 * POST /api/services/:serviceId/stop
 * Arrêter un service
 */
router.post('/services/:serviceId/stop',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.stopService(req.params.serviceId);

            res.json({
                success: true,
                data: result,
                message: `Service '${service.name}' stopped`,
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
 * POST /api/services/:serviceId/restart
 * Redémarrer un service
 */
router.post('/services/:serviceId/restart',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.restartService(req.params.serviceId);

            res.json({
                success: true,
                data: result,
                message: `Service '${service.name}' restarted`,
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
 * GET /api/services/:serviceId/status
 * Obtenir le statut d'un service
 */
router.get('/services/:serviceId/status',
    authenticate,
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const result = await serviceManager.getServiceStatus(req.params.serviceId);

            const site = await Site.findById(result.service.site);
            if (req.user.role !== 'admin' && 
                site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            res.json({
                success: true,
                data: {
                    name: result.service.name,
                    status: result.systemd.active,
                    running: result.systemd.running,
                    enabled: result.systemd.enabled,
                    pid: result.systemd.pid,
                    uptime: result.systemd.uptime,
                    memory: result.systemd.memory,
                    port: result.service.port,
                },
            });
        } catch (error) {
            res.status(404).json({
                success: false,
                error: error.message,
            });
        }
    }
);

// ============================================================================
// SERVICE BUILD/INSTALL
// ============================================================================

/**
 * POST /api/services/:serviceId/install
 * Exécuter la commande d'installation
 */
router.post('/services/:serviceId/install',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.installService(req.params.serviceId);

            res.json({
                success: result.success,
                data: result,
                message: result.success ? 'Installation completed' : 'Installation failed',
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
 * POST /api/services/:serviceId/build
 * Exécuter la commande de build
 */
router.post('/services/:serviceId/build',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.buildService(req.params.serviceId);

            res.json({
                success: result.success,
                data: result,
                message: result.success ? 'Build completed' : 'Build failed',
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
 * GET /api/services/:serviceId/health
 * Vérifier la santé d'un service
 */
router.get('/services/:serviceId/health',
    authenticate,
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const result = await serviceManager.checkServiceHealth(req.params.serviceId);

            res.json({
                success: true,
                data: result,
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
// SERVICE ENVIRONMENT
// ============================================================================

/**
 * PUT /api/services/:serviceId/environment
 * Mettre à jour les variables d'environnement d'un service
 */
router.put('/services/:serviceId/environment',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        body('variables').isObject(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            // Valider les clés
            for (const key of Object.keys(req.body.variables)) {
                if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid environment variable name: ${key}`,
                    });
                }
            }

            // Mettre à jour
            for (const [key, value] of Object.entries(req.body.variables)) {
                if (value === null || value === undefined) {
                    service.environment.delete(key);
                } else {
                    service.environment.set(key, String(value));
                }
            }

            await service.save();

            // Régénérer le fichier .env
            const { SiteManager, siteManager } = require('../services/SiteManager');
            await siteManager.updateServiceEnvFile(service);

            res.json({
                success: true,
                data: Object.fromEntries(service.environment),
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

// ============================================================================
// CUSTOM COMMANDS
// ============================================================================

/**
 * GET /api/services/:serviceId/commands
 * Liste les commandes custom d'un service
 */
router.get('/services/:serviceId/commands',
    authenticate,
    [
        param('serviceId').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            // Vérifier les permissions (readonly peut lire)
            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const commands = await serviceManager.listCustomCommands(req.params.serviceId);

            res.json({
                success: true,
                data: commands,
                count: commands.length,
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
 * POST /api/services/:serviceId/commands
 * Ajouter une commande custom à un service
 */
router.post('/services/:serviceId/commands',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        body('name')
            .trim()
            .isLength({ min: 2, max: 30 })
            .matches(/^[a-z][a-z0-9_-]*$/),
        body('displayName')
            .optional()
            .trim()
            .isLength({ max: 50 }),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 200 }),
        body('command')
            .trim()
            .isLength({ min: 1, max: 500 }),
        body('timeout')
            .optional()
            .isInt({ min: 10, max: 3600 }),
        body('requiresStop')
            .optional()
            .isBoolean(),
        body('dangerous')
            .optional()
            .isBoolean(),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const updatedService = await serviceManager.addCustomCommand(
                req.params.serviceId,
                req.body
            );

            res.status(201).json({
                success: true,
                data: updatedService.customCommands,
                message: `Custom command '${req.body.name}' added`,
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
 * DELETE /api/services/:serviceId/commands/:commandName
 * Supprimer une commande custom
 */
router.delete('/services/:serviceId/commands/:commandName',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        param('commandName').matches(/^[a-z][a-z0-9_-]*$/),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            await serviceManager.removeCustomCommand(
                req.params.serviceId,
                req.params.commandName
            );

            res.json({
                success: true,
                message: `Custom command '${req.params.commandName}' removed`,
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
 * POST /api/services/:serviceId/commands/:commandName/execute
 * Exécuter une commande custom
 */
router.post('/services/:serviceId/commands/:commandName/execute',
    authenticate,
    authorize('admin', 'user'),
    [
        param('serviceId').isMongoId(),
        param('commandName').matches(/^[a-z][a-z0-9_-]*$/),
    ],
    validate,
    async (req, res) => {
        try {
            const service = await Service.findById(req.params.serviceId).populate('site');
            
            if (!service) {
                return res.status(404).json({ success: false, error: 'Service not found' });
            }

            if (req.user.role !== 'admin' && 
                service.site.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            // Vérifier si la commande est dangereuse
            const customCmd = service.customCommands.find(c => c.name === req.params.commandName);
            if (customCmd && customCmd.dangerous && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'This command is marked as dangerous. Only admins can execute it.',
                });
            }

            const result = await serviceManager.executeCustomCommand(
                req.params.serviceId,
                req.params.commandName
            );

            res.json({
                success: result.success,
                data: result,
                message: result.success 
                    ? `Command '${req.params.commandName}' executed successfully`
                    : `Command '${req.params.commandName}' failed`,
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
// ADMIN ROUTES - All services overview
// ============================================================================

/**
 * GET /api/admin/services
 * Liste tous les services (admin seulement)
 */
router.get('/admin/services',
    authenticate,
    authorize('admin'),
    [
        query('status').optional().isIn(['running', 'stopped', 'failed', 'unknown']),
        query('type').optional().isIn(['node', 'python', 'php', 'ruby', 'go', 'rust', 'java', 'dotnet', 'static', 'custom']),
    ],
    validate,
    async (req, res) => {
        try {
            const filter = {};
            
            if (req.query.status) {
                filter['status.current'] = req.query.status;
            }
            if (req.query.type) {
                filter.type = req.query.type;
            }

            const services = await Service.find(filter)
                .populate('site', 'name displayName status')
                .sort({ 'site.name': 1, name: 1 });

            // Récupérer les statuts systemd en parallèle
            const { SystemdManager } = require('../services/SystemdManager');
            const systemd = new SystemdManager();
            
            const servicesWithStatus = await Promise.all(
                services.map(async (service) => {
                    const status = await systemd.getServiceStatus(service.systemd.serviceName).catch(() => ({
                        running: false,
                        active: 'unknown',
                    }));
                    return {
                        ...service.toObject(),
                        systemdStatus: status,
                    };
                })
            );

            res.json({
                success: true,
                data: servicesWithStatus,
                count: servicesWithStatus.length,
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
 * POST /api/admin/services/bulk-action
 * Actions groupées sur les services (admin seulement)
 */
router.post('/admin/services/bulk-action',
    authenticate,
    authorize('admin'),
    [
        body('action').isIn(['start', 'stop', 'restart']),
        body('serviceIds').isArray({ min: 1 }),
        body('serviceIds.*').isMongoId(),
    ],
    validate,
    async (req, res) => {
        try {
            const { action, serviceIds } = req.body;
            const results = [];

            for (const serviceId of serviceIds) {
                try {
                    let result;
                    switch (action) {
                        case 'start':
                            result = await serviceManager.startService(serviceId);
                            break;
                        case 'stop':
                            result = await serviceManager.stopService(serviceId);
                            break;
                        case 'restart':
                            result = await serviceManager.restartService(serviceId);
                            break;
                    }
                    results.push({
                        serviceId,
                        success: true,
                        result,
                    });
                } catch (error) {
                    results.push({
                        serviceId,
                        success: false,
                        error: error.message,
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            res.json({
                success: true,
                data: results,
                summary: {
                    total: serviceIds.length,
                    success: successCount,
                    failed: serviceIds.length - successCount,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
);

module.exports = router;
