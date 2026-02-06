# Twoine - Architecture Interne : Sites et Services

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Concepts fondamentaux](#concepts-fondamentaux)
3. [Structure des fichiers](#structure-des-fichiers)
4. [Isolation et sécurité](#isolation-et-sécurité)
5. [Gestion systemd](#gestion-systemd)
6. [API REST](#api-rest)
7. [Bonnes pratiques](#bonnes-pratiques)
8. [Troubleshooting](#troubleshooting)

---

## Vue d'ensemble

### Schéma logique

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TWOINE PLATFORM                                │
│                         (Node.js + Express)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │     Site A      │  │     Site B      │  │     Site C      │         │
│  │  (site_sitea)   │  │  (site_siteb)   │  │  (site_sitec)   │         │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤         │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │         │
│  │ │  frontend   │ │  │ │    api      │ │  │ │   webapp    │ │         │
│  │ │  :10001     │ │  │ │  :10010     │ │  │ │   :10020    │ │         │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │         │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │                 │         │
│  │ │   backend   │ │  │ │   worker    │ │  │                 │         │
│  │ │  :10002     │ │  │ │  :10011     │ │  │                 │         │
│  │ └─────────────┘ │  │ └─────────────┘ │  │                 │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              NGINX                                       │
│                     (Reverse Proxy + SSL)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                              INTERNET
```

### Flux de données

```
Requête HTTP → Nginx → Service (port local) → Réponse
                 │
                 └─→ SSL termination
                 └─→ Rate limiting
                 └─→ Load balancing (futur)
```

---

## Concepts fondamentaux

### Définition d'un Site

Un **site** représente une entité logique regroupant :

| Élément | Description |
|---------|-------------|
| **Nom unique** | Identifiant alphanumérique (ex: `myapp`, `blog-prod`) |
| **User Linux** | Utilisateur dédié `site_<nom>` pour l'isolation |
| **Répertoire** | `/var/www/sites/<nom>/` |
| **Services** | Un ou plusieurs processus |
| **Ports** | Plage de ports réservée (10 ports par site) |
| **Domaines** | Zéro ou plusieurs domaines associés |

### Définition d'un Service

Un **service** est un processus au sein d'un site :

| Élément | Description |
|---------|-------------|
| **Nom** | Identifiant unique dans le site |
| **Type** | `node`, `python`, `php`, `ruby`, `go`, `custom`... |
| **Commande** | Commande de démarrage (ex: `npm start`) |
| **Port** | Port d'écoute unique |
| **Unit systemd** | Fichier `/etc/systemd/system/twoine-<site>-<service>.service` |

### Cycle de vie

```
Site: pending → creating → active → stopped → deleting → deleted
                   │          │
                   └──────────┴─→ error

Service: unknown → stopped → starting → running → stopping → failed
                      ↑                     │         │
                      └─────────────────────┴─────────┘
```

---

## Structure des fichiers

### Arborescence d'un site

```
/var/www/sites/
└── mysite/                          # Répertoire racine du site
    ├── services/                    # Répertoire des services
    │   ├── frontend/                # Service frontend
    │   │   ├── .env                 # Variables d'environnement
    │   │   ├── package.json
    │   │   ├── node_modules/
    │   │   └── src/
    │   └── backend/                 # Service backend
    │       ├── .env
    │       ├── requirements.txt
    │       └── app.py
    ├── logs/                        # Logs des services
    │   ├── frontend.log
    │   ├── frontend-error.log
    │   ├── backend.log
    │   └── backend-error.log
    ├── data/                        # Données persistantes
    └── tmp/                         # Fichiers temporaires
```

### Fichiers systemd

```
/etc/systemd/system/
├── twoine-mysite-frontend.service
├── twoine-mysite-backend.service
└── twoine-othersite-api.service
```

### Utilisateurs Linux

```
$ id site_mysite
uid=10001(site_mysite) gid=10001(site_mysite) groups=10001(site_mysite)

$ ls -la /var/www/sites/mysite/
drwxr-x--- site_mysite site_mysite services/
drwxr-x--- site_mysite site_mysite logs/
drwxr-x--- site_mysite site_mysite data/
drwx------ site_mysite site_mysite tmp/
```

---

## Isolation et sécurité

### Pourquoi un utilisateur par site ?

1. **Isolation des processus** : Un site ne peut pas lire/écrire les fichiers d'un autre
2. **Isolation des ports** : Chaque site a sa plage de ports dédiée
3. **Limitation des privilèges** : Shell `/usr/sbin/nologin`, pas de sudo
4. **Audit** : Traçabilité des actions par utilisateur
5. **Quotas** : Possibilité d'appliquer des quotas disque par utilisateur

### Matrice des permissions

| Action | Admin | User (propriétaire) | User (autre) | Readonly |
|--------|-------|---------------------|--------------|----------|
| Voir statut | ✅ | ✅ | ❌ | ✅ (ses sites) |
| Start/Stop | ✅ | ✅ | ❌ | ❌ |
| Créer service | ✅ | ✅ | ❌ | ❌ |
| Supprimer site | ✅ | ✅ | ❌ | ❌ |
| Voir tous | ✅ | ❌ | ❌ | ❌ |

### Protection systemd

Chaque service utilise les protections systemd :

```ini
# Empêcher l'escalade de privilèges
NoNewPrivileges=true

# Système de fichiers en lecture seule
ProtectSystem=strict
ProtectHome=read-only

# Répertoires accessibles
ReadWritePaths=/var/www/sites/mysite/...

# Isolation du /tmp
PrivateTmp=true

# Limites de ressources
MemoryMax=512M
CPUQuota=50%
```

### Validation des commandes

Les commandes de démarrage sont validées pour éviter l'injection :

```javascript
// Liste blanche de préfixes autorisés
const allowedPrefixes = [
    'npm', 'node', 'yarn',
    'python', 'python3',
    'php', 'ruby', 'go', 'java', 'dotnet'
];

// Patterns interdits
const forbiddenPatterns = [
    /[;&|`$(){}[\]<>\\]/,  // Caractères shell
    /\.\./,                 // Path traversal
    /sudo|su\s/,            // Élévation
    /rm\s+-rf/,             // Suppression
];
```

---

## Gestion systemd

### Pourquoi systemd ?

| Avantage | Description |
|----------|-------------|
| **Standard** | Présent sur toutes les distributions modernes |
| **Supervision** | Redémarrage automatique en cas de crash |
| **Dépendances** | Gestion de l'ordre de démarrage |
| **Ressources** | Limites CPU/mémoire natives (cgroups) |
| **Sécurité** | Isolation des services (sandboxing) |
| **Logs** | Intégration journald |

### Commandes systemctl

```bash
# Statut d'un service
sudo systemctl status twoine-mysite-frontend

# Démarrer
sudo systemctl start twoine-mysite-frontend

# Arrêter
sudo systemctl stop twoine-mysite-frontend

# Redémarrer
sudo systemctl restart twoine-mysite-frontend

# Activer au boot
sudo systemctl enable twoine-mysite-frontend

# Voir les logs
sudo journalctl -u twoine-mysite-frontend -f
```

### Structure d'un fichier unit

```ini
[Unit]
Description=Twoine Service: mysite/frontend
After=network.target

[Service]
Type=simple
User=site_mysite
Group=site_mysite
WorkingDirectory=/var/www/sites/mysite/services/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
EnvironmentFile=-/var/www/sites/mysite/services/frontend/.env

# Sécurité
NoNewPrivileges=true
ProtectSystem=strict

# Ressources
MemoryMax=512M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
```

### Gestion des crashes

```
Service crash
     │
     ▼
systemd détecte (MainPID disparu)
     │
     ▼
Attente RestartSec (5s par défaut)
     │
     ▼
Redémarrage automatique
     │
     ▼
Si > 5 crashes en 60s → Échec définitif
```

---

## API REST

### Endpoints Sites

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/sites` | Liste des sites |
| `POST` | `/api/sites` | Créer un site |
| `GET` | `/api/sites/:id` | Détails d'un site |
| `PATCH` | `/api/sites/:id` | Modifier un site |
| `DELETE` | `/api/sites/:id` | Supprimer un site |
| `POST` | `/api/sites/:id/start` | Démarrer tous les services |
| `POST` | `/api/sites/:id/stop` | Arrêter tous les services |
| `POST` | `/api/sites/:id/restart` | Redémarrer tous les services |

### Endpoints Services

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/sites/:siteId/services` | Liste des services |
| `POST` | `/api/sites/:siteId/services` | Créer un service |
| `GET` | `/api/services/:id` | Détails d'un service |
| `PATCH` | `/api/services/:id` | Modifier un service |
| `DELETE` | `/api/services/:id` | Supprimer un service |
| `POST` | `/api/services/:id/start` | Démarrer |
| `POST` | `/api/services/:id/stop` | Arrêter |
| `POST` | `/api/services/:id/restart` | Redémarrer |
| `GET` | `/api/services/:id/status` | Statut détaillé |
| `GET` | `/api/services/:id/health` | Health check |

### Exemple de création

```bash
# Créer un site
curl -X POST http://localhost:3000/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myapp",
    "displayName": "Mon Application",
    "description": "Application de test"
  }'

# Créer un service
curl -X POST http://localhost:3000/api/sites/$SITE_ID/services \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "frontend",
    "displayName": "Frontend React",
    "type": "node",
    "commands": {
      "install": "npm install",
      "build": "npm run build",
      "start": "npm start"
    },
    "autoStart": true
  }'

# Démarrer le service
curl -X POST http://localhost:3000/api/services/$SERVICE_ID/start \
  -H "Authorization: Bearer $TOKEN"
```

---

## Bonnes pratiques

### Nommage

```
Sites:     [a-z][a-z0-9_-]{2,29}    ex: myapp, blog-2024, app_prod
Services:  [a-z][a-z0-9_-]{1,29}    ex: frontend, api, worker-1
```

### Ports

- Chaque site reçoit une plage de 10 ports
- Premier site : 10000-10009
- Deuxième site : 10010-10019
- etc.

### Variables d'environnement

```env
# Auto-généré par Twoine
NODE_ENV=production
PORT=10001

# Variables du site
DATABASE_URL=mongodb://localhost/myapp

# Variables du service
API_KEY=xxx
```

### Health checks

```javascript
// Endpoint recommandé
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
```

---

## Troubleshooting

### Service qui ne démarre pas

```bash
# 1. Vérifier les logs systemd
sudo journalctl -u twoine-mysite-frontend -n 50

# 2. Vérifier les permissions
ls -la /var/www/sites/mysite/services/frontend/

# 3. Tester manuellement
sudo -u site_mysite bash -c 'cd /var/www/sites/mysite/services/frontend && npm start'

# 4. Vérifier le port
ss -tuln | grep 10001
```

### Conflits de ports

```bash
# Trouver qui utilise un port
sudo ss -tulnp | grep :10001

# Vérifier les ports d'un site
curl -s http://localhost:3000/api/sites/$SITE_ID | jq '.data.portRange'
```

### Service en boucle de crash

```bash
# Voir le nombre de restarts
systemctl show twoine-mysite-frontend --property=NRestarts

# Reset le compteur
sudo systemctl reset-failed twoine-mysite-frontend
```

### Permissions refusées

```bash
# Vérifier le propriétaire
ls -la /var/www/sites/mysite/

# Corriger si nécessaire
sudo chown -R site_mysite:site_mysite /var/www/sites/mysite/

# Vérifier les ACL
getfacl /var/www/sites/mysite/
```

---

## Fichiers de référence

| Fichier | Description |
|---------|-------------|
| `src/models/Site.js` | Modèle Mongoose Site |
| `src/models/Service.js` | Modèle Mongoose Service |
| `src/services/SystemdManager.js` | Gestion systemd |
| `src/services/SiteManager.js` | Gestion sites |
| `src/services/ServiceManager.js` | Gestion services |
| `src/routes/sites.js` | Routes API sites |
| `src/routes/services.js` | Routes API services |
| `lib/site-manager.sh` | Scripts bash |
| `config/templates/systemd-service.template` | Template unit |

---

*Document généré pour Twoine v1.0.0 - Ubuntu 22.04 LTS*
