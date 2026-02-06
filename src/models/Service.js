/**
 * TWOINE - Service Model
 * Représente un service (process) au sein d'un site
 */

const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    // Référence au site parent
    site: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
        required: true,
        index: true,
    },

    // Nom unique du service (au sein du site)
    name: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [/^[a-z][a-z0-9_-]{1,29}$/, 'Service name must start with a letter, contain only lowercase letters, numbers, hyphens, underscores, and be 2-30 characters'],
    },

    // Nom d'affichage
    displayName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },

    // Description
    description: {
        type: String,
        trim: true,
        maxlength: 500,
    },

    // Type de service
    type: {
        type: String,
        required: true,
        enum: ['node', 'python', 'php', 'ruby', 'go', 'rust', 'java', 'dotnet', 'static', 'custom'],
    },

    // Commandes
    commands: {
        // Commande d'installation (ex: npm install, pip install -r requirements.txt)
        install: {
            type: String,
            trim: true,
        },
        // Commande de build (ex: npm run build)
        build: {
            type: String,
            trim: true,
        },
        // Commande de démarrage (ex: npm start, python app.py)
        start: {
            type: String,
            required: true,
            trim: true,
        },
        // Commande d'arrêt personnalisée (optionnel, sinon SIGTERM via systemd)
        stop: {
            type: String,
            trim: true,
        },
        // Commande de santé (optionnel)
        healthCheck: {
            type: String,
            trim: true,
        },
    },

    // Commandes personnalisées (migrate, seed, etc.)
    customCommands: [{
        name: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            match: [/^[a-z][a-z0-9_-]{1,29}$/, 'Command name must be lowercase alphanumeric'],
        },
        displayName: {
            type: String,
            trim: true,
            maxlength: 50,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 200,
        },
        command: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },
        // Timeout en secondes
        timeout: {
            type: Number,
            default: 300,
            min: 10,
            max: 3600,
        },
        // Requiert l'arrêt du service avant exécution
        requiresStop: {
            type: Boolean,
            default: false,
        },
        // Danger: cette commande peut causer des pertes de données
        dangerous: {
            type: Boolean,
            default: false,
        },
    }],

    // Configuration du runtime
    runtime: {
        // Version du runtime (ex: "20" pour Node 20, "3.11" pour Python 3.11)
        version: {
            type: String,
            trim: true,
        },
        // Binaire à utiliser (ex: /usr/bin/node, /usr/bin/python3)
        binary: {
            type: String,
            trim: true,
        },
        // Arguments additionnels pour le runtime
        args: [{
            type: String,
        }],
    },

    // Répertoire de travail (relatif à site.paths.services)
    workingDir: {
        type: String,
        required: true,
    },

    // Port d'écoute
    port: {
        type: Number,
        required: true,
        min: 1024,
        max: 65535,
    },

    // Configuration systemd
    systemd: {
        // Nom du fichier service
        serviceName: {
            type: String,
            required: true,
        },
        // Type de service systemd
        serviceType: {
            type: String,
            enum: ['simple', 'forking', 'oneshot', 'notify'],
            default: 'simple',
        },
        // Délai avant restart
        restartSec: {
            type: Number,
            default: 5,
        },
        // Politique de restart
        restartPolicy: {
            type: String,
            enum: ['no', 'always', 'on-success', 'on-failure', 'on-abnormal', 'on-abort', 'on-watchdog'],
            default: 'always',
        },
        // Nombre max de restarts
        startLimitBurst: {
            type: Number,
            default: 5,
        },
        // Période pour compter les restarts
        startLimitIntervalSec: {
            type: Number,
            default: 60,
        },
        // Timeout pour le démarrage
        timeoutStartSec: {
            type: Number,
            default: 30,
        },
        // Timeout pour l'arrêt
        timeoutStopSec: {
            type: Number,
            default: 30,
        },
        // Fichier créé
        unitFileCreated: {
            type: Boolean,
            default: false,
        },
        // Dernière mise à jour du fichier unit
        unitFileUpdatedAt: Date,
    },

    // Variables d'environnement spécifiques au service
    environment: {
        type: Map,
        of: String,
        default: new Map(),
    },

    // Fichier d'environnement (.env)
    envFile: {
        enabled: {
            type: Boolean,
            default: true,
        },
        path: String,
    },

    // Statut du service
    status: {
        current: {
            type: String,
            enum: ['unknown', 'stopped', 'starting', 'running', 'stopping', 'failed', 'restarting'],
            default: 'unknown',
        },
        desired: {
            type: String,
            enum: ['stopped', 'running'],
            default: 'stopped',
        },
        lastCheck: Date,
        lastStateChange: Date,
        failureCount: {
            type: Number,
            default: 0,
        },
        lastError: String,
    },

    // Informations runtime
    processInfo: {
        pid: Number,
        startedAt: Date,
        uptime: Number,
        memoryUsageMB: Number,
        cpuPercent: Number,
    },

    // Configuration réseau
    network: {
        // Interface d'écoute (127.0.0.1 par défaut pour sécurité)
        bindAddress: {
            type: String,
            default: '127.0.0.1',
        },
        // Protocole
        protocol: {
            type: String,
            enum: ['http', 'https', 'tcp', 'udp'],
            default: 'http',
        },
        // Exposé via Nginx
        exposed: {
            type: Boolean,
            default: true,
        },
        // Path prefix (ex: /api)
        pathPrefix: {
            type: String,
            default: '/',
        },
    },

    // Health check
    healthCheck: {
        enabled: {
            type: Boolean,
            default: true,
        },
        endpoint: {
            type: String,
            default: '/health',
        },
        intervalSec: {
            type: Number,
            default: 30,
        },
        timeoutSec: {
            type: Number,
            default: 5,
        },
        healthyThreshold: {
            type: Number,
            default: 2,
        },
        unhealthyThreshold: {
            type: Number,
            default: 3,
        },
        lastCheck: Date,
        lastStatus: {
            type: String,
            enum: ['unknown', 'healthy', 'unhealthy'],
            default: 'unknown',
        },
    },

    // Ressources (limites)
    resources: {
        maxMemoryMB: {
            type: Number,
            default: 256,
        },
        maxCpuPercent: {
            type: Number,
            default: 50,
        },
    },

    // Auto-start au boot
    autoStart: {
        type: Boolean,
        default: true,
    },

    // Priorité de démarrage (plus bas = démarre en premier)
    startPriority: {
        type: Number,
        default: 50,
        min: 1,
        max: 100,
    },

    // Dépendances (autres services du même site)
    dependencies: [{
        service: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
        },
        required: {
            type: Boolean,
            default: false,
        },
    }],

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

// Index composé unique: un service par nom par site
ServiceSchema.index({ site: 1, name: 1 }, { unique: true });
ServiceSchema.index({ port: 1 }, { unique: true });
ServiceSchema.index({ 'systemd.serviceName': 1 }, { unique: true });
ServiceSchema.index({ 'status.current': 1 });

// Pre-save: générer les valeurs automatiques
ServiceSchema.pre('save', async function(next) {
    if (this.isNew) {
        // Récupérer le site parent
        const Site = mongoose.model('Site');
        const site = await Site.findById(this.site);
        
        if (!site) {
            return next(new Error('Site not found'));
        }
        
        // Générer le nom du service systemd
        this.systemd.serviceName = this.systemd.serviceName || `twoine-${site.name}-${this.name}`;
        
        // Chemin du fichier .env
        this.envFile.path = this.envFile.path || `${this.workingDir}/.env`;
        
        // Port: utiliser celui du site si non spécifié
        if (!this.port) {
            this.port = await site.getNextAvailablePort();
        }
    }
    
    next();
});

// Méthode: Obtenir le chemin complet du répertoire de travail
ServiceSchema.methods.getFullWorkingDir = async function() {
    const Site = mongoose.model('Site');
    const site = await Site.findById(this.site);
    return site ? `${site.paths.services}/${this.name}` : null;
};

// Méthode: Générer le contenu du fichier systemd unit
ServiceSchema.methods.generateSystemdUnit = async function() {
    const Site = mongoose.model('Site');
    const site = await Site.findById(this.site);
    
    if (!site) {
        throw new Error('Site not found');
    }
    
    const workingDir = `${site.paths.services}/${this.name}`;
    const envFilePath = `${workingDir}/.env`;
    
    // Construire la commande ExecStart sécurisée
    let execStart = this.commands.start;
    
    // Si un binaire spécifique est défini
    if (this.runtime.binary) {
        execStart = `${this.runtime.binary} ${execStart}`;
    }
    
    // Générer le fichier unit
    const unit = `[Unit]
Description=Twoine Service: ${site.name}/${this.name} (${this.displayName})
Documentation=https://github.com/Antoine601/Twoine
After=network.target
${this.dependencies.length > 0 ? `Wants=${this.dependencies.map(d => `twoine-${site.name}-${d.service}.service`).join(' ')}` : ''}

[Service]
Type=${this.systemd.serviceType}
User=${site.linuxUser.username}
Group=${site.linuxUser.username}
WorkingDirectory=${workingDir}
ExecStart=${execStart}
Restart=${this.systemd.restartPolicy}
RestartSec=${this.systemd.restartSec}
TimeoutStartSec=${this.systemd.timeoutStartSec}
TimeoutStopSec=${this.systemd.timeoutStopSec}
StartLimitBurst=${this.systemd.startLimitBurst}
StartLimitIntervalSec=${this.systemd.startLimitIntervalSec}

# Environment
Environment=NODE_ENV=production
Environment=PORT=${this.port}
EnvironmentFile=-${envFilePath}

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${workingDir} ${site.paths.logs} ${site.paths.data} ${site.paths.tmp}

# Resource Limits
MemoryMax=${this.resources.maxMemoryMB}M
CPUQuota=${this.resources.maxCpuPercent}%

# Logging
StandardOutput=append:${site.paths.logs}/${this.name}.log
StandardError=append:${site.paths.logs}/${this.name}-error.log

[Install]
WantedBy=multi-user.target
`;
    
    return unit;
};

// Méthode: Générer le contenu du fichier .env
ServiceSchema.methods.generateEnvFile = async function() {
    const Site = mongoose.model('Site');
    const site = await Site.findById(this.site);
    
    let envContent = `# Auto-generated by Twoine - Do not edit manually
# Site: ${site.name}
# Service: ${this.name}
# Generated: ${new Date().toISOString()}

NODE_ENV=production
PORT=${this.port}
`;
    
    // Ajouter les variables du site
    if (site.environment && site.environment.size > 0) {
        envContent += '\n# Site Environment Variables\n';
        for (const [key, value] of site.environment) {
            envContent += `${key}=${value}\n`;
        }
    }
    
    // Ajouter les variables du service
    if (this.environment && this.environment.size > 0) {
        envContent += '\n# Service Environment Variables\n';
        for (const [key, value] of this.environment) {
            envContent += `${key}=${value}\n`;
        }
    }
    
    return envContent;
};

// Virtual: uptime formaté
ServiceSchema.virtual('uptimeFormatted').get(function() {
    if (!this.processInfo.startedAt) return null;
    
    const uptime = Date.now() - this.processInfo.startedAt.getTime();
    const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
});

// Statique: Trouver tous les services d'un site
ServiceSchema.statics.findBySite = function(siteId) {
    return this.find({ site: siteId }).sort({ startPriority: 1 });
};

// Statique: Trouver par nom de service systemd
ServiceSchema.statics.findBySystemdName = function(serviceName) {
    return this.findOne({ 'systemd.serviceName': serviceName });
};

module.exports = mongoose.model('Service', ServiceSchema);
