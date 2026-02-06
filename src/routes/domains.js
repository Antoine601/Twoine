/**
 * TWOINE - Domain Routes
 * API REST pour la gestion des domaines et certificats SSL
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticate = require('../middleware/authenticate');
const { adminOnly, userOnly, anyAuthenticated, requireSiteAccess, requireSiteWriteAccess } = require('../middleware/authorize');
const domainManager = require('../services/DomainManager');
const Domain = require('../models/Domain');
const Site = require('../models/Site');

// ============================================
// ADMIN ROUTES - Gestion globale des domaines
// ============================================

/**
 * GET /api/admin/domains
 * Liste tous les domaines (admin seulement)
 */
router.get('/admin/domains', authenticate, adminOnly, async (req, res) => {
    try {
        const { type, status, siteId } = req.query;
        
        const filters = {};
        if (type) filters.type = type;
        if (status) filters.status = status;
        if (siteId) filters.siteId = siteId;

        const domains = await domainManager.listDomains(filters);

        res.json({
            success: true,
            count: domains.length,
            domains,
        });
    } catch (error) {
        console.error('[DOMAINS] Error listing domains:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains
 * Ajoute un nouveau domaine (admin seulement)
 */
router.post('/admin/domains', authenticate, adminOnly, async (req, res) => {
    try {
        const { domain, type, siteId, serviceId, targetPort, enableSsl } = req.body;

        if (!domain) {
            return res.status(400).json({
                success: false,
                error: 'Domain name is required',
            });
        }

        const newDomain = await domainManager.addDomain({
            domain,
            type: type || 'site',
            siteId,
            serviceId,
            targetPort,
            enableSsl: enableSsl !== false,
            userId: req.user._id,
        });

        // Retourner les infos DNS
        const dnsInfo = await domainManager.getDnsInfo(newDomain._id);

        res.status(201).json({
            success: true,
            message: 'Domain added successfully',
            domain: newDomain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error adding domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/admin/domains/:domainId
 * Détails d'un domaine (admin seulement)
 */
router.get('/admin/domains/:domainId', authenticate, adminOnly, async (req, res) => {
    try {
        const { domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await Domain.findById(domainId)
            .populate('site', 'name displayName status')
            .populate('service', 'name displayName port')
            .populate('createdBy', 'username displayName');

        if (!domain || domain.status === 'deleted') {
            return res.status(404).json({
                success: false,
                error: 'Domain not found',
            });
        }

        // Ajouter les infos DNS
        const dnsInfo = await domainManager.getDnsInfo(domainId);

        res.json({
            success: true,
            domain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error getting domain:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * DELETE /api/admin/domains/:domainId
 * Supprime un domaine (admin seulement)
 */
router.delete('/admin/domains/:domainId', authenticate, adminOnly, async (req, res) => {
    try {
        const { domainId } = req.params;
        const { force } = req.query;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        await domainManager.removeDomain(domainId, force === 'true');

        res.json({
            success: true,
            message: 'Domain removed successfully',
        });
    } catch (error) {
        console.error('[DOMAINS] Error removing domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/:domainId/assign
 * Assigne un domaine à un site/service (admin seulement)
 */
router.post('/admin/domains/:domainId/assign', authenticate, adminOnly, async (req, res) => {
    try {
        const { domainId } = req.params;
        const { siteId, serviceId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        if (!siteId) {
            return res.status(400).json({
                success: false,
                error: 'Site ID is required',
            });
        }

        const domain = await domainManager.assignDomain(domainId, siteId, serviceId);

        res.json({
            success: true,
            message: 'Domain assigned successfully',
            domain,
        });
    } catch (error) {
        console.error('[DOMAINS] Error assigning domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/:domainId/unassign
 * Désassigne un domaine (admin seulement)
 */
router.post('/admin/domains/:domainId/unassign', authenticate, adminOnly, async (req, res) => {
    try {
        const { domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await domainManager.unassignDomain(domainId);

        res.json({
            success: true,
            message: 'Domain unassigned successfully',
            domain,
        });
    } catch (error) {
        console.error('[DOMAINS] Error unassigning domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/:domainId/regenerate-cert
 * Régénère le certificat SSL (admin seulement)
 */
router.post('/admin/domains/:domainId/regenerate-cert', authenticate, adminOnly, async (req, res) => {
    try {
        const { domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await domainManager.regenerateCertificate(domainId);

        res.json({
            success: true,
            message: 'Certificate regenerated successfully',
            domain,
            ssl: {
                generatedAt: domain.ssl.generatedAt,
                expiresAt: domain.ssl.expiresAt,
            },
        });
    } catch (error) {
        console.error('[DOMAINS] Error regenerating certificate:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/reload-nginx
 * Force le rechargement de Nginx (admin seulement)
 */
router.post('/admin/domains/reload-nginx', authenticate, adminOnly, async (req, res) => {
    try {
        await domainManager.reloadNginx();

        res.json({
            success: true,
            message: 'Nginx reloaded successfully',
        });
    } catch (error) {
        console.error('[DOMAINS] Error reloading Nginx:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/cleanup
 * Nettoie les domaines orphelins (admin seulement)
 */
router.post('/admin/domains/cleanup', authenticate, adminOnly, async (req, res) => {
    try {
        const orphansCleaned = await domainManager.cleanupOrphanDomains();
        const invalidServicesCleaned = await domainManager.cleanupInvalidServiceDomains();

        res.json({
            success: true,
            message: 'Cleanup completed',
            orphansCleaned,
            invalidServicesCleaned,
        });
    } catch (error) {
        console.error('[DOMAINS] Error during cleanup:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/admin/domains/platform
 * Obtient le domaine de la plateforme (admin seulement)
 */
router.get('/admin/domains/platform', authenticate, adminOnly, async (req, res) => {
    try {
        const platform = await Domain.getPlatformDomain();

        if (!platform) {
            return res.status(404).json({
                success: false,
                error: 'Platform domain not configured',
            });
        }

        const dnsInfo = await domainManager.getDnsInfo(platform._id);

        res.json({
            success: true,
            domain: platform,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error getting platform domain:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/admin/domains/platform
 * Configure le domaine de la plateforme (admin seulement)
 */
router.post('/admin/domains/platform', authenticate, adminOnly, async (req, res) => {
    try {
        const { domain, port, enableSsl } = req.body;

        if (!domain) {
            return res.status(400).json({
                success: false,
                error: 'Domain name is required',
            });
        }

        if (!port) {
            return res.status(400).json({
                success: false,
                error: 'Port is required',
            });
        }

        const platformDomain = await domainManager.setupPlatformDomain({
            domain,
            port,
            enableSsl: enableSsl !== false,
            userId: req.user._id,
        });

        const dnsInfo = await domainManager.getDnsInfo(platformDomain._id);

        res.status(201).json({
            success: true,
            message: 'Platform domain configured successfully',
            domain: platformDomain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error configuring platform domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * PUT /api/admin/domains/platform
 * Met à jour le domaine de la plateforme (admin seulement)
 */
router.put('/admin/domains/platform', authenticate, adminOnly, async (req, res) => {
    try {
        const { domain, port } = req.body;

        const platformDomain = await domainManager.updatePlatformDomain({
            domain,
            port,
        });

        const dnsInfo = await domainManager.getDnsInfo(platformDomain._id);

        res.json({
            success: true,
            message: 'Platform domain updated successfully',
            domain: platformDomain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error updating platform domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// SITE ROUTES - Domaines par site
// ============================================

/**
 * GET /api/sites/:siteId/domains
 * Liste les domaines d'un site
 */
router.get('/sites/:siteId/domains', authenticate, requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;

        const domains = await domainManager.listDomainsBySite(siteId);

        res.json({
            success: true,
            count: domains.length,
            domains,
        });
    } catch (error) {
        console.error('[DOMAINS] Error listing site domains:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/sites/:siteId/domains
 * Ajoute un domaine à un site (user ou admin)
 */
router.post('/sites/:siteId/domains', authenticate, requireSiteWriteAccess('siteId'), async (req, res) => {
    try {
        const { siteId } = req.params;
        const { domain, serviceId, targetPort, enableSsl } = req.body;

        if (!domain) {
            return res.status(400).json({
                success: false,
                error: 'Domain name is required',
            });
        }

        const newDomain = await domainManager.addDomain({
            domain,
            type: 'site',
            siteId,
            serviceId,
            targetPort,
            enableSsl: enableSsl !== false,
            userId: req.user._id,
        });

        const dnsInfo = await domainManager.getDnsInfo(newDomain._id);

        res.status(201).json({
            success: true,
            message: 'Domain added to site successfully',
            domain: newDomain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error adding domain to site:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/sites/:siteId/domains/:domainId
 * Détails d'un domaine de site
 */
router.get('/sites/:siteId/domains/:domainId', authenticate, requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId, domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await Domain.findById(domainId)
            .populate('service', 'name displayName port');

        if (!domain || domain.status === 'deleted') {
            return res.status(404).json({
                success: false,
                error: 'Domain not found',
            });
        }

        // Vérifier que le domaine appartient bien au site
        if (!domain.site || domain.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Domain not found in this site',
            });
        }

        const dnsInfo = await domainManager.getDnsInfo(domainId);

        res.json({
            success: true,
            domain,
            dns: dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error getting site domain:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * DELETE /api/sites/:siteId/domains/:domainId
 * Supprime un domaine d'un site (user ou admin)
 */
router.delete('/sites/:siteId/domains/:domainId', authenticate, requireSiteWriteAccess('siteId'), async (req, res) => {
    try {
        const { siteId, domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await Domain.findById(domainId);

        if (!domain || domain.status === 'deleted') {
            return res.status(404).json({
                success: false,
                error: 'Domain not found',
            });
        }

        // Vérifier que le domaine appartient bien au site
        if (!domain.site || domain.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Domain not found in this site',
            });
        }

        await domainManager.removeDomain(domainId);

        res.json({
            success: true,
            message: 'Domain removed successfully',
        });
    } catch (error) {
        console.error('[DOMAINS] Error removing site domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * PATCH /api/sites/:siteId/domains/:domainId
 * Met à jour l'assignation d'un domaine (user ou admin)
 */
router.patch('/sites/:siteId/domains/:domainId', authenticate, requireSiteWriteAccess('siteId'), async (req, res) => {
    try {
        const { siteId, domainId } = req.params;
        const { serviceId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await Domain.findById(domainId);

        if (!domain || domain.status === 'deleted') {
            return res.status(404).json({
                success: false,
                error: 'Domain not found',
            });
        }

        // Vérifier que le domaine appartient bien au site
        if (!domain.site || domain.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Domain not found in this site',
            });
        }

        // Mettre à jour l'assignation au service
        const updatedDomain = await domainManager.assignDomain(domainId, siteId, serviceId);

        res.json({
            success: true,
            message: 'Domain updated successfully',
            domain: updatedDomain,
        });
    } catch (error) {
        console.error('[DOMAINS] Error updating site domain:', error.message);
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/sites/:siteId/domains/:domainId/dns
 * Obtient les instructions DNS pour un domaine
 */
router.get('/sites/:siteId/domains/:domainId/dns', authenticate, requireSiteAccess('siteId'), async (req, res) => {
    try {
        const { siteId, domainId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(domainId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid domain ID',
            });
        }

        const domain = await Domain.findById(domainId);

        if (!domain || domain.status === 'deleted') {
            return res.status(404).json({
                success: false,
                error: 'Domain not found',
            });
        }

        // Vérifier que le domaine appartient bien au site
        if (!domain.site || domain.site.toString() !== siteId) {
            return res.status(404).json({
                success: false,
                error: 'Domain not found in this site',
            });
        }

        const dnsInfo = await domainManager.getDnsInfo(domainId);

        res.json({
            success: true,
            ...dnsInfo,
        });
    } catch (error) {
        console.error('[DOMAINS] Error getting DNS info:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// USER ROUTES - Mes domaines
// ============================================

/**
 * GET /api/me/domains
 * Liste tous les domaines accessibles par l'utilisateur
 */
router.get('/me/domains', authenticate, anyAuthenticated, async (req, res) => {
    try {
        const domains = await Domain.findByUser(req.user);

        res.json({
            success: true,
            count: domains.length,
            domains,
        });
    } catch (error) {
        console.error('[DOMAINS] Error listing user domains:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// ============================================
// VALIDATION HELPER
// ============================================

/**
 * POST /api/domains/validate
 * Valide un nom de domaine (publique - sans auth)
 */
router.post('/domains/validate', async (req, res) => {
    try {
        const { domain } = req.body;

        if (!domain) {
            return res.status(400).json({
                success: false,
                error: 'Domain name is required',
            });
        }

        const validation = Domain.validateDomain(domain);

        if (!validation.valid) {
            return res.json({
                success: true,
                valid: false,
                error: validation.error,
            });
        }

        // Vérifier disponibilité
        const isAvailable = await Domain.isAvailable(domain);

        res.json({
            success: true,
            valid: true,
            available: isAvailable,
            normalized: domain.trim().toLowerCase(),
        });
    } catch (error) {
        console.error('[DOMAINS] Error validating domain:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

module.exports = router;
