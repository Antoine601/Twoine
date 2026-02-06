# 🚀 Twoine - Déploiement & Production

## Vue d'ensemble

Ce document décrit la procédure complète de déploiement de Twoine en environnement de production sur Ubuntu 22.04 LTS.

## Prérequis

### Système

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| RAM | 1 GB | 2 GB+ |
| Disque | 5 GB | 20 GB+ |
| CPU | 1 core | 2 cores+ |

### Ports requis

| Port | Service | Obligatoire |
|------|---------|-------------|
| 22 | SSH | Oui |
| 80 | HTTP | Oui |
| 443 | HTTPS | Oui |
| 3000 | API (interne) | Non exposé |
| 4321 | Admin Panel (interne) | Non exposé |
| 5432 | User Panel (interne) | Non exposé |
| 27017 | MongoDB (interne) | Non exposé |

---

## 🧾 Architecture des Services

Twoine utilise plusieurs services systemd pour assurer la résilience et l'isolation :

```
┌─────────────────────────────────────────────────────────────┐
│                        NGINX                                 │
│                    (Reverse Proxy)                          │
│         ┌──────────┬──────────┬──────────┐                 │
│         │  :443    │  :443    │  :443    │                 │
│         │  /api    │  /admin  │  /user   │                 │
└─────────┴────┬─────┴────┬─────┴────┬─────┘                 │
               │          │          │                        │
       ┌───────▼───┐ ┌────▼────┐ ┌───▼─────┐                │
       │twoine-api │ │twoine-  │ │twoine-  │                │
       │  :3000    │ │admin    │ │user     │                │
       │           │ │ :4321   │ │ :5432   │                │
       └───────────┘ └─────────┘ └─────────┘                │
               │                                              │
       ┌───────▼──────────────────────────────┐              │
       │           twoine-worker              │              │
       │     (Tâches asynchrones, cron)       │              │
       └──────────────────────────────────────┘              │
               │                                              │
       ┌───────▼──────────────────────────────┐              │
       │          twoine-supervisor              │              │
       │    (Supervision, health checks)      │              │
       └──────────────────────────────────────┘              │
               │                                              │
       ┌───────▼──────────────────────────────┐              │
       │             MongoDB                   │              │
       │           (mongod.service)            │              │
       └──────────────────────────────────────┘              │
```

### Services Systemd

| Service | Rôle | Port | Utilisateur |
|---------|------|------|-------------|
| `twoine-api.service` | API REST principale | 3000 | twoine |
| `twoine-admin.service` | Panel administrateur | 4321 | twoine |
| `twoine-user.service` | Panel utilisateur | 5432 | twoine |
| `twoine-worker.service` | Tâches de fond | - | twoine |
| `twoine-supervisor.service` | Supervision | - | twoine |

---

## 📋 Procédure de Déploiement Initial

### Étape 1 : Préparation du serveur

```bash
# Connexion SSH au serveur
ssh root@votre-serveur

# Vérification de l'OS
cat /etc/os-release | grep VERSION_ID
# Doit afficher: VERSION_ID="22.04"

# Mise à jour système
apt update && apt upgrade -y

# Vérification des ports disponibles
ss -tlnp | grep -E ':(80|443|3000|27017)'
# Ne devrait rien afficher si les ports sont libres
```

### Étape 2 : Installation

```bash
# Téléchargement de Twoine
git clone https://github.com/Antoine601/Twoine.git /tmp/twoine
cd /tmp/twoine

# Lancement de l'installation
sudo bash install.sh
# Suivre les prompts interactifs

# OU installation silencieuse
sudo bash install.sh -s \
  --admin-password="MotDePasseSecurise123!" \
  --admin-email="admin@example.com" \
  --domain="twoine.example.com"
```

### Étape 3 : Vérification post-installation

```bash
# Vérifier les services
twoine-status

# Vérifier l'accès
curl -k https://localhost/api/health
```

---

## ⚙️ Configuration des Services Systemd

### twoine-api.service

```ini
[Unit]
Description=Twoine API Server
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service
Requires=mongod.service
PartOf=twoine.target

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=/opt/twoine/app
ExecStart=/usr/bin/node src/app.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10
WatchdogSec=30

# Environnement
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=-/opt/twoine/app/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-api

# Sécurité
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=/var/www/twoine /var/log/twoine /opt/twoine/tmp
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Limites
LimitNOFILE=65535
LimitNPROC=4096
MemoryMax=512M
CPUQuota=100%

# Timeouts
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=twoine.target
```

### twoine-worker.service

```ini
[Unit]
Description=Twoine Background Worker
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service twoine-api.service
Requires=mongod.service
PartOf=twoine.target

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=/opt/twoine/app
ExecStart=/usr/bin/node src/worker.js
Restart=always
RestartSec=15

Environment=NODE_ENV=production
EnvironmentFile=-/opt/twoine/app/.env

StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-worker

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=/var/www/twoine /var/log/twoine /opt/twoine/tmp

MemoryMax=256M
CPUQuota=50%

[Install]
WantedBy=twoine.target
```

### twoine-supervisor.service

```ini
[Unit]
Description=Twoine System Monitor
Documentation=https://github.com/Antoine601/Twoine
After=network.target twoine-api.service
PartOf=twoine.target

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=/opt/twoine/app
ExecStart=/usr/bin/node src/monitor.js
Restart=always
RestartSec=30

Environment=NODE_ENV=production
EnvironmentFile=-/opt/twoine/app/.env

StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-supervisor

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only

MemoryMax=128M
CPUQuota=25%

[Install]
WantedBy=twoine.target
```

### twoine.target (Groupe de services)

```ini
[Unit]
Description=Twoine Platform Services
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service nginx.service
Requires=mongod.service
Wants=twoine-api.service twoine-worker.service twoine-supervisor.service

[Install]
WantedBy=multi-user.target
```

---

## 🌐 Configuration Nginx Production

### /etc/nginx/sites-available/twoine-platform

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# Upstreams
upstream twoine_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream twoine_admin {
    server 127.0.0.1:4321;
    keepalive 32;
}

upstream twoine_user {
    server 127.0.0.1:5432;
    keepalive 32;
}

# HTTP → HTTPS Redirect
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# Main HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # SSL
    ssl_certificate /opt/twoine/ssl/twoine.crt;
    ssl_certificate_key /opt/twoine/ssl/twoine.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logging
    access_log /var/log/twoine/nginx/access.log combined buffer=512k flush=1m;
    error_log /var/log/twoine/nginx/error.log warn;

    # Client limits
    client_max_body_size 100M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Connection limits
    limit_conn conn_limit 20;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript;

    # API
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://twoine_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Auth endpoints (stricter rate limit)
    location /api/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://twoine_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin Panel
    location /admin {
        proxy_pass http://twoine_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # User Panel (default)
    location / {
        proxy_pass http://twoine_user;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint (no rate limit)
    location /api/health {
        proxy_pass http://twoine_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        proxy_pass http://twoine_user;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
        return 404;
    }
}
```

---

## 🔐 Sécurité Production

### Checklist de Sécurité

```
[ ] UFW activé avec règles minimales
[ ] SSH sécurisé (clé uniquement, port non-standard optionnel)
[ ] Fail2ban installé et configuré
[ ] Secrets générés aléatoirement (JWT, session)
[ ] Fichiers .env en 600
[ ] Aucun service en root
[ ] MongoDB sans accès externe
[ ] HTTPS forcé
[ ] Headers de sécurité configurés
[ ] Rate limiting actif
[ ] Logs centralisés
[ ] Backups automatiques
```

### Configuration UFW

```bash
# Reset et configuration de base
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Ports autorisés
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Activer
sudo ufw --force enable

# Vérifier
sudo ufw status verbose
```

### Configuration SSH sécurisée

Fichier `/etc/ssh/sshd_config` :

```
# Désactiver l'authentification par mot de passe
PasswordAuthentication no
PermitRootLogin prohibit-password

# Limiter les tentatives
MaxAuthTries 3
MaxSessions 5

# Timeout de connexion
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2

# Désactiver les fonctionnalités inutiles
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no

# Algorithmes modernes uniquement
KexAlgorithms curve25519-sha256@libssh.org,diffie-hellman-group16-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```

### Permissions Linux

```bash
# Répertoires Twoine
chmod 750 /opt/twoine
chmod 700 /opt/twoine/config
chmod 700 /opt/twoine/ssl
chmod 600 /opt/twoine/app/.env

# Répertoires sites
chmod 750 /var/www/twoine
chmod 700 /var/www/twoine/*/services/*/

# Logs
chmod 750 /var/log/twoine
```

---

## ♻️ Mise à jour de Twoine

### Script de mise à jour (twoine-update)

```bash
#!/bin/bash
# /usr/local/bin/twoine-update

set -e

INSTALL_DIR="/opt/twoine"
BACKUP_DIR="/opt/twoine/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "═══════════════════════════════════════════"
echo "  TWOINE UPDATE - $TIMESTAMP"
echo "═══════════════════════════════════════════"

# 1. Créer un backup
echo "[1/6] Creating backup..."
mkdir -p "$BACKUP_DIR"
cp "$INSTALL_DIR/app/.env" "$BACKUP_DIR/.env.$TIMESTAMP"
mongodump --db twoine --out "$BACKUP_DIR/db_$TIMESTAMP" --quiet

# 2. Arrêter les services
echo "[2/6] Stopping services..."
twoine-stop

# 3. Récupérer les mises à jour
echo "[3/6] Fetching updates..."
cd "$INSTALL_DIR/app"
git fetch origin
git reset --hard origin/main

# 4. Installer les dépendances
echo "[4/6] Installing dependencies..."
npm install --production

# 5. Exécuter les migrations (si présentes)
echo "[5/6] Running migrations..."
if [ -f "scripts/migrate.js" ]; then
    node scripts/migrate.js || true
fi

# 6. Redémarrer les services
echo "[6/6] Starting services..."
twoine-start

# Vérification
sleep 3
if twoine-status --quiet; then
    echo ""
    echo "✓ Update completed successfully!"
    echo "  Backup saved: $BACKUP_DIR"
else
    echo ""
    echo "✗ Services may have issues. Check: twoine-status"
    echo "  To rollback: twoine-rollback $TIMESTAMP"
fi
```

### Script de rollback

```bash
#!/bin/bash
# /usr/local/bin/twoine-rollback

BACKUP_DIR="/opt/twoine/backups"
TIMESTAMP="$1"

if [ -z "$TIMESTAMP" ]; then
    echo "Usage: twoine-rollback <timestamp>"
    echo "Available backups:"
    ls -1 "$BACKUP_DIR" | grep -E "^db_" | sed 's/db_//'
    exit 1
fi

echo "Rolling back to $TIMESTAMP..."

# Arrêter les services
twoine-stop

# Restaurer .env
if [ -f "$BACKUP_DIR/.env.$TIMESTAMP" ]; then
    cp "$BACKUP_DIR/.env.$TIMESTAMP" /opt/twoine/app/.env
fi

# Restaurer la base de données
if [ -d "$BACKUP_DIR/db_$TIMESTAMP" ]; then
    mongorestore --db twoine --drop "$BACKUP_DIR/db_$TIMESTAMP/twoine" --quiet
fi

# Redémarrer
twoine-start

echo "✓ Rollback completed"
```

---

## 📊 Validation Production

### Script de validation (twoine-validate)

```bash
#!/bin/bash
# Vérifie que tous les composants fonctionnent correctement

ERRORS=0

check() {
    local name="$1"
    local cmd="$2"
    
    if eval "$cmd" >/dev/null 2>&1; then
        echo "  ✓ $name"
    else
        echo "  ✗ $name"
        ((ERRORS++))
    fi
}

echo "═══════════════════════════════════════════"
echo "  TWOINE PRODUCTION VALIDATION"
echo "═══════════════════════════════════════════"
echo ""

echo "Services:"
check "twoine-api" "systemctl is-active --quiet twoine-api"
check "twoine-worker" "systemctl is-active --quiet twoine-worker"
check "twoine-supervisor" "systemctl is-active --quiet twoine-supervisor"
check "nginx" "systemctl is-active --quiet nginx"
check "mongod" "systemctl is-active --quiet mongod"
echo ""

echo "Connectivity:"
check "API responds" "curl -sf http://localhost:3000/api/health"
check "HTTPS works" "curl -sfk https://localhost/api/health"
check "MongoDB connected" "mongosh --quiet --eval 'db.runCommand({ping:1})'"
echo ""

echo "Permissions:"
check "/opt/twoine owner" "[ \$(stat -c '%U' /opt/twoine) = 'twoine' ]"
check ".env permissions" "[ \$(stat -c '%a' /opt/twoine/app/.env) = '600' ]"
check "SSL key permissions" "[ \$(stat -c '%a' /opt/twoine/ssl/twoine.key) = '600' ]"
echo ""

echo "Security:"
check "UFW active" "ufw status | grep -q 'Status: active'"
check "No root services" "! pgrep -u root -f 'twoine'"
echo ""

echo "Ports:"
check "Port 80 listening" "ss -tlnp | grep -q ':80 '"
check "Port 443 listening" "ss -tlnp | grep -q ':443 '"
check "Port 3000 internal" "ss -tlnp | grep -q '127.0.0.1:3000'"
echo ""

echo "═══════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "  ✓ All checks passed!"
    exit 0
else
    echo "  ✗ $ERRORS check(s) failed"
    exit 1
fi
```

---

## 🔧 Commandes de Gestion

| Commande | Description |
|----------|-------------|
| `twoine-start` | Démarrer tous les services |
| `twoine-stop` | Arrêter tous les services |
| `twoine-stop` + `twoine-start` | Redémarrage complet des services |
| `twoine-status` | Afficher l'état des services |
| `twoine-update` | Mettre à jour Twoine |
| `twoine-rollback` | Restaurer une version précédente |
| `twoine-validate` | Valider la configuration production |
| `twoine-logs` | Afficher les logs |
| `twoine-backup` | Créer un backup manuel |

---

## 📝 Maintenance

### Logs

```bash
# Logs temps réel de tous les services
journalctl -u 'twoine-*' -f

# Logs d'un service spécifique
journalctl -u twoine-api -n 100

# Logs Nginx
tail -f /var/log/twoine/nginx/access.log
tail -f /var/log/twoine/nginx/error.log
```

### Rotation des logs

Fichier `/etc/logrotate.d/twoine` :

```
/var/log/twoine/*/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 twoine twoine
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}
```

### Backups automatiques

Cron `/etc/cron.d/twoine-backup` :

```cron
# Backup quotidien à 3h du matin
0 3 * * * twoine /usr/local/bin/twoine-backup --quiet

# Nettoyage des vieux backups (>30 jours)
0 4 * * 0 twoine find /opt/twoine/backups -mtime +30 -delete
```

---

## ⚠️ Gestion des Pannes

### Redémarrage automatique

Les services sont configurés avec `Restart=always` et `RestartSec=10` pour redémarrer automatiquement en cas de crash.

### Détection des problèmes

```bash
# Vérifier les échecs récents
systemctl list-units --failed | grep twoine

# Voir les dernières erreurs
journalctl -u twoine-api --since "1 hour ago" -p err

# Vérifier l'utilisation des ressources
systemctl status twoine-api --no-pager
```

### Isolation d'un site défaillant

Si un site utilisateur cause des problèmes :

```bash
# Arrêter les services du site
systemctl stop twoine-sitename-*

# Désactiver le site dans Nginx
twoine-service disable sitename

# Vérifier les logs du site
journalctl -u 'twoine-sitename-*' -n 50
```

---

## 📚 Limites & Considérations

1. **Mono-serveur** : Cette configuration est pour un serveur unique
2. **Pas de haute disponibilité** : En cas de panne serveur, le service est interrompu
3. **Backups locaux** : Les backups sont sur le même serveur (configurer une copie externe)
4. **Certificats auto-signés** : Configurer Let's Encrypt pour la production réelle
5. **MongoDB local** : Pas de réplication, prévoir des backups réguliers

---

## 🆘 Support

En cas de problème :

1. Consulter les logs : `twoine-logs`
2. Valider la configuration : `sudo twoine-validate`
3. Redémarrer les services : `twoine-stop && twoine-start`
4. Consulter la documentation dans `/opt/twoine/docs/`
