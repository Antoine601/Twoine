/**
 * TWOINE - Authorization Middleware
 * Vérifie les rôles et permissions des utilisateurs
 */

const mongoose = require('mongoose');

/**
 * Rôles disponibles et leurs permissions
 */
const ROLES = {
    admin: {
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full access to all sites, services, users and system',
        level: 100,
        permissions: [
            'users:create', 'users:read', 'users:update', 'users:delete', 'users:block', 'users:impersonate',
            'sites:create', 'sites:read', 'sites:update', 'sites:delete', 'sites:assign',
            'services:create', 'services:read', 'services:update', 'services:delete', 'services:start', 'services:stop',
            'files:read', 'files:write', 'files:delete',
            'databases:read', 'databases:write', 'databases:delete',
            'stats:read_all', 'system:manage',
        ],
    },
    user: {
        name: 'user',
        displayName: 'Developer',
        description: 'Can manage own sites and services',
        level: 50,
        permissions: [
            'sites:read_own', 'sites:update_own',
            'services:create_own', 'services:read_own', 'services:update_own', 'services:delete_own',
            'services:start_own', 'services:stop_own',
            'files:read_own', 'files:write_own', 'files:delete_own',
            'databases:read_own', 'databases:write_own',
            'stats:read_own',
        ],
    },
    readonly: {
        name: 'readonly',
        displayName: 'Read Only',
        description: 'Can only view status of own sites',
        level: 10,
        permissions: [
            'sites:read_own',
            'services:read_own',
            'files:read_own',
            'databases:read_own',
            'stats:read_own',
        ],
    },
};

/**
 * Middleware d'autorisation par rôle
 * @param  {...string} allowedRoles - Rôles autorisés ('admin', 'user', 'readonly')
 * @returns {Function} Express middleware
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        // Vérifier que l'utilisateur est authentifié
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userRole = req.user.role || 'readonly';

        // Admin a toujours accès
        if (userRole === 'admin') {
            return next();
        }

        // Vérifier si le rôle de l'utilisateur est dans la liste autorisée
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: userRole,
            });
        }

        next();
    };
};

/**
 * Middleware: Admin seulement
 */
const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required',
        });
    }

    next();
};

/**
 * Middleware: User ou Admin (pas readonly)
 */
const userOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }

    if (req.user.role === 'readonly') {
        return res.status(403).json({
            success: false,
            error: 'Write access required. Readonly users cannot perform this action.',
        });
    }

    next();
};

/**
 * Middleware: Tout utilisateur authentifié (y compris readonly)
 */
const anyAuthenticated = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }
    next();
};

/**
 * Vérifie si un utilisateur a une permission spécifique
 * @param {string} role 
 * @param {string} permission 
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
    if (role === 'admin') return true;
    const roleConfig = ROLES[role];
    return roleConfig && roleConfig.permissions.includes(permission);
};

/**
 * Middleware pour vérifier une permission spécifique
 * @param {string} permission 
 * @returns {Function}
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        if (!hasPermission(req.user.role, permission)) {
            return res.status(403).json({
                success: false,
                error: `Permission '${permission}' required`,
            });
        }

        next();
    };
};

/**
 * Middleware: Vérifier l'accès à un site spécifique
 * Charge le site et vérifie si l'utilisateur y a accès
 * @param {string} paramName - Nom du paramètre contenant l'ID du site (default: 'siteId')
 * @returns {Function}
 */
const requireSiteAccess = (paramName = 'siteId') => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const siteId = req.params[paramName] || req.body[paramName];

        if (!siteId) {
            return res.status(400).json({
                success: false,
                error: 'Site ID is required',
            });
        }

        // Valider le format de l'ID
        if (!mongoose.Types.ObjectId.isValid(siteId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid site ID format',
            });
        }

        // Admin a accès à tous les sites
        if (req.user.role === 'admin') {
            req.siteAccess = { accessLevel: 'owner', isAdmin: true };
            return next();
        }

        // Vérifier l'accès de l'utilisateur au site
        const siteAccess = req.user.getSiteAccess(siteId);

        if (!siteAccess) {
            return res.status(403).json({
                success: false,
                error: 'You do not have access to this site',
            });
        }

        req.siteAccess = siteAccess;
        next();
    };
};

/**
 * Middleware: Vérifier l'accès en écriture à un site
 * @param {string} paramName 
 * @returns {Function}
 */
const requireSiteWriteAccess = (paramName = 'siteId') => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        // Readonly ne peut jamais écrire
        if (req.user.role === 'readonly') {
            return res.status(403).json({
                success: false,
                error: 'Write access required. Readonly users cannot modify sites.',
            });
        }

        const siteId = req.params[paramName] || req.body[paramName];

        if (!siteId) {
            return res.status(400).json({
                success: false,
                error: 'Site ID is required',
            });
        }

        // Valider le format de l'ID
        if (!mongoose.Types.ObjectId.isValid(siteId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid site ID format',
            });
        }

        // Admin a accès complet
        if (req.user.role === 'admin') {
            req.siteAccess = { accessLevel: 'owner', isAdmin: true };
            return next();
        }

        // Vérifier que l'utilisateur peut modifier le site
        if (!req.user.canEditSite(siteId)) {
            return res.status(403).json({
                success: false,
                error: 'You do not have write access to this site',
            });
        }

        req.siteAccess = req.user.getSiteAccess(siteId);
        next();
    };
};

/**
 * Middleware: Interdire l'impersonation pour certaines actions sensibles
 */
const noImpersonation = (req, res, next) => {
    if (req.isImpersonating) {
        return res.status(403).json({
            success: false,
            error: 'This action cannot be performed while impersonating a user',
        });
    }
    next();
};

module.exports = authorize;
module.exports.ROLES = ROLES;
module.exports.adminOnly = adminOnly;
module.exports.userOnly = userOnly;
module.exports.anyAuthenticated = anyAuthenticated;
module.exports.hasPermission = hasPermission;
module.exports.requirePermission = requirePermission;
module.exports.requireSiteAccess = requireSiteAccess;
module.exports.requireSiteWriteAccess = requireSiteWriteAccess;
module.exports.noImpersonation = noImpersonation;
