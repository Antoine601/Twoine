/**
 * TWOINE - Admin Routes
 * Routes d'administration pour la gestion des utilisateurs
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Site = require('../models/Site');
const AuthService = require('../services/AuthService');
const { AuthError } = require('../services/AuthService');
const authenticate = require('../middleware/authenticate');
const { adminOnly, noImpersonation, ROLES } = require('../middleware/authorize');

// Tous les routes admin nécessitent authentification + rôle admin
router.use(authenticate);
router.use(adminOnly);

// ============================================
// GESTION DES UTILISATEURS
// ============================================

/**
 * GET /admin/users
 * Liste tous les utilisateurs
 */
router.get('/users', async (req, res) => {
    try {
        const { 
            role, 
            status, 
            search, 
            page = 1, 
            limit = 20,
            sort = '-createdAt'
        } = req.query;

        const query = {};

        // Filtres
        if (role && ['admin', 'user', 'readonly'].includes(role)) {
            query.role = role;
        }
        if (status && ['active', 'blocked', 'pending'].includes(status)) {
            query.status = status;
        }
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { 'profile.firstName': { $regex: search, $options: 'i' } },
                { 'profile.lastName': { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-passwordHistory -activeSessions')
                .populate('sites.site', 'name displayName status')
                .populate('createdBy', 'username')
                .populate('blockedBy', 'username')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        console.error('[ADMIN] List users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list users',
        });
    }
});

/**
 * GET /admin/users/:id
 * Obtenir un utilisateur par ID
 */
router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        const user = await User.findById(id)
            .select('-passwordHistory -activeSessions')
            .populate('sites.site', 'name displayName status domains')
            .populate('createdBy', 'username email')
            .populate('blockedBy', 'username email');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        res.json({
            success: true,
            data: user,
        });
    } catch (error) {
        console.error('[ADMIN] Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user',
        });
    }
});

/**
 * POST /admin/users
 * Créer un nouvel utilisateur
 */
router.post('/users', noImpersonation, async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            role = 'user',
            firstName,
            lastName,
            mustChangePassword = true,
            sites = [],
        } = req.body;

        // Validations
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username, email and password are required',
            });
        }

        // Valider le rôle
        if (!['admin', 'user', 'readonly'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Must be admin, user, or readonly',
            });
        }

        // Valider la force du mot de passe
        const validation = AuthService.validatePassword(password);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Password does not meet requirements',
                details: validation.errors,
            });
        }

        // Vérifier unicité
        const existing = await User.findOne({
            $or: [
                { username: username.toLowerCase() },
                { email: email.toLowerCase() },
            ],
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                error: existing.username === username.toLowerCase() 
                    ? 'Username already exists' 
                    : 'Email already exists',
            });
        }

        // Créer l'utilisateur
        const user = new User({
            username,
            email,
            password,
            role,
            profile: {
                firstName,
                lastName,
            },
            mustChangePassword,
            createdBy: req.user._id,
        });

        // Assigner des sites si fournis
        if (sites.length > 0) {
            for (const siteAssignment of sites) {
                const siteId = siteAssignment.site || siteAssignment;
                const accessLevel = siteAssignment.accessLevel || 'collaborator';

                // Vérifier que le site existe
                const siteExists = await Site.findById(siteId);
                if (siteExists) {
                    user.sites.push({
                        site: siteId,
                        accessLevel,
                        assignedBy: req.user._id,
                    });
                }
            }
        }

        await user.save();

        console.log(`[ADMIN] User ${user.username} created by ${req.user.username}`);

        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                mustChangePassword: user.mustChangePassword,
            },
            message: 'User created successfully',
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'Username or email already exists',
            });
        }

        console.error('[ADMIN] Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user',
        });
    }
});

/**
 * PUT /admin/users/:id
 * Mettre à jour un utilisateur
 */
router.put('/users/:id', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            email, 
            role, 
            firstName, 
            lastName,
            status,
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        // Ne pas permettre de modifier son propre rôle
        if (user._id.toString() === req.user._id.toString() && role && role !== user.role) {
            return res.status(403).json({
                success: false,
                error: 'Cannot change your own role',
            });
        }

        // Mettre à jour les champs
        if (email) user.email = email;
        if (role && ['admin', 'user', 'readonly'].includes(role)) user.role = role;
        if (firstName !== undefined) user.profile.firstName = firstName;
        if (lastName !== undefined) user.profile.lastName = lastName;
        if (status && ['active', 'blocked', 'pending'].includes(status)) {
            user.status = status;
            if (status === 'active') {
                user.blockedReason = undefined;
                user.blockedAt = undefined;
                user.blockedBy = undefined;
            }
        }

        await user.save();

        console.log(`[ADMIN] User ${user.username} updated by ${req.user.username}`);

        res.json({
            success: true,
            data: user,
            message: 'User updated successfully',
        });
    } catch (error) {
        console.error('[ADMIN] Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user',
        });
    }
});

/**
 * DELETE /admin/users/:id
 * Supprimer un utilisateur
 */
router.delete('/users/:id', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        // Ne pas permettre de se supprimer soi-même
        if (id === req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete your own account',
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        // Ne pas permettre de supprimer un autre admin
        if (user.role === 'admin' && user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete another admin',
            });
        }

        await User.findByIdAndDelete(id);

        console.log(`[ADMIN] User ${user.username} deleted by ${req.user.username}`);

        res.json({
            success: true,
            message: `User ${user.username} deleted successfully`,
        });
    } catch (error) {
        console.error('[ADMIN] Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user',
        });
    }
});

// ============================================
// BLOCAGE / DÉBLOCAGE
// ============================================

/**
 * POST /admin/users/:id/block
 * Bloquer un utilisateur
 */
router.post('/users/:id/block', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Reason is required',
            });
        }

        const result = await AuthService.blockUser(req.user, id, reason);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[ADMIN] Block user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to block user',
        });
    }
});

/**
 * POST /admin/users/:id/unblock
 * Débloquer un utilisateur
 */
router.post('/users/:id/unblock', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        const result = await AuthService.unblockUser(req.user, id);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[ADMIN] Unblock user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unblock user',
        });
    }
});

// ============================================
// RESET MOT DE PASSE
// ============================================

/**
 * POST /admin/users/:id/reset-password
 * Réinitialiser le mot de passe d'un utilisateur
 */
router.post('/users/:id/reset-password', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword, mustChangePassword = true } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        // Valider le nouveau mot de passe si fourni
        if (newPassword) {
            const validation = AuthService.validatePassword(newPassword);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Password does not meet requirements',
                    details: validation.errors,
                });
            }
        }

        const result = await AuthService.adminResetPassword(
            req.user,
            id,
            newPassword,
            mustChangePassword
        );

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[ADMIN] Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password',
        });
    }
});

// ============================================
// IMPERSONATION
// ============================================

/**
 * POST /admin/users/:id/impersonate
 * Se connecter en tant qu'un autre utilisateur
 */
router.post('/users/:id/impersonate', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        const result = await AuthService.impersonate(req.user, id);

        res.json({
            success: true,
            data: result,
            message: `Now impersonating user ${result.user.username}`,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[ADMIN] Impersonate error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to impersonate user',
        });
    }
});

/**
 * POST /admin/stop-impersonation
 * Arrêter l'impersonation et revenir au compte admin
 * Note: Cette route est accessible même pendant l'impersonation
 */
router.post('/stop-impersonation', async (req, res) => {
    try {
        if (!req.isImpersonating) {
            return res.status(400).json({
                success: false,
                error: 'Not currently impersonating',
            });
        }

        const result = await AuthService.stopImpersonation(req.impersonatedBy);

        res.json({
            success: true,
            data: result,
            message: 'Stopped impersonation, returned to admin account',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[ADMIN] Stop impersonation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop impersonation',
        });
    }
});

// ============================================
// ASSIGNATION DE SITES
// ============================================

/**
 * POST /admin/users/:id/sites
 * Assigner un site à un utilisateur
 */
router.post('/users/:id/sites', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;
        const { siteId, accessLevel = 'collaborator' } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(siteId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID or site ID',
            });
        }

        if (!['owner', 'collaborator', 'readonly'].includes(accessLevel)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid access level. Must be owner, collaborator, or readonly',
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        const site = await Site.findById(siteId);
        if (!site) {
            return res.status(404).json({
                success: false,
                error: 'Site not found',
            });
        }

        // Vérifier si le site est déjà assigné
        const existingIndex = user.sites.findIndex(
            s => s.site.toString() === siteId
        );

        if (existingIndex >= 0) {
            // Mettre à jour le niveau d'accès
            user.sites[existingIndex].accessLevel = accessLevel;
        } else {
            // Ajouter le site
            user.sites.push({
                site: siteId,
                accessLevel,
                assignedBy: req.user._id,
            });
        }

        await user.save();

        console.log(`[ADMIN] Site ${site.name} assigned to user ${user.username} by ${req.user.username}`);

        res.json({
            success: true,
            message: `Site ${site.name} assigned to user ${user.username}`,
            data: {
                site: siteId,
                accessLevel,
            },
        });
    } catch (error) {
        console.error('[ADMIN] Assign site error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assign site',
        });
    }
});

/**
 * DELETE /admin/users/:id/sites/:siteId
 * Retirer l'accès d'un utilisateur à un site
 */
router.delete('/users/:id/sites/:siteId', noImpersonation, async (req, res) => {
    try {
        const { id, siteId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(siteId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID or site ID',
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        const siteIndex = user.sites.findIndex(
            s => s.site.toString() === siteId
        );

        if (siteIndex < 0) {
            return res.status(404).json({
                success: false,
                error: 'Site not assigned to this user',
            });
        }

        user.sites.splice(siteIndex, 1);
        await user.save();

        console.log(`[ADMIN] Site ${siteId} removed from user ${user.username} by ${req.user.username}`);

        res.json({
            success: true,
            message: 'Site access removed',
        });
    } catch (error) {
        console.error('[ADMIN] Remove site error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove site access',
        });
    }
});


/**
 * POST /admin/users/:id/notifications
 * Envoyer une notification à un utilisateur
 */
router.post('/users/:id/notifications', noImpersonation, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, type = 'info', link } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID',
            });
        }

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                error: 'Title and message are required',
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        user.notifications.push({
            title,
            message,
            type,
            link,
            sentBy: req.user._id,
            sentAt: new Date(),
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Notification sent successfully',
            data: user.notifications[user.notifications.length - 1],
        });
    } catch (error) {
        console.error('[ADMIN] Send user notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification',
        });
    }
});

// ============================================
// STATISTIQUES
// ============================================

/**
 * GET /admin/stats
 * Statistiques globales pour l'admin
 */
router.get('/stats', async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            blockedUsers,
            adminCount,
            userCount,
            readonlyCount,
            totalSites,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ status: 'active' }),
            User.countDocuments({ status: 'blocked' }),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'readonly' }),
            Site.countDocuments(),
        ]);

        // Dernières connexions
        const recentLogins = await User.find({ lastLoginAt: { $exists: true } })
            .select('username lastLoginAt lastLoginIP')
            .sort({ lastLoginAt: -1 })
            .limit(10);

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    blocked: blockedUsers,
                    byRole: {
                        admin: adminCount,
                        user: userCount,
                        readonly: readonlyCount,
                    },
                },
                sites: {
                    total: totalSites,
                },
                recentLogins,
            },
        });
    } catch (error) {
        console.error('[ADMIN] Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats',
        });
    }
});

/**
 * GET /admin/roles
 * Liste des rôles disponibles
 */
router.get('/roles', (req, res) => {
    res.json({
        success: true,
        data: ROLES,
    });
});

module.exports = router;
