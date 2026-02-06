/**
 * TWOINE - Database Routes
 * API pour la gestion des bases de données
 */

const express = require('express');
const router = express.Router();
const { databaseManager } = require('../services/DatabaseManager');
const Database = require('../models/Database');
const Site = require('../models/Site');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// ============================================
// ROUTES ADMIN - Gestion globale
// ============================================

/**
 * GET /api/admin/databases
 * Liste toutes les bases de données (admin seulement)
 */
router.get('/admin/databases', authorize('admin'), async (req, res) => {
    try {
        const { type, status, siteId } = req.query;
        
        const query = { status: { $ne: 'deleted' } };
        if (type) query.type = type;
        if (status) query.status = status;
        if (siteId) query.site = siteId;

        const databases = await Database.find(query)
            .populate('site', 'name displayName')
            .populate('createdBy', 'username email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: databases.length,
            databases,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/databases
 * Crée une nouvelle base de données (admin seulement)
 */
router.post('/admin/databases', authorize('admin'), async (req, res) => {
    try {
        const { name, type, siteId, displayName } = req.body;

        if (!name || !type || !siteId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, type, siteId',
            });
        }

        const database = await databaseManager.createDatabase({
            name,
            type,
            siteId,
            displayName,
            createdBy: req.user._id,
        });

        res.status(201).json({
            success: true,
            message: 'Database created successfully',
            database,
            credentials: database.credentials,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/databases/link
 * Lie une base de données existante (admin seulement)
 */
router.post('/admin/databases/link', authorize('admin'), async (req, res) => {
    try {
        const { name, type, siteId, displayName, host, port, databaseName, username, password } = req.body;

        if (!name || !type || !siteId || !username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, type, siteId, username, password',
            });
        }

        const database = await databaseManager.linkExternalDatabase({
            name,
            type,
            siteId,
            displayName,
            host,
            port,
            databaseName,
            username,
            password,
            createdBy: req.user._id,
        });

        res.status(201).json({
            success: true,
            message: 'External database linked successfully',
            database,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/admin/databases/:id
 * Obtient les détails d'une base (admin seulement)
 */
router.get('/admin/databases/:id', authorize('admin'), async (req, res) => {
    try {
        const info = await databaseManager.getDatabaseInfo(req.params.id);

        res.json({
            success: true,
            database: info,
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * DELETE /api/admin/databases/:id
 * Supprime une base de données (admin seulement)
 */
router.delete('/admin/databases/:id', authorize('admin'), async (req, res) => {
    try {
        const { keepData } = req.query;

        await databaseManager.deleteDatabase(req.params.id, keepData === 'true');

        res.json({
            success: true,
            message: keepData === 'true' 
                ? 'Database unlinked (data preserved)'
                : 'Database deleted successfully',
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/databases/:id/reset-password
 * Réinitialise le mot de passe DB (admin seulement)
 */
router.post('/admin/databases/:id/reset-password', authorize('admin'), async (req, res) => {
    try {
        const credentials = await databaseManager.resetPassword(req.params.id);

        res.json({
            success: true,
            message: 'Password reset successfully',
            credentials,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/databases/:id/test
 * Teste la connexion à une base (admin seulement)
 */
router.post('/admin/databases/:id/test', authorize('admin'), async (req, res) => {
    try {
        const connected = await databaseManager.testConnection(req.params.id);

        res.json({
            success: true,
            connected,
            message: connected ? 'Connection successful' : 'Connection failed',
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/admin/databases/:id/stats
 * Statistiques d'une base (admin seulement)
 */
router.get('/admin/databases/:id/stats', authorize('admin'), async (req, res) => {
    try {
        const stats = await databaseManager.getDatabaseStats(req.params.id);

        res.json({
            success: true,
            stats,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// ROUTES SITE - Bases liées à un site
// ============================================

/**
 * GET /api/sites/:siteId/databases
 * Liste les bases d'un site
 */
router.get('/sites/:siteId/databases', async (req, res) => {
    try {
        const { siteId } = req.params;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const hasAccess = user.sites.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this site',
                });
            }
        }

        const databases = await Database.findBySite(siteId);

        res.json({
            success: true,
            count: databases.length,
            databases: databases.map(db => ({
                id: db._id,
                name: db.name,
                displayName: db.displayName,
                type: db.type,
                typeDisplayName: db.typeDisplayName,
                status: db.status,
                isExternal: db.isExternal,
                connectionUrl: db.getConnectionString(false),
                createdAt: db.createdAt,
            })),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/sites/:siteId/databases
 * Crée une base pour un site (user ou admin)
 */
router.post('/sites/:siteId/databases', async (req, res) => {
    try {
        const { siteId } = req.params;
        const { name, type, displayName } = req.body;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const siteAccess = user.sites.find(s => s.site.toString() === siteId);
            if (!siteAccess || siteAccess.accessLevel === 'readonly') {
                return res.status(403).json({
                    success: false,
                    error: 'Write access required to create databases',
                });
            }
        }

        // Readonly ne peut pas créer
        if (user.role === 'readonly') {
            return res.status(403).json({
                success: false,
                error: 'Readonly users cannot create databases',
            });
        }

        if (!name || !type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, type',
            });
        }

        const database = await databaseManager.createDatabase({
            name,
            type,
            siteId,
            displayName,
            createdBy: user._id,
        });

        res.status(201).json({
            success: true,
            message: 'Database created successfully',
            database: {
                id: database._id,
                name: database.name,
                type: database.type,
                status: database.status,
            },
            credentials: database.credentials,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/sites/:siteId/databases/:dbId
 * Détails d'une base d'un site
 */
router.get('/sites/:siteId/databases/:dbId', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const hasAccess = user.sites.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this site',
                });
            }
        }

        const database = await Database.findById(dbId).populate('site', 'name displayName');
        if (!database || database.site._id.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Database not found',
            });
        }

        // Obtenir les stats
        let stats = null;
        try {
            stats = await databaseManager.getDatabaseStats(dbId);
        } catch {}

        res.json({
            success: true,
            database: {
                id: database._id,
                name: database.name,
                displayName: database.displayName,
                type: database.type,
                typeDisplayName: database.typeDisplayName,
                status: database.status,
                isExternal: database.isExternal,
                connection: {
                    host: database.connection.host,
                    port: database.connection.port,
                    databaseName: database.connection.databaseName,
                },
                dbUser: {
                    username: database.dbUser.username,
                },
                connectionUrl: database.getConnectionString(false),
                envVariables: user.role !== 'readonly' ? database.getEnvVariables() : undefined,
                stats,
                createdAt: database.createdAt,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * DELETE /api/sites/:siteId/databases/:dbId
 * Supprime une base d'un site (user ou admin)
 */
router.delete('/sites/:siteId/databases/:dbId', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const { keepData } = req.query;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const siteAccess = user.sites.find(s => s.site.toString() === siteId);
            if (!siteAccess || siteAccess.accessLevel === 'readonly') {
                return res.status(403).json({
                    success: false,
                    error: 'Write access required to delete databases',
                });
            }
        }

        // Readonly ne peut pas supprimer
        if (user.role === 'readonly') {
            return res.status(403).json({
                success: false,
                error: 'Readonly users cannot delete databases',
            });
        }

        const database = await Database.findById(dbId);
        if (!database || database.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Database not found',
            });
        }

        await databaseManager.deleteDatabase(dbId, keepData === 'true');

        res.json({
            success: true,
            message: keepData === 'true'
                ? 'Database unlinked (data preserved)'
                : 'Database deleted successfully',
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/sites/:siteId/databases/:dbId/reset-password
 * Réinitialise le mot de passe (user ou admin)
 */
router.post('/sites/:siteId/databases/:dbId/reset-password', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const siteAccess = user.sites.find(s => s.site.toString() === siteId);
            if (!siteAccess || siteAccess.accessLevel === 'readonly') {
                return res.status(403).json({
                    success: false,
                    error: 'Write access required to reset password',
                });
            }
        }

        // Readonly ne peut pas reset
        if (user.role === 'readonly') {
            return res.status(403).json({
                success: false,
                error: 'Readonly users cannot reset passwords',
            });
        }

        const database = await Database.findById(dbId);
        if (!database || database.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Database not found',
            });
        }

        const credentials = await databaseManager.resetPassword(dbId);

        res.json({
            success: true,
            message: 'Password reset successfully',
            credentials,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/sites/:siteId/databases/:dbId/test
 * Teste la connexion
 */
router.post('/sites/:siteId/databases/:dbId/test', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const user = req.user;

        // Vérifier accès au site
        if (user.role !== 'admin') {
            const hasAccess = user.sites.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                });
            }
        }

        const database = await Database.findById(dbId);
        if (!database || database.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Database not found',
            });
        }

        const connected = await databaseManager.testConnection(dbId);

        res.json({
            success: true,
            connected,
            message: connected ? 'Connection successful' : 'Connection failed',
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// ROUTES USER - Mes bases
// ============================================

/**
 * GET /api/me/databases
 * Liste toutes mes bases (sur tous mes sites)
 */
router.get('/me/databases', async (req, res) => {
    try {
        const user = req.user;
        const databases = await databaseManager.listUserDatabases(user);

        res.json({
            success: true,
            count: databases.length,
            databases: databases.map(db => ({
                id: db._id,
                name: db.name,
                displayName: db.displayName,
                type: db.type,
                typeDisplayName: db.typeDisplayName,
                status: db.status,
                isExternal: db.isExternal,
                site: db.site,
                connectionUrl: db.getConnectionString(false),
                createdAt: db.createdAt,
            })),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// INTERFACE DB INTÉGRÉE (Simulation)
// ============================================

/**
 * GET /api/sites/:siteId/databases/:dbId/tables
 * Liste les tables/collections d'une base
 */
router.get('/sites/:siteId/databases/:dbId/tables', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const user = req.user;

        // Vérifier accès
        if (user.role !== 'admin') {
            const hasAccess = user.sites.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
        }

        const database = await Database.findById(dbId);
        if (!database || database.site.toString() !== siteId) {
            return res.status(404).json({ success: false, error: 'Database not found' });
        }

        // Cette fonctionnalité nécessite une implémentation spécifique par type de DB
        // Pour l'instant, retourner un placeholder
        res.json({
            success: true,
            message: 'Table listing requires database-specific client integration',
            note: 'Use the connection string to connect with your preferred client',
            connectionUrl: database.getConnectionString(false),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sites/:siteId/databases/:dbId/query
 * Exécute une requête simple (readonly = SELECT only)
 */
router.post('/sites/:siteId/databases/:dbId/query', async (req, res) => {
    try {
        const { siteId, dbId } = req.params;
        const { query } = req.body;
        const user = req.user;

        // Vérifier accès
        if (user.role !== 'admin') {
            const hasAccess = user.sites.some(s => s.site.toString() === siteId);
            if (!hasAccess) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }
        }

        // Readonly ne peut faire que des SELECT
        if (user.role === 'readonly') {
            const upperQuery = query.trim().toUpperCase();
            if (!upperQuery.startsWith('SELECT') && !upperQuery.startsWith('SHOW') && !upperQuery.startsWith('DESCRIBE')) {
                return res.status(403).json({
                    success: false,
                    error: 'Readonly users can only execute SELECT, SHOW, and DESCRIBE queries',
                });
            }
        }

        const database = await Database.findById(dbId);
        if (!database || database.site.toString() !== siteId) {
            return res.status(404).json({ success: false, error: 'Database not found' });
        }

        // Exécution de requêtes désactivée par sécurité
        // Nécessite une sandbox sécurisée pour être implémentée
        res.json({
            success: false,
            message: 'Direct query execution is disabled for security reasons',
            note: 'Use the connection string with a database client',
            connectionUrl: database.getConnectionString(false),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
