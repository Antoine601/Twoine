/**
 * TWOINE - User Model
 * Gestion des utilisateurs avec rôles et authentification
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

/**
 * Schéma utilisateur Twoine
 */
const UserSchema = new mongoose.Schema({
    // Identifiant unique (username)
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        match: [/^[a-z][a-z0-9_-]{2,29}$/, 'Username must start with a letter and contain only lowercase letters, numbers, hyphens, underscores'],
    },

    // Email
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    // Mot de passe hashé
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false, // Ne jamais retourner le mot de passe dans les requêtes
    },

    // Rôle de l'utilisateur
    role: {
        type: String,
        enum: {
            values: ['admin', 'user', 'readonly'],
            message: 'Role must be admin, user, or readonly',
        },
        default: 'user',
    },

    // Informations de profil
    profile: {
        firstName: {
            type: String,
            trim: true,
            maxlength: 50,
        },
        lastName: {
            type: String,
            trim: true,
            maxlength: 50,
        },
        avatar: {
            type: String,
        },
        phone: {
            type: String,
            trim: true,
            maxlength: 30,
        },
        company: {
            type: String,
            trim: true,
            maxlength: 120,
        },
        jobTitle: {
            type: String,
            trim: true,
            maxlength: 120,
        },
        location: {
            type: String,
            trim: true,
            maxlength: 120,
        },
        timezone: {
            type: String,
            trim: true,
            maxlength: 80,
        },
        website: {
            type: String,
            trim: true,
            maxlength: 200,
        },
        bio: {
            type: String,
            trim: true,
            maxlength: 800,
        },
    },

    notifications: [{
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 180,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        type: {
            type: String,
            enum: ['info', 'success', 'warning', 'danger'],
            default: 'info',
        },
        sentAt: {
            type: Date,
            default: Date.now,
        },
        readAt: {
            type: Date,
        },
        link: {
            type: String,
            trim: true,
            maxlength: 300,
        },
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    }],

    // Statut du compte
    status: {
        type: String,
        enum: ['active', 'blocked', 'pending'],
        default: 'active',
    },

    // Raison du blocage (si status = blocked)
    blockedReason: {
        type: String,
        maxlength: 500,
    },

    // Date de blocage
    blockedAt: {
        type: Date,
    },

    // Bloqué par (référence admin)
    blockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Doit changer le mot de passe à la prochaine connexion
    mustChangePassword: {
        type: Boolean,
        default: false,
    },

    // Token de réinitialisation de mot de passe
    passwordResetToken: {
        type: String,
        select: false,
    },

    // Expiration du token de réinitialisation
    passwordResetExpires: {
        type: Date,
        select: false,
    },

    // Dernière connexion
    lastLoginAt: {
        type: Date,
    },

    // IP de dernière connexion
    lastLoginIP: {
        type: String,
    },

    // Nombre de tentatives de connexion échouées
    failedLoginAttempts: {
        type: Number,
        default: 0,
    },

    // Verrouillage temporaire après trop de tentatives
    lockUntil: {
        type: Date,
    },

    // Historique des mots de passe (pour empêcher la réutilisation)
    passwordHistory: [{
        hash: String,
        changedAt: Date,
    }],

    // Date de dernier changement de mot de passe
    passwordChangedAt: {
        type: Date,
    },

    // Sessions actives (pour invalidation)
    activeSessions: [{
        token: {
            type: String,
            select: false,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: Date,
        userAgent: String,
        ip: String,
    }],

    // Impersonation: si ce token est utilisé par un admin
    impersonatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // Sites assignés (relation many-to-many)
    sites: [{
        site: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Site',
        },
        accessLevel: {
            type: String,
            enum: ['owner', 'collaborator', 'readonly'],
            default: 'collaborator',
        },
        assignedAt: {
            type: Date,
            default: Date.now,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    }],

    // Métadonnées
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map(),
    },

    // Créé par (admin qui a créé l'utilisateur)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function(doc, ret) {
            delete ret.password;
            delete ret.passwordResetToken;
            delete ret.passwordResetExpires;
            delete ret.passwordHistory;
            delete ret.activeSessions;
            return ret;
        },
    },
    toObject: { virtuals: true },
});

// ============================================
// INDEXES
// ============================================

UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ 'sites.site': 1 });

// ============================================
// VIRTUALS
// ============================================

// Nom complet
UserSchema.virtual('fullName').get(function() {
    if (this.profile?.firstName && this.profile?.lastName) {
        return `${this.profile.firstName} ${this.profile.lastName}`;
    }
    return this.profile?.firstName || this.profile?.lastName || this.username;
});

// Vérifie si le compte est verrouillé
UserSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Hash du mot de passe avant sauvegarde
UserSchema.pre('save', async function(next) {
    // Ne hasher que si le mot de passe a été modifié
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Générer le salt et hasher le mot de passe
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        this.password = await bcrypt.hash(this.password, salt);

        // Enregistrer dans l'historique des mots de passe
        if (!this.isNew) {
            this.passwordHistory = this.passwordHistory || [];
            this.passwordHistory.push({
                hash: this.password,
                changedAt: new Date(),
            });

            // Garder seulement les 5 derniers mots de passe
            if (this.passwordHistory.length > 5) {
                this.passwordHistory = this.passwordHistory.slice(-5);
            }
        }

        this.passwordChangedAt = new Date();
        next();
    } catch (error) {
        next(error);
    }
});

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Comparer le mot de passe fourni avec le hash
 * @param {string} candidatePassword 
 * @returns {Promise<boolean>}
 */
UserSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) {
        // Charger le mot de passe si non sélectionné
        const user = await mongoose.model('User').findById(this._id).select('+password');
        return bcrypt.compare(candidatePassword, user.password);
    }
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Vérifier si le mot de passe a été utilisé récemment
 * @param {string} password 
 * @returns {Promise<boolean>}
 */
UserSchema.methods.isPasswordReused = async function(password) {
    if (!this.passwordHistory || this.passwordHistory.length === 0) {
        return false;
    }

    for (const entry of this.passwordHistory) {
        const match = await bcrypt.compare(password, entry.hash);
        if (match) return true;
    }
    return false;
};

/**
 * Générer un token de réinitialisation de mot de passe
 * @returns {string} Token non hashé
 */
UserSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Stocker le hash du token
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Expiration dans 1 heure
    this.passwordResetExpires = Date.now() + 60 * 60 * 1000;

    return resetToken;
};

/**
 * Incrémenter les tentatives de connexion échouées
 */
UserSchema.methods.incrementLoginAttempts = async function() {
    // Si le verrouillage a expiré, reset le compteur
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $set: { failedLoginAttempts: 1 },
            $unset: { lockUntil: 1 },
        });
    }

    const updates = { $inc: { failedLoginAttempts: 1 } };

    // Verrouiller après 5 tentatives
    if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 }; // 30 minutes
    }

    return this.updateOne(updates);
};

/**
 * Reset les tentatives de connexion après succès
 */
UserSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $set: { failedLoginAttempts: 0 },
        $unset: { lockUntil: 1 },
    });
};

/**
 * Enregistrer une connexion réussie
 * @param {string} ip 
 */
UserSchema.methods.recordLogin = async function(ip) {
    this.lastLoginAt = new Date();
    this.lastLoginIP = ip;
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    await this.save();
};

/**
 * Vérifier si l'utilisateur a accès à un site
 * @param {string} siteId 
 * @returns {object|null} Niveau d'accès ou null
 */
UserSchema.methods.getSiteAccess = function(siteId) {
    if (this.role === 'admin') {
        return { accessLevel: 'owner', isAdmin: true };
    }

    const siteAccess = this.sites.find(
        s => s.site.toString() === siteId.toString()
    );

    return siteAccess || null;
};

/**
 * Vérifier si l'utilisateur peut modifier un site
 * @param {string} siteId 
 * @returns {boolean}
 */
UserSchema.methods.canEditSite = function(siteId) {
    if (this.role === 'admin') return true;
    if (this.role === 'readonly') return false;

    const access = this.getSiteAccess(siteId);
    return access && ['owner', 'collaborator'].includes(access.accessLevel);
};

/**
 * Bloquer l'utilisateur
 * @param {string} reason 
 * @param {ObjectId} blockedBy 
 */
UserSchema.methods.block = async function(reason, blockedBy) {
    this.status = 'blocked';
    this.blockedReason = reason;
    this.blockedAt = new Date();
    this.blockedBy = blockedBy;
    this.activeSessions = []; // Invalider toutes les sessions
    await this.save();
};

/**
 * Débloquer l'utilisateur
 */
UserSchema.methods.unblock = async function() {
    this.status = 'active';
    this.blockedReason = undefined;
    this.blockedAt = undefined;
    this.blockedBy = undefined;
    await this.save();
};

// ============================================
// STATIC METHODS
// ============================================

/**
 * Trouver par email ou username
 * @param {string} identifier 
 * @returns {Promise<User>}
 */
UserSchema.statics.findByCredentials = async function(identifier) {
    const query = identifier.includes('@')
        ? { email: identifier.toLowerCase() }
        : { username: identifier.toLowerCase() };

    return this.findOne(query).select('+password');
};

/**
 * Trouver par token de réinitialisation
 * @param {string} token Token non hashé
 * @returns {Promise<User>}
 */
UserSchema.statics.findByResetToken = async function(token) {
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    return this.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
    });
};

/**
 * Vérifier si un admin existe
 * @returns {Promise<boolean>}
 */
UserSchema.statics.adminExists = async function() {
    const count = await this.countDocuments({ role: 'admin' });
    return count > 0;
};

/**
 * Créer le premier admin
 * @param {object} data 
 * @returns {Promise<User>}
 */
UserSchema.statics.createInitialAdmin = async function(data) {
    const exists = await this.adminExists();
    if (exists) {
        throw new Error('An admin user already exists');
    }

    return this.create({
        ...data,
        role: 'admin',
        status: 'active',
        mustChangePassword: false,
    });
};

/**
 * Obtenir les utilisateurs d'un site
 * @param {string} siteId 
 * @returns {Promise<User[]>}
 */
UserSchema.statics.findBySite = function(siteId) {
    return this.find({ 'sites.site': siteId });
};

// ============================================
// ROLES ET PERMISSIONS
// ============================================

const ROLES = {
    admin: {
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full access to all sites, services, users and system',
        permissions: [
            'users:create',
            'users:read',
            'users:update',
            'users:delete',
            'users:block',
            'users:impersonate',
            'sites:create',
            'sites:read',
            'sites:update',
            'sites:delete',
            'sites:assign',
            'services:create',
            'services:read',
            'services:update',
            'services:delete',
            'services:start',
            'services:stop',
            'files:read',
            'files:write',
            'files:delete',
            'databases:read',
            'databases:write',
            'databases:delete',
            'stats:read_all',
            'system:manage',
        ],
    },
    user: {
        name: 'user',
        displayName: 'Developer',
        description: 'Can manage own sites and services',
        permissions: [
            'sites:read_own',
            'sites:update_own',
            'services:create_own',
            'services:read_own',
            'services:update_own',
            'services:delete_own',
            'services:start_own',
            'services:stop_own',
            'files:read_own',
            'files:write_own',
            'files:delete_own',
            'databases:read_own',
            'databases:write_own',
            'stats:read_own',
        ],
    },
    readonly: {
        name: 'readonly',
        displayName: 'Read Only',
        description: 'Can only view status of own sites',
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
 * Vérifier si un rôle a une permission
 * @param {string} role 
 * @param {string} permission 
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
    if (role === 'admin') return true;
    const roleConfig = ROLES[role];
    return roleConfig && roleConfig.permissions.includes(permission);
};

// Exporter le modèle et les utilitaires
const User = mongoose.model('User', UserSchema);

module.exports = User;
module.exports.ROLES = ROLES;
module.exports.hasPermission = hasPermission;
