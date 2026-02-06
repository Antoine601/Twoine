/**
 * TWOINE - Database Model
 * Gestion des bases de données liées aux sites
 * Supporte MongoDB, MySQL/MariaDB, PostgreSQL
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Algorithme de chiffrement pour les mots de passe DB
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

/**
 * Chiffre un mot de passe
 * @param {string} password 
 * @returns {object} { encrypted, iv, authTag }
 */
function encryptPassword(password) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };
}

/**
 * Déchiffre un mot de passe
 * @param {object} encryptedData 
 * @returns {string}
 */
function decryptPassword(encryptedData) {
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Schéma Database Twoine
 */
const DatabaseSchema = new mongoose.Schema({
    // Nom unique de la base de données
    name: {
        type: String,
        required: [true, 'Database name is required'],
        trim: true,
        lowercase: true,
        match: [/^[a-z][a-z0-9_]{2,63}$/, 'Database name must start with a letter, contain only lowercase letters, numbers, underscores, and be 3-64 characters'],
    },

    // Nom d'affichage
    displayName: {
        type: String,
        trim: true,
        maxlength: 100,
    },

    // Type de base de données
    type: {
        type: String,
        required: [true, 'Database type is required'],
        enum: {
            values: ['mongodb', 'mysql', 'mariadb', 'postgresql'],
            message: 'Database type must be mongodb, mysql, mariadb, or postgresql',
        },
    },

    // Site associé
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
        required: [true, 'Site reference is required'],
    },

    // Créé par (utilisateur Twoine)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // La base existait-elle avant (liée manuellement)
    isExternal: {
        type: Boolean,
        default: false,
    },

    // Informations de connexion
    connection: {
        host: {
            type: String,
            default: 'localhost',
        },
        port: {
            type: Number,
        },
        // Nom de la base sur le serveur (peut différer du name)
        databaseName: {
            type: String,
            required: true,
        },
    },

    // Utilisateur DB dédié
    dbUser: {
        username: {
            type: String,
            required: true,
        },
        // Mot de passe chiffré (jamais en clair)
        passwordEncrypted: {
            encrypted: String,
            iv: String,
            authTag: String,
        },
        // Droits accordés
        privileges: [{
            type: String,
            enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'INDEX', 'ALTER', 'REFERENCES', 'ALL'],
        }],
        created: {
            type: Boolean,
            default: false,
        },
    },

    // Statut
    status: {
        type: String,
        enum: ['pending', 'creating', 'active', 'error', 'deleting', 'deleted', 'external'],
        default: 'pending',
    },

    // Message d'erreur si status = error
    errorMessage: String,

    // Statistiques
    stats: {
        sizeBytes: {
            type: Number,
            default: 0,
        },
        tablesCount: {
            type: Number,
            default: 0,
        },
        lastUpdated: Date,
    },

    // Métadonnées
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map(),
    },

}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function(doc, ret) {
            // Ne jamais exposer le mot de passe chiffré
            delete ret.dbUser?.passwordEncrypted;
            return ret;
        },
    },
    toObject: { virtuals: true },
});

// ============================================
// INDEXES
// ============================================

// Unicité par type + nom (une seule base "mydb" par type)
DatabaseSchema.index({ type: 1, name: 1 }, { unique: true });
DatabaseSchema.index({ site: 1 });
DatabaseSchema.index({ status: 1 });
DatabaseSchema.index({ createdBy: 1 });
DatabaseSchema.index({ 'dbUser.username': 1 });

// ============================================
// PRE-SAVE HOOKS
// ============================================

DatabaseSchema.pre('save', function(next) {
    // Définir le port par défaut selon le type
    if (this.isNew && !this.connection.port) {
        switch (this.type) {
            case 'mongodb':
                this.connection.port = 27017;
                break;
            case 'mysql':
            case 'mariadb':
                this.connection.port = 3306;
                break;
            case 'postgresql':
                this.connection.port = 5432;
                break;
        }
    }

    // Générer le nom de base si non défini
    if (!this.connection.databaseName) {
        this.connection.databaseName = this.name;
    }

    // Générer le displayName si non défini
    if (!this.displayName) {
        this.displayName = this.name;
    }

    next();
});

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Définit le mot de passe DB (chiffré)
 * @param {string} password 
 */
DatabaseSchema.methods.setPassword = function(password) {
    this.dbUser.passwordEncrypted = encryptPassword(password);
};

/**
 * Récupère le mot de passe DB (déchiffré)
 * @returns {string}
 */
DatabaseSchema.methods.getPassword = function() {
    if (!this.dbUser.passwordEncrypted?.encrypted) {
        return null;
    }
    return decryptPassword(this.dbUser.passwordEncrypted);
};

/**
 * Génère une chaîne de connexion
 * @param {boolean} includePassword - Inclure le mot de passe
 * @returns {string}
 */
DatabaseSchema.methods.getConnectionString = function(includePassword = false) {
    const { host, port, databaseName } = this.connection;
    const { username } = this.dbUser;
    const password = includePassword ? this.getPassword() : '******';

    switch (this.type) {
        case 'mongodb':
            return `mongodb://${username}:${password}@${host}:${port}/${databaseName}?authSource=${databaseName}`;
        case 'mysql':
        case 'mariadb':
            return `mysql://${username}:${password}@${host}:${port}/${databaseName}`;
        case 'postgresql':
            return `postgresql://${username}:${password}@${host}:${port}/${databaseName}`;
        default:
            return null;
    }
};

/**
 * Génère les variables d'environnement pour le site
 * @returns {object}
 */
DatabaseSchema.methods.getEnvVariables = function() {
    const prefix = `DB_${this.name.toUpperCase()}`;
    const password = this.getPassword();
    
    const vars = {
        [`${prefix}_TYPE`]: this.type,
        [`${prefix}_HOST`]: this.connection.host,
        [`${prefix}_PORT`]: String(this.connection.port),
        [`${prefix}_NAME`]: this.connection.databaseName,
        [`${prefix}_USER`]: this.dbUser.username,
        [`${prefix}_PASSWORD`]: password,
        [`${prefix}_URL`]: this.getConnectionString(true),
    };

    // Variables spécifiques par type
    switch (this.type) {
        case 'mongodb':
            vars['MONGODB_URI'] = this.getConnectionString(true);
            vars['MONGO_URL'] = this.getConnectionString(true);
            break;
        case 'mysql':
        case 'mariadb':
            vars['MYSQL_HOST'] = this.connection.host;
            vars['MYSQL_PORT'] = String(this.connection.port);
            vars['MYSQL_DATABASE'] = this.connection.databaseName;
            vars['MYSQL_USER'] = this.dbUser.username;
            vars['MYSQL_PASSWORD'] = password;
            break;
        case 'postgresql':
            vars['PGHOST'] = this.connection.host;
            vars['PGPORT'] = String(this.connection.port);
            vars['PGDATABASE'] = this.connection.databaseName;
            vars['PGUSER'] = this.dbUser.username;
            vars['PGPASSWORD'] = password;
            vars['DATABASE_URL'] = this.getConnectionString(true);
            break;
    }

    return vars;
};

/**
 * Vérifie si un utilisateur a accès à cette base
 * @param {User} user 
 * @param {string} accessType - 'read', 'write', 'admin'
 * @returns {boolean}
 */
DatabaseSchema.methods.checkAccess = async function(user, accessType = 'read') {
    // Admin a accès à tout
    if (user.role === 'admin') {
        return true;
    }

    // Vérifier si l'utilisateur a accès au site lié
    const siteAccess = user.getSiteAccess(this.site);
    if (!siteAccess) {
        return false;
    }

    // Readonly: lecture seule
    if (user.role === 'readonly') {
        return accessType === 'read';
    }

    // User: lecture et écriture sur ses sites
    if (user.role === 'user') {
        return ['read', 'write'].includes(accessType);
    }

    return false;
};

// ============================================
// STATIC METHODS
// ============================================

/**
 * Trouve toutes les bases d'un site
 * @param {string} siteId 
 * @returns {Promise<Database[]>}
 */
DatabaseSchema.statics.findBySite = function(siteId) {
    return this.find({ site: siteId, status: { $ne: 'deleted' } });
};

/**
 * Trouve toutes les bases accessibles par un utilisateur
 * @param {User} user 
 * @returns {Promise<Database[]>}
 */
DatabaseSchema.statics.findByUser = async function(user) {
    if (user.role === 'admin') {
        return this.find({ status: { $ne: 'deleted' } }).populate('site', 'name displayName');
    }

    // Récupérer les IDs des sites de l'utilisateur
    const siteIds = user.sites.map(s => s.site);
    return this.find({ 
        site: { $in: siteIds },
        status: { $ne: 'deleted' },
    }).populate('site', 'name displayName');
};

/**
 * Génère un nom d'utilisateur DB unique
 * @param {string} siteName 
 * @param {string} dbName 
 * @param {string} dbType 
 * @returns {string}
 */
DatabaseSchema.statics.generateDbUsername = function(siteName, dbName, dbType) {
    // Format: tw_<site>_<db> (max 32 chars pour MySQL)
    const prefix = 'tw';
    const combined = `${siteName}_${dbName}`;
    const truncated = combined.slice(0, 29 - prefix.length);
    return `${prefix}_${truncated}`.replace(/-/g, '_');
};

/**
 * Génère un mot de passe DB sécurisé
 * @returns {string}
 */
DatabaseSchema.statics.generatePassword = function() {
    return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '');
};

/**
 * Vérifie si un nom de base est disponible
 * @param {string} name 
 * @param {string} type 
 * @returns {Promise<boolean>}
 */
DatabaseSchema.statics.isNameAvailable = async function(name, type) {
    const existing = await this.findOne({ name, type, status: { $ne: 'deleted' } });
    return !existing;
};

// ============================================
// VIRTUALS
// ============================================

// URL de connexion masquée (pour affichage)
DatabaseSchema.virtual('connectionUrl').get(function() {
    return this.getConnectionString(false);
});

// Type lisible
DatabaseSchema.virtual('typeDisplayName').get(function() {
    const names = {
        mongodb: 'MongoDB',
        mysql: 'MySQL',
        mariadb: 'MariaDB',
        postgresql: 'PostgreSQL',
    };
    return names[this.type] || this.type;
});

// Export
const Database = mongoose.model('Database', DatabaseSchema);

module.exports = Database;
module.exports.encryptPassword = encryptPassword;
module.exports.decryptPassword = decryptPassword;
