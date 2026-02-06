/**
 * TWOINE - Admin Config Routes
 * Routes pour la gestion de la configuration système
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const authenticate = require('../middleware/authenticate');
const { adminOnly, noImpersonation } = require('../middleware/authorize');

const CONFIG_PATH = path.join(__dirname, '../../config/system.json');

// Default configuration
const defaultConfig = {
    server: {
        port: 3000,
        host: 'localhost',
        environment: 'production',
        logLevel: 'info',
    },
    sites: {
        rootDirectory: '/var/www',
        portRange: { min: 3001, max: 3999 },
        maxSitesPerUser: 10,
        defaultServerType: 'nodejs',
    },
    security: {
        jwtExpiration: '24h',
        refreshTokenExpiration: '7d',
        maxLoginAttempts: 5,
        lockoutDuration: 15,
        sessionTimeout: 60,
    },
    sftp: {
        port: 22,
        enabled: true,
        chrootDirectory: '/var/www',
    },
};

// Tous les routes nécessitent authentification admin
router.use(authenticate);
router.use(adminOnly);

/**
 * GET /admin/config
 * Récupérer la configuration système
 */
router.get('/', async (req, res) => {
    try {
        let config = { ...defaultConfig };
        
        try {
            const data = await fs.readFile(CONFIG_PATH, 'utf8');
            const savedConfig = JSON.parse(data);
            config = { ...defaultConfig, ...savedConfig };
        } catch (e) {
            // File doesn't exist, use defaults
        }

        res.json({
            success: true,
            data: config,
        });
    } catch (error) {
        console.error('[ADMIN] Get config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration',
        });
    }
});

/**
 * PUT /admin/config
 * Mettre à jour la configuration système
 */
router.put('/', noImpersonation, async (req, res) => {
    try {
        const newConfig = req.body;

        // Validate configuration
        if (!newConfig || typeof newConfig !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid configuration format',
            });
        }

        // Merge with default config to ensure all fields exist
        const config = {
            server: { ...defaultConfig.server, ...newConfig.server },
            sites: { ...defaultConfig.sites, ...newConfig.sites },
            security: { ...defaultConfig.security, ...newConfig.security },
            sftp: { ...defaultConfig.sftp, ...newConfig.sftp },
        };

        // Validate specific values
        if (config.server.port < 1 || config.server.port > 65535) {
            return res.status(400).json({
                success: false,
                error: 'Invalid server port',
            });
        }

        if (config.sites.portRange.min >= config.sites.portRange.max) {
            return res.status(400).json({
                success: false,
                error: 'Invalid port range',
            });
        }

        // Ensure config directory exists
        const configDir = path.dirname(CONFIG_PATH);
        await fs.mkdir(configDir, { recursive: true });

        // Save configuration
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

        console.log(`[ADMIN] Configuration updated by ${req.user.username}`);

        res.json({
            success: true,
            data: config,
            message: 'Configuration updated successfully',
        });
    } catch (error) {
        console.error('[ADMIN] Update config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration',
        });
    }
});

/**
 * POST /admin/config/reset
 * Réinitialiser la configuration par défaut
 */
router.post('/reset', noImpersonation, async (req, res) => {
    try {
        // Ensure config directory exists
        const configDir = path.dirname(CONFIG_PATH);
        await fs.mkdir(configDir, { recursive: true });

        // Save default configuration
        await fs.writeFile(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));

        console.log(`[ADMIN] Configuration reset to defaults by ${req.user.username}`);

        res.json({
            success: true,
            data: defaultConfig,
            message: 'Configuration reset to defaults',
        });
    } catch (error) {
        console.error('[ADMIN] Reset config error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset configuration',
        });
    }
});

module.exports = router;
