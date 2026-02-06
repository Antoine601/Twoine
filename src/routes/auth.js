/**
 * TWOINE - Authentication Routes
 * Routes pour l'authentification et la gestion des sessions
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { AuthError } = require('../services/AuthService');
const authenticate = require('../middleware/authenticate');
const { checkMustChangePassword } = require('../middleware/authenticate');

/**
 * POST /auth/login
 * Connexion utilisateur
 */
router.post('/login', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const identifier = email || username;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email/username and password are required',
            });
        }

        // Récupérer l'IP du client
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        const result = await AuthService.login(identifier, password, ip);

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

        console.error('[AUTH] Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
        });
    }
});

/**
 * POST /auth/logout
 * Déconnexion - invalider la session courante
 */
router.post('/logout', authenticate, async (req, res) => {
    try {
        await AuthService.logout(req.user._id, req.token);

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('[AUTH] Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
        });
    }
});

/**
 * POST /auth/logout-all
 * Déconnexion de toutes les sessions
 */
router.post('/logout-all', authenticate, async (req, res) => {
    try {
        await AuthService.logoutAll(req.user._id);

        res.json({
            success: true,
            message: 'Logged out from all devices',
        });
    } catch (error) {
        console.error('[AUTH] Logout all error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
        });
    }
});

/**
 * POST /auth/refresh
 * Rafraîchir le token d'accès
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required',
            });
        }

        const result = await AuthService.refreshToken(refreshToken);

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

        console.error('[AUTH] Refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed',
        });
    }
});

/**
 * POST /auth/change-password
 * Changer son propre mot de passe
 */
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Current password and new password are required',
            });
        }

        // Valider la force du nouveau mot de passe
        const validation = AuthService.validatePassword(newPassword);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Password does not meet requirements',
                details: validation.errors,
            });
        }

        await AuthService.changePassword(req.user._id, currentPassword, newPassword);

        res.json({
            success: true,
            message: 'Password changed successfully. Please login again.',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[AUTH] Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Password change failed',
        });
    }
});

/**
 * POST /auth/forgot-password
 * Demander une réinitialisation de mot de passe
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required',
            });
        }

        const result = await AuthService.requestPasswordReset(email);

        res.json({
            success: true,
            message: result.message,
            // Token retourné uniquement en dev
            ...(result.resetToken && { resetToken: result.resetToken }),
        });
    } catch (error) {
        console.error('[AUTH] Forgot password error:', error);
        // Ne pas révéler si l'email existe
        res.json({
            success: true,
            message: 'If this email exists, a reset link will be sent.',
        });
    }
});

/**
 * POST /auth/reset-password
 * Réinitialiser le mot de passe avec un token
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Token and new password are required',
            });
        }

        // Valider la force du nouveau mot de passe
        const validation = AuthService.validatePassword(newPassword);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Password does not meet requirements',
                details: validation.errors,
            });
        }

        await AuthService.resetPassword(token, newPassword);

        res.json({
            success: true,
            message: 'Password reset successfully. Please login with your new password.',
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
            });
        }

        console.error('[AUTH] Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Password reset failed',
        });
    }
});

/**
 * GET /auth/me
 * Obtenir les informations de l'utilisateur connecté
 */
router.get('/me', authenticate, checkMustChangePassword, async (req, res) => {
    try {
        const user = req.user;

        res.json({
            success: true,
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profile: user.profile,
                notifications: user.notifications || [],
                status: user.status,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                isImpersonating: req.isImpersonating || false,
                impersonatedBy: req.impersonatedBy || null,
            },
        });
    } catch (error) {
        console.error('[AUTH] Get me error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user info',
        });
    }
});

/**
 * PUT /auth/me
 * Mettre à jour son profil
 */
router.put('/me', authenticate, checkMustChangePassword, async (req, res) => {
    try {
        const { firstName, lastName, avatar, phone, company, jobTitle, location, timezone, website, bio } = req.body;

        const updates = {};
        if (firstName !== undefined) updates['profile.firstName'] = firstName;
        if (lastName !== undefined) updates['profile.lastName'] = lastName;
        if (avatar !== undefined) updates['profile.avatar'] = avatar;
        if (phone !== undefined) updates['profile.phone'] = phone;
        if (company !== undefined) updates['profile.company'] = company;
        if (jobTitle !== undefined) updates['profile.jobTitle'] = jobTitle;
        if (location !== undefined) updates['profile.location'] = location;
        if (timezone !== undefined) updates['profile.timezone'] = timezone;
        if (website !== undefined) updates['profile.website'] = website;
        if (bio !== undefined) updates['profile.bio'] = bio;

        const user = await req.user.updateOne({ $set: updates });

        res.json({
            success: true,
            message: 'Profile updated successfully',
        });
    } catch (error) {
        console.error('[AUTH] Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile',
        });
    }
});

/**
 * GET /auth/sessions
 * Obtenir la liste des sessions actives
 */
router.get('/sessions', authenticate, async (req, res) => {
    try {
        const User = require('../models/User');
        const user = await User.findById(req.user._id).select('activeSessions');

        const sessions = user.activeSessions.map(session => ({
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            ip: session.ip,
            userAgent: session.userAgent,
            isCurrent: false, // TODO: Identifier la session courante
        }));

        res.json({
            success: true,
            data: sessions,
        });
    } catch (error) {
        console.error('[AUTH] Get sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sessions',
        });
    }
});

module.exports = router;
