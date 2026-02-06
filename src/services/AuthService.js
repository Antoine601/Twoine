/**
 * TWOINE - Authentication Service
 * Gestion de l'authentification JWT et des sessions
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// Configuration JWT
const JWT_SECRET = process.env.JWT_SECRET || 'twoine-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Configuration sécurité
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

class AuthService {
    /**
     * Générer un token JWT
     * @param {User} user 
     * @param {object} options 
     * @returns {string}
     */
    static generateToken(user, options = {}) {
        const payload = {
            userId: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            // Pour l'impersonation
            impersonatedBy: options.impersonatedBy || null,
            // Type de token
            type: options.type || 'access',
        };

        const expiresIn = options.type === 'refresh' 
            ? JWT_REFRESH_EXPIRES_IN 
            : JWT_EXPIRES_IN;

        return jwt.sign(payload, JWT_SECRET, { expiresIn });
    }

    /**
     * Vérifier un token JWT
     * @param {string} token 
     * @returns {object} Payload décodé
     */
    static verifyToken(token) {
        return jwt.verify(token, JWT_SECRET);
    }

    /**
     * Login utilisateur
     * @param {string} identifier Email ou username
     * @param {string} password 
     * @param {string} ip IP de connexion
     * @returns {Promise<object>}
     */
    static async login(identifier, password, ip = null) {
        // Trouver l'utilisateur
        const user = await User.findByCredentials(identifier);

        if (!user) {
            throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
        }

        // Vérifier si le compte est bloqué par un admin
        if (user.status === 'blocked') {
            throw new AuthError(
                'Account is blocked. Please contact administrator.',
                'ACCOUNT_BLOCKED'
            );
        }

        // Vérifier si le compte est verrouillé temporairement
        if (user.isLocked) {
            const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
            throw new AuthError(
                `Account is temporarily locked. Try again in ${remainingTime} minutes.`,
                'ACCOUNT_LOCKED'
            );
        }

        // Vérifier le mot de passe
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            await user.incrementLoginAttempts();
            
            const attemptsLeft = MAX_LOGIN_ATTEMPTS - (user.failedLoginAttempts + 1);
            if (attemptsLeft > 0) {
                throw new AuthError(
                    `Invalid credentials. ${attemptsLeft} attempts remaining.`,
                    'INVALID_CREDENTIALS'
                );
            } else {
                throw new AuthError(
                    'Account locked due to too many failed attempts.',
                    'ACCOUNT_LOCKED'
                );
            }
        }

        // Connexion réussie - reset les tentatives
        await user.recordLogin(ip);

        // Générer les tokens
        const accessToken = this.generateToken(user);
        const refreshToken = this.generateToken(user, { type: 'refresh' });

        // Sauvegarder la session
        await this.saveSession(user, accessToken, ip);

        return {
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                profile: user.profile,
                mustChangePassword: user.mustChangePassword,
            },
            accessToken,
            refreshToken,
            expiresIn: JWT_EXPIRES_IN,
        };
    }

    /**
     * Logout - invalider la session
     * @param {string} userId 
     * @param {string} token 
     */
    static async logout(userId, token) {
        const tokenHash = this.hashToken(token);
        
        await User.findByIdAndUpdate(userId, {
            $pull: { activeSessions: { token: tokenHash } },
        });

        return { success: true, message: 'Logged out successfully' };
    }

    /**
     * Logout de toutes les sessions
     * @param {string} userId 
     */
    static async logoutAll(userId) {
        await User.findByIdAndUpdate(userId, {
            $set: { activeSessions: [] },
        });

        return { success: true, message: 'Logged out from all devices' };
    }

    /**
     * Rafraîchir le token d'accès
     * @param {string} refreshToken 
     * @returns {Promise<object>}
     */
    static async refreshToken(refreshToken) {
        try {
            const decoded = this.verifyToken(refreshToken);

            if (decoded.type !== 'refresh') {
                throw new AuthError('Invalid refresh token', 'INVALID_TOKEN');
            }

            const user = await User.findById(decoded.userId);

            if (!user || user.status !== 'active') {
                throw new AuthError('User not found or inactive', 'USER_INACTIVE');
            }

            // Générer un nouveau token d'accès
            const accessToken = this.generateToken(user);

            return {
                accessToken,
                expiresIn: JWT_EXPIRES_IN,
            };
        } catch (error) {
            if (error instanceof AuthError) throw error;
            throw new AuthError('Invalid or expired refresh token', 'INVALID_TOKEN');
        }
    }

    /**
     * Impersonation - Admin se connecte en tant qu'un autre utilisateur
     * @param {User} admin L'admin qui fait l'impersonation
     * @param {string} targetUserId L'utilisateur cible
     * @returns {Promise<object>}
     */
    static async impersonate(admin, targetUserId) {
        // Vérifier que c'est bien un admin
        if (admin.role !== 'admin') {
            throw new AuthError('Only admins can impersonate users', 'FORBIDDEN');
        }

        // Ne pas permettre d'impersoner un autre admin
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }

        if (targetUser.role === 'admin') {
            throw new AuthError('Cannot impersonate another admin', 'FORBIDDEN');
        }

        // Générer un token avec l'info d'impersonation
        const accessToken = this.generateToken(targetUser, {
            impersonatedBy: admin._id,
        });

        // Log l'action d'impersonation
        console.log(`[SECURITY] Admin ${admin.username} impersonated user ${targetUser.username}`);

        return {
            user: {
                _id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role,
                profile: targetUser.profile,
            },
            accessToken,
            impersonatedBy: {
                _id: admin._id,
                username: admin.username,
            },
            expiresIn: '1h', // Token d'impersonation plus court
        };
    }

    /**
     * Fin de l'impersonation - retour au compte admin
     * @param {string} adminId 
     * @returns {Promise<object>}
     */
    static async stopImpersonation(adminId) {
        const admin = await User.findById(adminId);

        if (!admin || admin.role !== 'admin') {
            throw new AuthError('Admin not found', 'NOT_FOUND');
        }

        const accessToken = this.generateToken(admin);

        return {
            user: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
            },
            accessToken,
            expiresIn: JWT_EXPIRES_IN,
        };
    }

    /**
     * Changer le mot de passe
     * @param {string} userId 
     * @param {string} currentPassword 
     * @param {string} newPassword 
     */
    static async changePassword(userId, currentPassword, newPassword) {
        const user = await User.findById(userId).select('+password');

        if (!user) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }

        // Vérifier le mot de passe actuel
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD');
        }

        // Vérifier que le nouveau mot de passe est différent
        if (currentPassword === newPassword) {
            throw new AuthError('New password must be different', 'SAME_PASSWORD');
        }

        // Vérifier que le mot de passe n'a pas été utilisé récemment
        const isReused = await user.isPasswordReused(newPassword);
        if (isReused) {
            throw new AuthError(
                'This password has been used recently. Please choose a different one.',
                'PASSWORD_REUSED'
            );
        }

        // Mettre à jour le mot de passe
        user.password = newPassword;
        user.mustChangePassword = false;
        await user.save();

        // Invalider toutes les sessions existantes
        await this.logoutAll(userId);

        return { success: true, message: 'Password changed successfully' };
    }

    /**
     * Demander une réinitialisation de mot de passe
     * @param {string} email 
     * @returns {Promise<string>} Reset token
     */
    static async requestPasswordReset(email) {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Ne pas révéler si l'email existe ou non
            return { success: true, message: 'If this email exists, a reset link will be sent.' };
        }

        // Générer le token de reset
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // Dans un vrai système, envoyer l'email ici
        // Pour l'instant, retourner le token (à utiliser uniquement en dev)
        console.log(`[PASSWORD_RESET] Token for ${email}: ${resetToken}`);

        return {
            success: true,
            message: 'If this email exists, a reset link will be sent.',
            // Ne retourner le token qu'en mode dev
            ...(process.env.NODE_ENV === 'development' && { resetToken }),
        };
    }

    /**
     * Réinitialiser le mot de passe avec un token
     * @param {string} token 
     * @param {string} newPassword 
     */
    static async resetPassword(token, newPassword) {
        const user = await User.findByResetToken(token);

        if (!user) {
            throw new AuthError('Invalid or expired reset token', 'INVALID_TOKEN');
        }

        // Mettre à jour le mot de passe
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.mustChangePassword = false;
        await user.save();

        // Invalider toutes les sessions
        await this.logoutAll(user._id);

        return { success: true, message: 'Password reset successfully' };
    }

    /**
     * Admin force la réinitialisation du mot de passe
     * @param {User} admin 
     * @param {string} targetUserId 
     * @param {string} newPassword Optionnel - si non fourni, génère un mot de passe temporaire
     * @param {boolean} mustChange Forcer le changement à la prochaine connexion
     */
    static async adminResetPassword(admin, targetUserId, newPassword = null, mustChange = true) {
        if (admin.role !== 'admin') {
            throw new AuthError('Only admins can reset passwords', 'FORBIDDEN');
        }

        const user = await User.findById(targetUserId);

        if (!user) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }

        // Générer un mot de passe temporaire si non fourni
        const tempPassword = newPassword || this.generateTempPassword();

        user.password = tempPassword;
        user.mustChangePassword = mustChange;
        await user.save();

        // Invalider toutes les sessions de l'utilisateur
        await this.logoutAll(targetUserId);

        console.log(`[SECURITY] Admin ${admin.username} reset password for user ${user.username}`);

        return {
            success: true,
            message: 'Password reset successfully',
            temporaryPassword: tempPassword,
            mustChangePassword: mustChange,
        };
    }

    /**
     * Bloquer un utilisateur
     * @param {User} admin 
     * @param {string} targetUserId 
     * @param {string} reason 
     */
    static async blockUser(admin, targetUserId, reason) {
        if (admin.role !== 'admin') {
            throw new AuthError('Only admins can block users', 'FORBIDDEN');
        }

        const user = await User.findById(targetUserId);

        if (!user) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }

        if (user.role === 'admin') {
            throw new AuthError('Cannot block another admin', 'FORBIDDEN');
        }

        await user.block(reason, admin._id);

        console.log(`[SECURITY] Admin ${admin.username} blocked user ${user.username}: ${reason}`);

        return {
            success: true,
            message: `User ${user.username} has been blocked`,
            blockedAt: user.blockedAt,
        };
    }

    /**
     * Débloquer un utilisateur
     * @param {User} admin 
     * @param {string} targetUserId 
     */
    static async unblockUser(admin, targetUserId) {
        if (admin.role !== 'admin') {
            throw new AuthError('Only admins can unblock users', 'FORBIDDEN');
        }

        const user = await User.findById(targetUserId);

        if (!user) {
            throw new AuthError('User not found', 'USER_NOT_FOUND');
        }

        await user.unblock();

        console.log(`[SECURITY] Admin ${admin.username} unblocked user ${user.username}`);

        return {
            success: true,
            message: `User ${user.username} has been unblocked`,
        };
    }

    /**
     * Sauvegarder une session active
     * @param {User} user 
     * @param {string} token 
     * @param {string} ip 
     * @param {string} userAgent 
     */
    static async saveSession(user, token, ip = null, userAgent = null) {
        const tokenHash = this.hashToken(token);
        const decoded = this.verifyToken(token);
        
        const session = {
            token: tokenHash,
            createdAt: new Date(),
            expiresAt: new Date(decoded.exp * 1000),
            ip,
            userAgent,
        };

        await User.findByIdAndUpdate(user._id, {
            $push: {
                activeSessions: {
                    $each: [session],
                    $slice: -10, // Garder max 10 sessions
                },
            },
        });
    }

    /**
     * Vérifier si une session est valide
     * @param {string} userId 
     * @param {string} token 
     * @returns {Promise<boolean>}
     */
    static async isSessionValid(userId, token) {
        const tokenHash = this.hashToken(token);
        
        const user = await User.findOne({
            _id: userId,
            'activeSessions.token': tokenHash,
            'activeSessions.expiresAt': { $gt: new Date() },
        });

        return !!user;
    }

    /**
     * Hash un token pour le stockage
     * @param {string} token 
     * @returns {string}
     */
    static hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Générer un mot de passe temporaire
     * @returns {string}
     */
    static generateTempPassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * Valider la force du mot de passe
     * @param {string} password 
     * @returns {object}
     */
    static validatePassword(password) {
        const errors = [];
        
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

/**
 * Classe d'erreur d'authentification
 */
class AuthError extends Error {
    constructor(message, code = 'AUTH_ERROR') {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.statusCode = this.getStatusCode(code);
    }

    getStatusCode(code) {
        const codes = {
            INVALID_CREDENTIALS: 401,
            ACCOUNT_BLOCKED: 403,
            ACCOUNT_LOCKED: 423,
            FORBIDDEN: 403,
            USER_NOT_FOUND: 404,
            INVALID_TOKEN: 401,
            USER_INACTIVE: 403,
            INVALID_PASSWORD: 400,
            SAME_PASSWORD: 400,
            PASSWORD_REUSED: 400,
        };
        return codes[code] || 500;
    }
}

module.exports = AuthService;
module.exports.AuthError = AuthError;
