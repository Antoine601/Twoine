/**
 * TWOINE - File Management Routes
 * API pour l'explorateur de fichiers web intégré
 * Gère: list, read, write, upload, download, delete, rename
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const authenticate = require('../middleware/authenticate');
const { 
    requireSiteAccess, 
    requireSiteWriteAccess,
    adminOnly,
} = require('../middleware/authorize');
const { fileManager } = require('../services/FileManager');
const { sftpManager } = require('../services/SftpManager');
const Site = require('../models/Site');

// Configuration multer pour l'upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10), // 50MB
        files: 10,
    },
});

// ============================================================================
// MIDDLEWARE: Charger le site et vérifier l'accès
// ============================================================================

const loadSite = async (req, res, next) => {
    try {
        const site = await Site.findById(req.params.siteId);
        if (!site) {
            return res.status(404).json({
                success: false,
                error: 'Site not found',
            });
        }
        req.site = site;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to load site',
        });
    }
};

// Middleware pour vérifier les permissions de lecture
const canReadFiles = (req, res, next) => {
    // Tous les utilisateurs authentifiés avec accès au site peuvent lire
    next();
};

// Middleware pour vérifier les permissions d'écriture
const canWriteFiles = (req, res, next) => {
    // Readonly ne peut pas écrire
    if (req.user.role === 'readonly') {
        return res.status(403).json({
            success: false,
            error: 'Write access denied. Readonly users cannot modify files.',
        });
    }
    
    // Vérifier l'accessLevel pour les non-admins
    if (req.user.role !== 'admin' && req.siteAccess) {
        if (req.siteAccess.accessLevel === 'readonly') {
            return res.status(403).json({
                success: false,
                error: 'Write access denied for this site.',
            });
        }
    }
    
    next();
};

// ============================================================================
// ROUTES: Explorateur de fichiers
// ============================================================================

/**
 * GET /api/sites/:siteId/files
 * Liste le contenu d'un répertoire
 * Query: path (optional, default: /)
 */
router.get(
    '/sites/:siteId/files',
    authenticate,
    requireSiteAccess('siteId'),
    loadSite,
    canReadFiles,
    async (req, res) => {
        try {
            const relativePath = req.query.path || '/';
            const result = await fileManager.listDirectory(req.site.name, relativePath);
            
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            const status = error.message.includes('not found') ? 404 :
                          error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * GET /api/sites/:siteId/files/read
 * Lit le contenu d'un fichier texte
 * Query: path (required)
 */
router.get(
    '/sites/:siteId/files/read',
    authenticate,
    requireSiteAccess('siteId'),
    loadSite,
    canReadFiles,
    async (req, res) => {
        try {
            const relativePath = req.query.path;
            if (!relativePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required',
                });
            }
            
            const result = await fileManager.readFile(req.site.name, relativePath);
            
            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            const status = error.message.includes('not found') ? 404 :
                          error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/files/write
 * Écrit du contenu dans un fichier
 * Body: { path, content }
 */
router.post(
    '/sites/:siteId/files/write',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const { path: relativePath, content } = req.body;
            
            if (!relativePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required',
                });
            }
            
            if (content === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Content is required',
                });
            }
            
            const result = await fileManager.writeFile(req.site.name, relativePath, content);
            
            res.json({
                success: true,
                data: result,
                message: result.isNewFile ? 'File created' : 'File updated',
            });
        } catch (error) {
            const status = error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/files/upload
 * Upload un ou plusieurs fichiers
 * Form data: files[], targetPath
 */
router.post(
    '/sites/:siteId/files/upload',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    upload.array('files', 10),
    async (req, res) => {
        try {
            const targetPath = req.body.targetPath || '/';
            const files = req.files;
            
            if (!files || files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No files provided',
                });
            }
            
            const results = [];
            const errors = [];
            
            for (const file of files) {
                try {
                    const result = await fileManager.uploadFile(req.site.name, targetPath, {
                        originalname: file.originalname,
                        buffer: file.buffer,
                        size: file.size,
                    });
                    results.push(result);
                } catch (error) {
                    errors.push({
                        file: file.originalname,
                        error: error.message,
                    });
                }
            }
            
            res.json({
                success: errors.length === 0,
                data: {
                    uploaded: results,
                    failed: errors,
                    total: files.length,
                    successCount: results.length,
                    errorCount: errors.length,
                },
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
 * GET /api/sites/:siteId/files/download
 * Télécharge un fichier
 * Query: path (required)
 */
router.get(
    '/sites/:siteId/files/download',
    authenticate,
    requireSiteAccess('siteId'),
    loadSite,
    canReadFiles,
    async (req, res) => {
        try {
            const relativePath = req.query.path;
            if (!relativePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required',
                });
            }
            
            const fileInfo = await fileManager.getFileForDownload(req.site.name, relativePath);
            
            res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
            res.setHeader('Content-Type', fileInfo.mimeType);
            res.setHeader('Content-Length', fileInfo.size);
            
            const fs = require('fs');
            const stream = fs.createReadStream(fileInfo.absolutePath);
            stream.pipe(res);
        } catch (error) {
            const status = error.message.includes('not found') ? 404 :
                          error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * DELETE /api/sites/:siteId/files
 * Supprime un fichier ou répertoire
 * Query: path (required), recursive (optional)
 */
router.delete(
    '/sites/:siteId/files',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const relativePath = req.query.path;
            const recursive = req.query.recursive === 'true';
            
            if (!relativePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required',
                });
            }
            
            const result = await fileManager.deleteItem(req.site.name, relativePath, recursive);
            
            res.json({
                success: true,
                data: result,
                message: `${result.type === 'directory' ? 'Directory' : 'File'} deleted`,
            });
        } catch (error) {
            const status = error.message.includes('not found') ? 404 :
                          error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/files/rename
 * Renomme un fichier ou répertoire
 * Body: { path, newName }
 */
router.post(
    '/sites/:siteId/files/rename',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const { path: relativePath, newName } = req.body;
            
            if (!relativePath || !newName) {
                return res.status(400).json({
                    success: false,
                    error: 'Path and newName are required',
                });
            }
            
            const result = await fileManager.renameItem(req.site.name, relativePath, newName);
            
            res.json({
                success: true,
                data: result,
                message: 'Item renamed',
            });
        } catch (error) {
            const status = error.message.includes('not found') ? 404 :
                          error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * POST /api/sites/:siteId/files/mkdir
 * Crée un nouveau répertoire
 * Body: { path }
 */
router.post(
    '/sites/:siteId/files/mkdir',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const { path: relativePath } = req.body;
            
            if (!relativePath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required',
                });
            }
            
            const result = await fileManager.createDirectory(req.site.name, relativePath);
            
            res.json({
                success: true,
                data: result,
                message: 'Directory created',
            });
        } catch (error) {
            const status = error.message.includes('denied') ? 403 : 400;
            res.status(status).json({
                success: false,
                error: error.message,
            });
        }
    }
);

/**
 * GET /api/sites/:siteId/files/stats
 * Obtient les statistiques d'utilisation disque
 */
router.get(
    '/sites/:siteId/files/stats',
    authenticate,
    requireSiteAccess('siteId'),
    loadSite,
    async (req, res) => {
        try {
            const stats = await fileManager.getDiskUsage(req.site.name);
            
            res.json({
                success: true,
                data: stats,
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
// ROUTES: Gestion SFTP
// ============================================================================

/**
 * GET /api/sites/:siteId/sftp
 * Obtient les informations SFTP du site
 */
router.get(
    '/sites/:siteId/sftp',
    authenticate,
    requireSiteAccess('siteId'),
    loadSite,
    async (req, res) => {
        try {
            const sftpInfo = await sftpManager.getSftpInfo(req.params.siteId);
            
            res.json({
                success: true,
                data: sftpInfo,
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
 * POST /api/sites/:siteId/sftp/reset-password
 * Réinitialise le mot de passe SFTP
 * Body: { password } (optional, generated if not provided)
 */
router.post(
    '/sites/:siteId/sftp/reset-password',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const newPassword = req.body.password || null;
            const result = await sftpManager.resetPassword(req.site.name, newPassword);
            
            res.json({
                success: true,
                data: {
                    username: result.username,
                    password: result.password,
                    message: 'SFTP password has been reset. Store it securely, it will not be shown again.',
                },
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
 * POST /api/sites/:siteId/sftp/enable
 * Active l'accès SFTP
 */
router.post(
    '/sites/:siteId/sftp/enable',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const result = await sftpManager.setAccessEnabled(req.site.name, true);
            
            res.json({
                success: true,
                data: result,
                message: 'SFTP access enabled',
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
 * POST /api/sites/:siteId/sftp/disable
 * Désactive l'accès SFTP
 */
router.post(
    '/sites/:siteId/sftp/disable',
    authenticate,
    requireSiteWriteAccess('siteId'),
    loadSite,
    canWriteFiles,
    async (req, res) => {
        try {
            const result = await sftpManager.setAccessEnabled(req.site.name, false);
            
            res.json({
                success: true,
                data: result,
                message: 'SFTP access disabled',
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
// ROUTES ADMIN: Gestion SFTP globale
// ============================================================================

/**
 * GET /api/admin/sftp/users
 * Liste tous les utilisateurs SFTP (admin seulement)
 */
router.get(
    '/admin/sftp/users',
    authenticate,
    adminOnly,
    async (req, res) => {
        try {
            const sites = await Site.find({ status: 'active' }).select('name displayName linuxUser');
            const users = [];
            
            for (const site of sites) {
                try {
                    const info = await sftpManager.getSftpInfo(site._id);
                    users.push({
                        siteId: site._id,
                        siteName: site.name,
                        siteDisplayName: site.displayName,
                        ...info,
                    });
                } catch {
                    users.push({
                        siteId: site._id,
                        siteName: site.name,
                        siteDisplayName: site.displayName,
                        username: site.linuxUser.username,
                        userExists: false,
                    });
                }
            }
            
            res.json({
                success: true,
                data: {
                    users,
                    total: users.length,
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
