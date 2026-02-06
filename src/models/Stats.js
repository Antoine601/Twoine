/**
 * TWOINE - Stats Models
 * Modèles pour le stockage des statistiques serveur et sites
 */

const mongoose = require('mongoose');

/**
 * Schema pour les snapshots de statistiques serveur
 * Stockage léger avec rétention de 24h
 */
const ServerStatsSchema = new mongoose.Schema({
    // Timestamp du snapshot
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },

    // CPU
    cpu: {
        percent: {
            type: Number,
            min: 0,
            max: 100,
        },
        cores: Number,
        model: String,
        speed: Number,
        loadAvg: {
            one: Number,
            five: Number,
            fifteen: Number,
        },
    },

    // Mémoire RAM
    memory: {
        total: Number,
        used: Number,
        free: Number,
        percent: {
            type: Number,
            min: 0,
            max: 100,
        },
        cached: Number,
        buffers: Number,
    },

    // Disque
    disk: {
        total: Number,
        used: Number,
        free: Number,
        percent: {
            type: Number,
            min: 0,
            max: 100,
        },
    },

    // Réseau
    network: {
        bytesIn: Number,
        bytesOut: Number,
        packetsIn: Number,
        packetsOut: Number,
    },

    // Uptime serveur en secondes
    uptime: Number,

    // Compteurs globaux
    totals: {
        sites: Number,
        services: Number,
        users: Number,
        servicesRunning: Number,
        servicesStopped: Number,
    },

    // Processus
    processes: {
        total: Number,
        running: Number,
        sleeping: Number,
        stopped: Number,
    },
}, {
    timestamps: false,
    collection: 'server_stats',
});

// TTL index pour suppression automatique après 24h
ServerStatsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 });

/**
 * Schema pour les snapshots de statistiques par site
 */
const SiteStatsSchema = new mongoose.Schema({
    // Référence au site
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
        required: true,
        index: true,
    },

    // Timestamp du snapshot
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },

    // CPU utilisé par le site (via cgroups/user processes)
    cpu: {
        percent: {
            type: Number,
            min: 0,
            max: 100,
        },
        // Temps CPU cumulé en ms
        timeMs: Number,
    },

    // Mémoire utilisée par le site
    memory: {
        usedBytes: Number,
        percent: Number,
        limit: Number,
    },

    // Disque utilisé par le site
    disk: {
        usedBytes: Number,
        percent: Number,
        limit: Number,
        fileCount: Number,
    },

    // Compteur de services
    services: {
        total: Number,
        running: Number,
        stopped: Number,
        failed: Number,
    },

    // Compteur de requêtes (si disponible via nginx logs)
    requests: {
        total: Number,
        success: Number,
        errors: Number,
        avgResponseTime: Number,
    },

    // Visiteurs uniques (si disponible)
    visitors: {
        unique: Number,
        total: Number,
    },
}, {
    timestamps: false,
    collection: 'site_stats',
});

// Index composé pour requêtes par site et période
SiteStatsSchema.index({ site: 1, timestamp: -1 });

// TTL index pour suppression automatique après 24h
SiteStatsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 });

/**
 * Schema pour les alertes système
 */
const AlertSchema = new mongoose.Schema({
    // Type d'alerte
    type: {
        type: String,
        enum: [
            'cpu_high',
            'memory_high',
            'disk_high',
            'service_down',
            'site_down',
            'service_restart',
            'security',
            'custom',
        ],
        required: true,
    },

    // Niveau de sévérité
    severity: {
        type: String,
        enum: ['info', 'warning', 'error', 'critical'],
        default: 'warning',
    },

    // Message de l'alerte
    message: {
        type: String,
        required: true,
        maxlength: 500,
    },

    // Données associées
    data: {
        type: mongoose.Schema.Types.Mixed,
    },

    // Ressources concernées
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
    },
    service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
    },

    // Statut de l'alerte
    status: {
        type: String,
        enum: ['active', 'acknowledged', 'resolved'],
        default: 'active',
    },

    // Utilisateur ayant acquitté l'alerte
    acknowledgedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    acknowledgedAt: Date,

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    resolvedAt: Date,
}, {
    timestamps: false,
    collection: 'alerts',
});

// Index pour les alertes actives
AlertSchema.index({ status: 1, createdAt: -1 });
AlertSchema.index({ site: 1, status: 1 });

// TTL index pour suppression des alertes résolues après 7 jours
AlertSchema.index(
    { resolvedAt: 1 },
    { expireAfterSeconds: 604800, partialFilterExpression: { status: 'resolved' } }
);

/**
 * Schema pour la configuration du monitoring
 */
const MonitoringConfigSchema = new mongoose.Schema({
    // Singleton - une seule config
    _id: {
        type: String,
        default: 'monitoring_config',
    },

    // Intervalle de collecte en secondes
    collectionInterval: {
        type: Number,
        default: 30,
        min: 10,
        max: 300,
    },

    // Seuils d'alerte CPU
    alertThresholds: {
        cpu: {
            warning: { type: Number, default: 70 },
            critical: { type: Number, default: 90 },
        },
        memory: {
            warning: { type: Number, default: 75 },
            critical: { type: Number, default: 90 },
        },
        disk: {
            warning: { type: Number, default: 80 },
            critical: { type: Number, default: 95 },
        },
    },

    // Activer/désactiver les alertes
    alertsEnabled: {
        type: Boolean,
        default: true,
    },

    // Activer/désactiver la collecte par site
    siteStatsEnabled: {
        type: Boolean,
        default: true,
    },

    // Durée de rétention en heures
    retentionHours: {
        type: Number,
        default: 24,
        min: 1,
        max: 168, // 7 jours max
    },

    // Dernière mise à jour
    updatedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    _id: false,
    collection: 'monitoring_config',
});

// Méthode statique pour obtenir ou créer la config
MonitoringConfigSchema.statics.getConfig = async function() {
    let config = await this.findById('monitoring_config');
    if (!config) {
        config = await this.create({ _id: 'monitoring_config' });
    }
    return config;
};

const ServerStats = mongoose.model('ServerStats', ServerStatsSchema);
const SiteStats = mongoose.model('SiteStats', SiteStatsSchema);
const Alert = mongoose.model('Alert', AlertSchema);
const MonitoringConfig = mongoose.model('MonitoringConfig', MonitoringConfigSchema);

module.exports = {
    ServerStats,
    SiteStats,
    Alert,
    MonitoringConfig,
};
