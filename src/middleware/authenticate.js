/**
 * TWOINE - Authentication Middleware
 * Vérifie le token JWT et attache l'utilisateur à la requête
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'twoine-dev-secret-change-in-production';

/**
 * Middleware d'authentification principal
 * Vérifie le JWT et charge l'utilisateur complet depuis la base
 */
const authenticate = async (req, res, next) => {
    try {
        // Récupérer le token du header Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please provide a valid token.',
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer '

        // Vérifier le token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Vérifier que l'utilisateur a un ID valide
        const userId = decoded.userId || decoded._id || decoded.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token payload',
            });
        }

        // Charger l'utilisateur complet depuis la base de données
        const user = await User.findById(userId).populate('sites.site', 'name displayName status');

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
            });
        }

        // Vérifier si le compte est actif
        if (user.status === 'blocked') {
            return res.status(403).json({
                success: false,
                error: 'Account is blocked. Please contact administrator.',
                blockedReason: user.blockedReason,
            });
        }

        // Attacher l'utilisateur à la requête
        req.user = user;
        req.token = token;

        // Gérer l'impersonation
        if (decoded.impersonatedBy) {
            req.impersonatedBy = decoded.impersonatedBy;
            req.isImpersonating = true;
        } else {
            req.isImpersonating = false;
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired. Please login again.',
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid token',
            });
        }

        console.error('[AUTH] Authentication error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
        });
    }
};

/**
 * Middleware optionnel - ne bloque pas si non authentifié
 */
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    return authenticate(req, res, next);
};

/**
 * Middleware pour vérifier si l'utilisateur doit changer son mot de passe
 */
const checkMustChangePassword = (req, res, next) => {
    if (req.user && req.user.mustChangePassword) {
        // Autoriser uniquement l'endpoint de changement de mot de passe
        if (req.path !== '/auth/change-password' && req.method !== 'POST') {
            return res.status(403).json({
                success: false,
                error: 'Password change required',
                code: 'MUST_CHANGE_PASSWORD',
            });
        }
    }
    next();
};

module.exports = authenticate;
module.exports.optionalAuth = optionalAuth;
module.exports.checkMustChangePassword = checkMustChangePassword;
