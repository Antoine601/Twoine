# Twoine - Gestion des Services

## Vue d'ensemble

Twoine permet de gérer les services (processus) de chaque site hébergé. Chaque site peut avoir un ou plusieurs services, et chaque service correspond à :

- Un processus système réel (systemd)
- Exécuté sous l'utilisateur Linux du site
- Isolé des autres sites

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TWOINE API                           │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  ServiceManager │  │  SystemdManager │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           └────────┬───────────┘                            │
│                    │                                        │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      SYSTEMD                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  twoine-site1-frontend.service                       │  │
│  │  twoine-site1-backend.service                        │  │
│  │  twoine-site2-api.service                            │  │
│  │  ...                                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   PROCESSUS ISOLÉS                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ User: site_1│  │ User: site_1│  │ User: site_2│         │
│  │ frontend    │  │ backend     │  │ api         │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Schéma logique

```
Site (1) ─────────────> (N) Service
  │                           │
  │                           ├── Commandes (start, stop, build, install)
  │                           ├── Commandes custom (migrate, seed, etc.)
  │                           ├── Fichier systemd unit
  │                           ├── Variables d'environnement
  │                           └── Port d'écoute
  │
  └── linuxUser (site_xxx) ── Utilisateur d'exécution des services
```

## Structure d'un service

### Propriétés principales

| Propriété | Type | Description |
|-----------|------|-------------|
| `name` | string | Identifiant unique (lowercase, 2-30 chars) |
| `displayName` | string | Nom d'affichage |
| `type` | enum | node, python, php, ruby, go, rust, java, dotnet, static, custom |
| `port` | number | Port d'écoute (1024-65535) |
| `workingDir` | string | Répertoire de travail |

### Commandes

| Commande | Description | Exemple |
|----------|-------------|---------|
| `start` | Démarrage du service (obligatoire) | `npm start` |
| `stop` | Arrêt personnalisé (optionnel) | `npm stop` |
| `install` | Installation des dépendances | `npm install` |
| `build` | Compilation/build | `npm run build` |
| `healthCheck` | Vérification de santé | `curl localhost:3000/health` |

### Commandes personnalisées

Chaque service peut définir des commandes custom :

```json
{
  "customCommands": [
    {
      "name": "migrate",
      "displayName": "Database Migration",
      "command": "npm run migrate",
      "timeout": 300,
      "requiresStop": true,
      "dangerous": false
    },
    {
      "name": "seed",
      "displayName": "Seed Database",
      "command": "npm run seed",
      "timeout": 120,
      "requiresStop": false,
      "dangerous": true
    }
  ]
}
```

## Rôles et permissions

### Admin

| Action | Autorisé |
|--------|----------|
| Voir tous les services | ✅ |
| Créer/modifier/supprimer | ✅ |
| Start/stop/restart | ✅ |
| Exécuter commandes custom | ✅ |
| Exécuter commandes dangereuses | ✅ |
| Actions groupées | ✅ |

### User (Developer)

| Action | Autorisé |
|--------|----------|
| Voir services de ses sites | ✅ |
| Créer/modifier/supprimer (ses sites) | ✅ |
| Start/stop/restart | ✅ |
| Exécuter commandes custom | ✅ |
| Exécuter commandes dangereuses | ❌ |

### Readonly

| Action | Autorisé |
|--------|----------|
| Voir services de ses sites | ✅ |
| Voir l'état des services | ✅ |
| Start/stop/restart | ❌ |
| Exécuter commandes | ❌ |
| Modifications | ❌ |

## API Endpoints

### CRUD Services

```
GET    /api/sites/:siteId/services          # Liste les services d'un site
POST   /api/sites/:siteId/services          # Créer un service
GET    /api/services/:serviceId              # Détails d'un service
PATCH  /api/services/:serviceId              # Modifier un service
DELETE /api/services/:serviceId              # Supprimer un service
```

### Actions

```
POST   /api/services/:serviceId/start        # Démarrer
POST   /api/services/:serviceId/stop         # Arrêter
POST   /api/services/:serviceId/restart      # Redémarrer
GET    /api/services/:serviceId/status       # Statut systemd
POST   /api/services/:serviceId/install      # Exécuter install
POST   /api/services/:serviceId/build        # Exécuter build
GET    /api/services/:serviceId/health       # Vérifier la santé
```

### Commandes custom

```
GET    /api/services/:serviceId/commands                      # Liste les commandes
POST   /api/services/:serviceId/commands                      # Ajouter une commande
DELETE /api/services/:serviceId/commands/:commandName         # Supprimer une commande
POST   /api/services/:serviceId/commands/:commandName/execute # Exécuter une commande
```

### Variables d'environnement

```
PUT    /api/services/:serviceId/environment  # Mettre à jour les variables
```

### Admin

```
GET    /api/admin/services                   # Liste tous les services
POST   /api/admin/services/bulk-action       # Actions groupées
```

## Exemples d'utilisation API

### Créer un service Node.js

```bash
curl -X POST /api/sites/SITE_ID/services \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "frontend",
    "displayName": "Frontend React",
    "type": "node",
    "commands": {
      "start": "npm start",
      "install": "npm install",
      "build": "npm run build"
    },
    "port": 3000,
    "autoStart": true
  }'
```

### Ajouter une commande custom

```bash
curl -X POST /api/services/SERVICE_ID/commands \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "migrate",
    "displayName": "Run Migrations",
    "command": "npm run migrate",
    "timeout": 300,
    "requiresStop": true
  }'
```

### Exécuter une commande custom

```bash
curl -X POST /api/services/SERVICE_ID/commands/migrate/execute \
  -H "Authorization: Bearer TOKEN"
```

## Scripts Bash

### service-manager.sh

Script principal de gestion des services systemd.

```bash
# Créer un service
sudo twoine-service create mysite frontend "npm start" 3000 node

# Démarrer/arrêter
sudo twoine-service start mysite frontend
sudo twoine-service stop mysite frontend
sudo twoine-service restart mysite frontend

# Statut et logs
twoine-service status mysite frontend
twoine-service logs mysite frontend 100 -f

# Lister les services
twoine-service list mysite
twoine-service list  # tous les services
```

### service-cleanup.sh

Nettoie tous les services lors de la suppression d'un site.

```bash
sudo twoine-service-cleanup mysite
sudo twoine-service-cleanup mysite --force
```

## Fichier Systemd généré

Template utilisé pour chaque service :

```ini
[Unit]
Description=Twoine Service: {{SITE_NAME}}/{{SERVICE_NAME}}
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User={{LINUX_USER}}
Group={{LINUX_USER}}
WorkingDirectory={{WORKING_DIR}}

ExecStart={{EXEC_START}}

Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT={{PORT}}
EnvironmentFile=-{{ENV_FILE}}

# Sécurité
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={{WORKING_DIR}} {{LOG_DIR}} {{DATA_DIR}} {{TMP_DIR}}
PrivateTmp=true

# Limites
MemoryMax={{MAX_MEMORY_MB}}M
CPUQuota={{MAX_CPU_PERCENT}}%

# Logs
StandardOutput=append:{{LOG_DIR}}/{{SERVICE_NAME}}.log
StandardError=append:{{LOG_DIR}}/{{SERVICE_NAME}}-error.log

[Install]
WantedBy=multi-user.target
```

## Sécurité

### Isolation des services

- **Utilisateur dédié** : Chaque site a son propre utilisateur Linux (`site_xxx`)
- **Système de fichiers** : `ProtectSystem=strict`, accès limité
- **Répertoires** : Lecture/écriture uniquement dans les répertoires autorisés
- **Privilèges** : `NoNewPrivileges=true`, pas d'escalade possible
- **Ressources** : Limites CPU et mémoire par service

### Validation des commandes

Les commandes sont validées contre une liste de patterns interdits :

```javascript
const forbiddenPatterns = [
    /[;&|`$(){}[\]<>\\]/,  // Caractères shell dangereux
    /\.\.\//,              // Path traversal
    /\/etc\//,             // Accès système
    /\/root/,              // Accès root
    /sudo|su\s/,           // Élévation de privilèges
    /chmod|chown/,         // Modification permissions
    /rm\s+-rf/,            // Suppression récursive
    /wget|curl.*\|/,       // Téléchargement et exécution
];
```

### Whitelist des commandes de démarrage

Seules certaines commandes sont autorisées :

```javascript
const allowedPrefixes = [
    'npm', 'node', 'yarn', 'pnpm',
    'python', 'python3', 'pip',
    'php', 'php-fpm',
    'ruby', 'bundle',
    'go', 'cargo',
    'java', 'dotnet',
    './start', './run', './app',
];
```

## Cas d'usage

### Site avec un seul service

```
Site: blog
└── Service: app (Node.js)
    ├── Port: 10000
    ├── Start: npm start
    └── Systemd: twoine-blog-app.service
```

### Site avec plusieurs services

```
Site: ecommerce
├── Service: frontend (React)
│   ├── Port: 10010
│   └── Start: npm start
├── Service: api (Express)
│   ├── Port: 10011
│   └── Start: node server.js
├── Service: worker (Background jobs)
│   ├── Port: 10012
│   └── Start: npm run worker
└── Service: bot (Discord/Telegram)
    ├── Port: 10013
    └── Start: python bot.py
```

### Gestion des erreurs

| Cas | Comportement |
|-----|--------------|
| User tente de stopper service d'un autre site | Refus (403 Forbidden) |
| Readonly tente start/stop | Refus (403 Forbidden) |
| Service crash | Statut = 'failed', compteur d'erreurs incrémenté |
| Suppression site | Suppression automatique de tous ses services |
| Commande timeout | Erreur retournée, service potentiellement redémarré |

## Bonnes pratiques

1. **Health checks** : Activez les health checks pour détecter les services défaillants
2. **Limites ressources** : Définissez des limites mémoire/CPU appropriées
3. **Commandes dangereuses** : Marquez les commandes destructrices comme `dangerous: true`
4. **Timeouts** : Ajustez les timeouts selon la durée attendue des commandes
5. **Logs** : Consultez régulièrement les logs pour détecter les problèmes
6. **Auto-start** : Activez `autoStart` pour les services critiques

## Dépannage

### Le service ne démarre pas

```bash
# Vérifier les logs
journalctl -u twoine-sitename-servicename -n 50

# Vérifier le statut détaillé
systemctl status twoine-sitename-servicename

# Vérifier les permissions
ls -la /var/www/sites/sitename/services/servicename/
```

### Erreur de port

```bash
# Vérifier si le port est utilisé
ss -tlnp | grep :3000

# Libérer le port
kill $(lsof -t -i:3000)
```

### Service en état failed

```bash
# Reset le compteur d'échecs
systemctl reset-failed twoine-sitename-servicename

# Redémarrer
systemctl restart twoine-sitename-servicename
```
