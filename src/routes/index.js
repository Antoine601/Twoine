/**
 * TWOINE - Routes Index
 * Configuration centralisée de toutes les routes API
 */

const express = require('express');
const router = express.Router();

const authRouter = require('./auth');
const adminRouter = require('./admin');
const adminConfigRouter = require('./adminConfig');
const statsRouter = require('./stats');
const usersRouter = require('./users');
const sitesRouter = require('./sites');
const servicesRouter = require('./services');
const filesRouter = require('./files');
const databasesRouter = require('./databases');
const domainsRouter = require('./domains');

// Health check de l'API (public, avant tout middleware d'auth)
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        version: process.env.TWOINE_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Routes d'authentification (publiques)
router.use('/auth', authRouter);

// Routes admin (admin seulement)
router.use('/admin', adminRouter);
router.use('/admin/config', adminConfigRouter);

// Routes statistiques système
router.use('/stats', statsRouter);

// Routes utilisateur connecté (/me/*)
router.use('/me', usersRouter);

// Routes sites
router.use('/sites', sitesRouter);

// Routes services (montées sur /api directement car elles ont leurs propres préfixes)
router.use('/', servicesRouter);

// Routes fichiers et SFTP (montées sur /api)
router.use('/', filesRouter);

// Routes bases de données (montées sur /api)
router.use('/', databasesRouter);

// Routes domaines (montées sur /api)
router.use('/', domainsRouter);

// Documentation des endpoints
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Twoine API v1.0.0',
        endpoints: {
            health: 'GET /api/health',
            auth: {
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                logoutAll: 'POST /api/auth/logout-all',
                refresh: 'POST /api/auth/refresh',
                changePassword: 'POST /api/auth/change-password',
                forgotPassword: 'POST /api/auth/forgot-password',
                resetPassword: 'POST /api/auth/reset-password',
                me: 'GET /api/auth/me',
                updateProfile: 'PUT /api/auth/me',
                sessions: 'GET /api/auth/sessions',
            },
            admin: {
                users: {
                    list: 'GET /api/admin/users',
                    create: 'POST /api/admin/users',
                    get: 'GET /api/admin/users/:id',
                    update: 'PUT /api/admin/users/:id',
                    delete: 'DELETE /api/admin/users/:id',
                    block: 'POST /api/admin/users/:id/block',
                    unblock: 'POST /api/admin/users/:id/unblock',
                    resetPassword: 'POST /api/admin/users/:id/reset-password',
                    impersonate: 'POST /api/admin/users/:id/impersonate',
                    assignSite: 'POST /api/admin/users/:id/sites',
                    removeSite: 'DELETE /api/admin/users/:id/sites/:siteId',
                },
                stopImpersonation: 'POST /api/admin/stop-impersonation',
                stats: 'GET /api/admin/stats',
                roles: 'GET /api/admin/roles',
            },
            me: {
                sites: 'GET /api/me/sites',
                site: 'GET /api/me/sites/:siteId',
                services: 'GET /api/me/sites/:siteId/services',
                stats: 'GET /api/me/stats',
            },
            sites: {
                list: 'GET /api/sites',
                create: 'POST /api/sites',
                get: 'GET /api/sites/:siteId',
                update: 'PATCH /api/sites/:siteId',
                delete: 'DELETE /api/sites/:siteId',
                start: 'POST /api/sites/:siteId/start',
                stop: 'POST /api/sites/:siteId/stop',
                restart: 'POST /api/sites/:siteId/restart',
                domains: {
                    add: 'POST /api/sites/:siteId/domains',
                    remove: 'DELETE /api/sites/:siteId/domains/:domain',
                },
                environment: 'PUT /api/sites/:siteId/environment',
            },
            services: {
                list: 'GET /api/sites/:siteId/services',
                create: 'POST /api/sites/:siteId/services',
                get: 'GET /api/services/:serviceId',
                update: 'PATCH /api/services/:serviceId',
                delete: 'DELETE /api/services/:serviceId',
                start: 'POST /api/services/:serviceId/start',
                stop: 'POST /api/services/:serviceId/stop',
                restart: 'POST /api/services/:serviceId/restart',
                status: 'GET /api/services/:serviceId/status',
                health: 'GET /api/services/:serviceId/health',
                install: 'POST /api/services/:serviceId/install',
                build: 'POST /api/services/:serviceId/build',
                environment: 'PUT /api/services/:serviceId/environment',
            },
            files: {
                list: 'GET /api/sites/:siteId/files?path=/',
                read: 'GET /api/sites/:siteId/files/read?path=/file.txt',
                write: 'POST /api/sites/:siteId/files/write',
                upload: 'POST /api/sites/:siteId/files/upload',
                download: 'GET /api/sites/:siteId/files/download?path=/file.txt',
                delete: 'DELETE /api/sites/:siteId/files?path=/file.txt',
                rename: 'POST /api/sites/:siteId/files/rename',
                mkdir: 'POST /api/sites/:siteId/files/mkdir',
                stats: 'GET /api/sites/:siteId/files/stats',
            },
            sftp: {
                info: 'GET /api/sites/:siteId/sftp',
                resetPassword: 'POST /api/sites/:siteId/sftp/reset-password',
                enable: 'POST /api/sites/:siteId/sftp/enable',
                disable: 'POST /api/sites/:siteId/sftp/disable',
                adminListUsers: 'GET /api/admin/sftp/users',
            },
            databases: {
                adminList: 'GET /api/admin/databases',
                adminCreate: 'POST /api/admin/databases',
                adminLink: 'POST /api/admin/databases/link',
                adminGet: 'GET /api/admin/databases/:id',
                adminDelete: 'DELETE /api/admin/databases/:id',
                adminResetPassword: 'POST /api/admin/databases/:id/reset-password',
                adminTest: 'POST /api/admin/databases/:id/test',
                adminStats: 'GET /api/admin/databases/:id/stats',
                siteList: 'GET /api/sites/:siteId/databases',
                siteCreate: 'POST /api/sites/:siteId/databases',
                siteGet: 'GET /api/sites/:siteId/databases/:dbId',
                siteDelete: 'DELETE /api/sites/:siteId/databases/:dbId',
                siteResetPassword: 'POST /api/sites/:siteId/databases/:dbId/reset-password',
                siteTest: 'POST /api/sites/:siteId/databases/:dbId/test',
                myDatabases: 'GET /api/me/databases',
            },
            domains: {
                adminList: 'GET /api/admin/domains',
                adminCreate: 'POST /api/admin/domains',
                adminGet: 'GET /api/admin/domains/:domainId',
                adminDelete: 'DELETE /api/admin/domains/:domainId',
                adminAssign: 'POST /api/admin/domains/:domainId/assign',
                adminUnassign: 'POST /api/admin/domains/:domainId/unassign',
                adminRegenerateCert: 'POST /api/admin/domains/:domainId/regenerate-cert',
                adminReloadNginx: 'POST /api/admin/domains/reload-nginx',
                adminCleanup: 'POST /api/admin/domains/cleanup',
                adminPlatformGet: 'GET /api/admin/domains/platform',
                adminPlatformCreate: 'POST /api/admin/domains/platform',
                adminPlatformUpdate: 'PUT /api/admin/domains/platform',
                siteList: 'GET /api/sites/:siteId/domains',
                siteCreate: 'POST /api/sites/:siteId/domains',
                siteGet: 'GET /api/sites/:siteId/domains/:domainId',
                siteDelete: 'DELETE /api/sites/:siteId/domains/:domainId',
                siteUpdate: 'PATCH /api/sites/:siteId/domains/:domainId',
                siteDns: 'GET /api/sites/:siteId/domains/:domainId/dns',
                myDomains: 'GET /api/me/domains',
                validate: 'POST /api/domains/validate',
            },
        },
        documentation: 'https://github.com/Antoine601/Twoine',
    });
});

module.exports = router;
