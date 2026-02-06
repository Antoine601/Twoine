/**
 * TWOINE - Domain Model
 * Gestion des domaines liés aux sites et services
 * Gère la correspondance domaine → site/service et les certificats auto-signés
 */

const mongoose = require('mongoose');

/**
 * Regex de validation des noms de domaine
 * - Pas de caractères spéciaux dangereux (; | .. espaces)
 * - Format domaine valide
 */
const DOMAIN_REGEX = /^(?!.*\.\.)(?!.*\s)(?!.*;)(?!.*\|)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Type de domaine
 */
const DOMAIN_TYPES = {
    PLATFORM: 'platform',  // Domaine de la plateforme Twoine (admin/user interface)
    SITE: 'site',          // Domaine d'un site utilisateur
};

/**
 * Schéma Domain Twoine
 */
const DomainSchema = new mongoose.Schema({
    // Nom de domaine (unique, lowercase)
    domain: {
        type: String,
        required: [true, 'Domain name is required'],
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return DOMAIN_REGEX.test(v);
            },
            message: props => `'${props.value}' is not a valid domain name. Avoid special characters (;|..) and spaces.`,
        },
    },

    // Type de domaine (platform ou site)
    type: {
        type: String,
        required: true,
        enum: Object.values(DOMAIN_TYPES),
        default: DOMAIN_TYPES.SITE,
    },

    // Site associé (null si domaine platform)
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
        default: null,
    },

    // Service associé (optionnel - pour router vers un service spécifique)
    service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        default: null,
    },

    // Port cible pour le reverse proxy (dérivé du service si lié)
    targetPort: {
        type: Number,
        min: 1,
        max: 65535,
    },

    // Adresse IP cible (par défaut localhost)
    targetAddress: {
        type: String,
        default: '127.0.0.1',
    },

    // Path prefix (ex: /api pour un sous-domaine API)
    pathPrefix: {
        type: String,
        default: '/',
    },

    // Configuration SSL/TLS
    ssl: {
        enabled: {
            type: Boolean,
            default: false,
        },
        type: {
            type: String,
            enum: ['none', 'self-signed'],
            default: 'none',
        },
        certPath: {
            type: String,
        },
        keyPath: {
            type: String,
        },
        generatedAt: Date,
        expiresAt: Date,
    },

    // Configuration Nginx
    nginx: {
        configPath: {
            type: String,
        },
        enabledPath: {
            type: String,
        },
        configured: {
            type: Boolean,
            default: false,
        },
        lastReload: Date,
    },

    // Vérification DNS
    dns: {
        verified: {
            type: Boolean,
            default: false,
        },
        lastCheck: Date,
        expectedRecords: [{
            type: {
                type: String,
                enum: ['A', 'AAAA', 'CNAME'],
            },
            value: String,
        }],
    },

    // Statut
    status: {
        type: String,
        enum: ['pending', 'configuring', 'active', 'error', 'deleting', 'deleted'],
        default: 'pending',
    },

    // Message d'erreur si status = error
    errorMessage: String,

    // Créé par (utilisateur Twoine)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // Métadonnées
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map(),
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ============================================
// INDEXES
// ============================================

DomainSchema.index({ domain: 1 }, { unique: true });
DomainSchema.index({ site: 1 });
DomainSchema.index({ service: 1 });
DomainSchema.index({ type: 1 });
DomainSchema.index({ status: 1 });
DomainSchema.index({ createdBy: 1 });

// ============================================
// PRE-SAVE HOOKS
// ============================================

DomainSchema.pre('save', function(next) {
    // Générer les chemins de certificat si SSL activé
    if (this.ssl.enabled && this.ssl.type === 'self-signed') {
        const certDir = process.env.CERTS_DIR || '/etc/twoine/certs';
        this.ssl.certPath = this.ssl.certPath || `${certDir}/${this.domain}/cert.pem`;
        this.ssl.keyPath = this.ssl.keyPath || `${certDir}/${this.domain}/key.pem`;
    }

    // Générer les chemins Nginx
    const nginxAvailable = process.env.NGINX_SITES_AVAILABLE || '/etc/nginx/sites-available';
    const nginxEnabled = process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled';
    this.nginx.configPath = this.nginx.configPath || `${nginxAvailable}/${this.domain}.conf`;
    this.nginx.enabledPath = this.nginx.enabledPath || `${nginxEnabled}/${this.domain}.conf`;

    next();
});

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Génère les enregistrements DNS attendus
 * @param {string} serverIp - IP du serveur
 * @param {string} serverIpv6 - IPv6 du serveur (optionnel)
 * @returns {Array}
 */
DomainSchema.methods.generateDnsRecords = function(serverIp, serverIpv6 = null) {
    const records = [
        {
            type: 'A',
            name: this.domain,
            value: serverIp,
            example: `${this.domain}     A     ${serverIp}`,
        },
    ];

    if (serverIpv6) {
        records.push({
            type: 'AAAA',
            name: this.domain,
            value: serverIpv6,
            example: `${this.domain}     AAAA     ${serverIpv6}`,
        });
    }

    return records;
};

/**
 * Génère la configuration Nginx pour ce domaine
 * @returns {string}
 */
DomainSchema.methods.generateNginxConfig = function() {
    const serverName = this.domain;
    const targetAddress = this.targetAddress || '127.0.0.1';
    const targetPort = this.targetPort;
    const pathPrefix = this.pathPrefix || '/';

    let config = '';

    // Bloc HTTP (redirection vers HTTPS si SSL activé)
    config += `# Configuration Nginx pour ${this.domain}
# Généré par Twoine - Ne pas modifier manuellement
# Date: ${new Date().toISOString()}

`;

    if (this.ssl.enabled) {
        // Redirection HTTP → HTTPS
        config += `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};

    # Redirection vers HTTPS
    return 301 https://$server_name$request_uri;
}

`;
        // Bloc HTTPS
        config += `server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${serverName};

    # Certificat SSL
    ssl_certificate     ${this.ssl.certPath};
    ssl_certificate_key ${this.ssl.keyPath};

    # Paramètres SSL recommandés
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # Headers de sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log /var/log/nginx/${serverName}.access.log;
    error_log /var/log/nginx/${serverName}.error.log;

    location ${pathPrefix} {
        proxy_pass http://${targetAddress}:${targetPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
`;
    } else {
        // HTTP uniquement
        config += `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};

    # Logs
    access_log /var/log/nginx/${serverName}.access.log;
    error_log /var/log/nginx/${serverName}.error.log;

    location ${pathPrefix} {
        proxy_pass http://${targetAddress}:${targetPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
`;
    }

    return config;
};

/**
 * Vérifie si un utilisateur a accès à ce domaine
 * @param {User} user
 * @param {string} accessType - 'read', 'write', 'admin'
 * @returns {boolean}
 */
DomainSchema.methods.checkAccess = async function(user, accessType = 'read') {
    // Admin a accès à tout
    if (user.role === 'admin') {
        return true;
    }

    // Domaine platform: lecture seule pour non-admin
    if (this.type === DOMAIN_TYPES.PLATFORM) {
        return accessType === 'read';
    }

    // Pas de site associé: pas d'accès pour non-admin
    if (!this.site) {
        return false;
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
 * Valide un nom de domaine
 * @param {string} domain
 * @returns {object} { valid: boolean, error?: string }
 */
DomainSchema.statics.validateDomain = function(domain) {
    if (!domain || typeof domain !== 'string') {
        return { valid: false, error: 'Domain is required and must be a string' };
    }

    const trimmed = domain.trim().toLowerCase();

    // Vérifier les caractères interdits
    if (trimmed.includes(';')) {
        return { valid: false, error: 'Domain cannot contain semicolon (;)' };
    }
    if (trimmed.includes('|')) {
        return { valid: false, error: 'Domain cannot contain pipe (|)' };
    }
    if (trimmed.includes('..')) {
        return { valid: false, error: 'Domain cannot contain double dots (..)' };
    }
    if (/\s/.test(trimmed)) {
        return { valid: false, error: 'Domain cannot contain spaces' };
    }

    // Vérifier le format
    if (!DOMAIN_REGEX.test(trimmed)) {
        return { valid: false, error: 'Invalid domain format' };
    }

    return { valid: true };
};

/**
 * Vérifie si un domaine est disponible
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
DomainSchema.statics.isAvailable = async function(domain) {
    const existing = await this.findOne({
        domain: domain.toLowerCase(),
        status: { $ne: 'deleted' },
    });
    return !existing;
};

/**
 * Trouve tous les domaines d'un site
 * @param {string} siteId
 * @returns {Promise<Domain[]>}
 */
DomainSchema.statics.findBySite = function(siteId) {
    return this.find({
        site: siteId,
        status: { $ne: 'deleted' },
    }).populate('service', 'name displayName port');
};

/**
 * Trouve tous les domaines d'un service
 * @param {string} serviceId
 * @returns {Promise<Domain[]>}
 */
DomainSchema.statics.findByService = function(serviceId) {
    return this.find({
        service: serviceId,
        status: { $ne: 'deleted' },
    });
};

/**
 * Trouve le domaine de la plateforme
 * @returns {Promise<Domain>}
 */
DomainSchema.statics.getPlatformDomain = function() {
    return this.findOne({
        type: DOMAIN_TYPES.PLATFORM,
        status: { $ne: 'deleted' },
    });
};

/**
 * Trouve tous les domaines accessibles par un utilisateur
 * @param {User} user
 * @returns {Promise<Domain[]>}
 */
DomainSchema.statics.findByUser = async function(user) {
    if (user.role === 'admin') {
        return this.find({ status: { $ne: 'deleted' } })
            .populate('site', 'name displayName')
            .populate('service', 'name displayName port');
    }

    // Récupérer les IDs des sites de l'utilisateur
    const siteIds = user.sites.map(s => s.site);
    return this.find({
        site: { $in: siteIds },
        status: { $ne: 'deleted' },
    })
        .populate('site', 'name displayName')
        .populate('service', 'name displayName port');
};

// ============================================
// VIRTUALS
// ============================================

// URL complète
DomainSchema.virtual('url').get(function() {
    const protocol = this.ssl.enabled ? 'https' : 'http';
    return `${protocol}://${this.domain}`;
});

// Statut SSL formaté
DomainSchema.virtual('sslStatus').get(function() {
    if (!this.ssl.enabled) return 'disabled';
    if (this.ssl.type === 'self-signed') return 'self-signed';
    return 'unknown';
});

// Export
const Domain = mongoose.model('Domain', DomainSchema);

module.exports = Domain;
module.exports.DOMAIN_TYPES = DOMAIN_TYPES;
module.exports.DOMAIN_REGEX = DOMAIN_REGEX;
