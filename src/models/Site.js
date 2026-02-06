/**
 * TWOINE - Site Model
 * Représente un site hébergé avec ses métadonnées et configuration
 */

const mongoose = require('mongoose');

const SiteSchema = new mongoose.Schema({
    // Identifiant unique du site (utilisé pour nommer les fichiers, users, etc.)
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[a-z][a-z0-9_-]{2,29}$/, 'Site name must start with a letter, contain only lowercase letters, numbers, hyphens, underscores, and be 3-30 characters'],
    },

    // Nom d'affichage
    displayName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },

    // Description du site
    description: {
        type: String,
        trim: true,
        maxlength: 500,
    },

    // Propriétaire du site (référence User Twoine)
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // User Linux associé au site
    linuxUser: {
        username: {
            type: String,
            required: true,
            unique: true,
        },
        uid: {
            type: Number,
            unique: true,
            sparse: true,
        },
        gid: {
            type: Number,
        },
        homeDir: {
            type: String,
        },
        created: {
            type: Boolean,
            default: false,
        },
    },

    // Chemins du site
    paths: {
        root: {
            type: String,
            required: true,
        },
        services: {
            type: String,
        },
        logs: {
            type: String,
        },
        data: {
            type: String,
        },
        tmp: {
            type: String,
        },
    },

    // Domaines associés
    domains: [{
        domain: {
            type: String,
            required: true,
            lowercase: true,
        },
        isPrimary: {
            type: Boolean,
            default: false,
        },
        sslEnabled: {
            type: Boolean,
            default: false,
        },
        sslType: {
            type: String,
            enum: ['none', 'self-signed', 'letsencrypt', 'custom'],
            default: 'none',
        },
        sslCertPath: String,
        sslKeyPath: String,
        sslExpiresAt: Date,
        verified: {
            type: Boolean,
            default: false,
        },
        verifiedAt: Date,
    }],

    // Configuration base de données (optionnel)
    database: {
        enabled: {
            type: Boolean,
            default: false,
        },
        type: {
            type: String,
            enum: ['none', 'mongodb', 'mysql', 'postgresql'],
            default: 'none',
        },
        name: String,
        user: String,
        passwordHash: String,
        host: {
            type: String,
            default: 'localhost',
        },
        port: Number,
    },

    // Plage de ports alloués
    portRange: {
        start: {
            type: Number,
            required: true,
        },
        end: {
            type: Number,
            required: true,
        },
    },

    // Statut global du site
    status: {
        type: String,
        enum: ['pending', 'creating', 'active', 'stopped', 'error', 'deleting', 'deleted'],
        default: 'pending',
    },

    // Message d'erreur si status = error
    errorMessage: String,

    // Ressources allouées
    resources: {
        maxMemoryMB: {
            type: Number,
            default: 512,
        },
        maxCpuPercent: {
            type: Number,
            default: 100,
        },
        maxDiskMB: {
            type: Number,
            default: 1024,
        },
    },

    // Variables d'environnement globales du site
    environment: {
        type: Map,
        of: String,
        default: new Map(),
    },

    // Métadonnées
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map(),
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    lastActivityAt: {
        type: Date,
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Indexes
SiteSchema.index({ owner: 1 });
SiteSchema.index({ status: 1 });
SiteSchema.index({ 'domains.domain': 1 });
SiteSchema.index({ 'linuxUser.username': 1 });

// Virtual: services count
SiteSchema.virtual('services', {
    ref: 'Service',
    localField: '_id',
    foreignField: 'site',
});

// Pre-save: auto-generate paths and linux user
SiteSchema.pre('save', function(next) {
    if (this.isNew) {
        const basePath = process.env.SITES_DIR || '/var/www/sites';
        
        // Chemins du site
        this.paths.root = this.paths.root || `${basePath}/${this.name}`;
        this.paths.services = `${this.paths.root}/services`;
        this.paths.logs = `${this.paths.root}/logs`;
        this.paths.data = `${this.paths.root}/data`;
        this.paths.tmp = `${this.paths.root}/tmp`;
        
        // User Linux
        this.linuxUser.username = this.linuxUser.username || `site_${this.name}`;
        this.linuxUser.homeDir = this.paths.root;
    }
    
    this.updatedAt = new Date();
    next();
});

// Méthode: Obtenir le prochain port disponible
SiteSchema.methods.getNextAvailablePort = async function() {
    const Service = mongoose.model('Service');
    const usedPorts = await Service.find({ site: this._id }).distinct('port');
    
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
        if (!usedPorts.includes(port)) {
            return port;
        }
    }
    
    throw new Error('No available ports in range');
};

// Méthode: Vérifier si un port est disponible
SiteSchema.methods.isPortAvailable = async function(port) {
    if (port < this.portRange.start || port > this.portRange.end) {
        return false;
    }
    
    const Service = mongoose.model('Service');
    const existing = await Service.findOne({ site: this._id, port });
    return !existing;
};

// Méthode: Obtenir tous les services
SiteSchema.methods.getServices = async function() {
    const Service = mongoose.model('Service');
    return Service.find({ site: this._id });
};

// Méthode: Obtenir le domaine principal
SiteSchema.methods.getPrimaryDomain = function() {
    const primary = this.domains.find(d => d.isPrimary);
    return primary ? primary.domain : null;
};

// Statique: Trouver par domaine
SiteSchema.statics.findByDomain = function(domain) {
    return this.findOne({ 'domains.domain': domain.toLowerCase() });
};

// Méthode: Obtenir tous les utilisateurs avec accès à ce site
SiteSchema.methods.getUsers = async function() {
    const User = mongoose.model('User');
    return User.find({ 'sites.site': this._id });
};

// Méthode: Vérifier si un utilisateur a accès à ce site
SiteSchema.methods.hasUserAccess = async function(userId) {
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.sites.some(s => s.site.toString() === this._id.toString());
};

// Statique: Générer une plage de ports unique
SiteSchema.statics.generatePortRange = async function() {
    const lastSite = await this.findOne().sort({ 'portRange.end': -1 });
    const startPort = lastSite ? lastSite.portRange.end + 1 : 10000;
    
    // Chaque site a 10 ports réservés
    return {
        start: startPort,
        end: startPort + 9,
    };
};

module.exports = mongoose.model('Site', SiteSchema);
