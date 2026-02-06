# TWOINE - Gestion des Domaines & Certificats

## Vue d'ensemble

Twoine permet de gérer les domaines des sites hébergés sur le serveur avec :
- Génération automatique de certificats SSL auto-signés
- Configuration automatique de Nginx comme reverse proxy
- Gestion des rôles et permissions
- Instructions DNS pour les utilisateurs

## Schéma Logique

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ARCHITECTURE DOMAINES                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Domain    │──────▶│    Site     │──────▶│   Service   │
│             │  N:1  │             │  1:N  │             │
│ - domain    │       │ - name      │       │ - name      │
│ - type      │       │ - owner     │       │ - port ◀────┼── targetPort
│ - ssl       │       │ - paths     │       │ - type      │
│ - nginx     │       │             │       │             │
└──────┬──────┘       └─────────────┘       └─────────────┘
       │
       │ 1:1
       ▼
┌─────────────┐
│ Certificate │
│             │
│ - cert.pem  │
│ - key.pem   │
│ /etc/twoine/│
│ certs/<dom>/│
└──────┬──────┘
       │
       │ 1:1
       ▼
┌─────────────┐
│Nginx Config │
│             │
│ sites-avail │
│ sites-enabl │
│ <domain>.   │
│     conf    │
└─────────────┘
```

## Types de Domaines

### 1. Domaine Plateforme (`type: 'platform'`)
- Domaine unique pour l'interface Twoine (admin + user)
- Exemple : `twoine.example.com`
- Configuré à l'installation
- Ne peut pas être supprimé sans `--force`

### 2. Domaines Sites (`type: 'site'`)
- Domaines des sites utilisateurs
- Exemples : `site1.com`, `api.site1.com`, `site2.net`
- Indépendants du domaine plateforme
- Un domaine = un seul site à la fois

## Structure des Fichiers

```
/etc/twoine/
└── certs/
    ├── example.com/
    │   ├── cert.pem          # Certificat auto-signé
    │   └── key.pem           # Clé privée (chmod 600)
    └── api.example.com/
        ├── cert.pem
        └── key.pem

/etc/nginx/
├── sites-available/
│   ├── example.com.conf      # Configuration Nginx
│   └── api.example.com.conf
└── sites-enabled/
    ├── example.com.conf      # Lien symbolique → sites-available
    └── api.example.com.conf
```

## API REST

### Admin - Gestion globale

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/domains` | Liste tous les domaines |
| POST | `/api/admin/domains` | Ajoute un domaine |
| GET | `/api/admin/domains/:id` | Détails d'un domaine |
| DELETE | `/api/admin/domains/:id` | Supprime un domaine |
| POST | `/api/admin/domains/:id/assign` | Assigne à un site/service |
| POST | `/api/admin/domains/:id/unassign` | Désassigne |
| POST | `/api/admin/domains/:id/regenerate-cert` | Régénère le certificat |
| POST | `/api/admin/domains/reload-nginx` | Recharge Nginx |
| POST | `/api/admin/domains/cleanup` | Nettoie les orphelins |
| GET | `/api/admin/domains/platform` | Domaine plateforme |
| POST | `/api/admin/domains/platform` | Configure le domaine plateforme |
| PUT | `/api/admin/domains/platform` | Met à jour le domaine plateforme |

### Sites - Domaines par site

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites/:siteId/domains` | Liste les domaines du site |
| POST | `/api/sites/:siteId/domains` | Ajoute un domaine au site |
| GET | `/api/sites/:siteId/domains/:id` | Détails |
| DELETE | `/api/sites/:siteId/domains/:id` | Supprime |
| PATCH | `/api/sites/:siteId/domains/:id` | Met à jour l'assignation |
| GET | `/api/sites/:siteId/domains/:id/dns` | Instructions DNS |

### Utilisateur

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/me/domains` | Mes domaines (tous mes sites) |
| POST | `/api/domains/validate` | Valide un nom de domaine |

## Exemples d'utilisation

### Ajouter un domaine avec SSL

```bash
curl -X POST http://localhost:3000/api/admin/domains \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "siteId": "64abc123...",
    "serviceId": "64def456...",
    "enableSsl": true
  }'
```

Réponse :
```json
{
  "success": true,
  "message": "Domain added successfully",
  "domain": {
    "_id": "64xyz789...",
    "domain": "example.com",
    "type": "site",
    "ssl": {
      "enabled": true,
      "type": "self-signed",
      "certPath": "/etc/twoine/certs/example.com/cert.pem",
      "keyPath": "/etc/twoine/certs/example.com/key.pem"
    },
    "status": "active"
  },
  "dns": {
    "domain": "example.com",
    "serverIp": "82.65.108.219",
    "records": [
      {
        "type": "A",
        "name": "example.com",
        "value": "82.65.108.219",
        "example": "example.com     A     82.65.108.219"
      }
    ],
    "instructions": "Pour faire pointer votre domaine vers ce serveur..."
  }
}
```

### Valider un domaine

```bash
curl -X POST http://localhost:3000/api/domains/validate \
  -H "Content-Type: application/json" \
  -d '{"domain": "mon-site.com"}'
```

Réponse :
```json
{
  "success": true,
  "valid": true,
  "available": true,
  "normalized": "mon-site.com"
}
```

## Rôles & Permissions

| Action | Admin | User | Readonly |
|--------|-------|------|----------|
| Voir tous les domaines | ✅ | ❌ | ❌ |
| Voir domaines de ses sites | ✅ | ✅ | ✅ |
| Ajouter domaine | ✅ | ✅ (ses sites) | ❌ |
| Supprimer domaine | ✅ | ✅ (ses sites) | ❌ |
| Assigner/désassigner | ✅ | ✅ (ses sites) | ❌ |
| Régénérer certificat | ✅ | ❌ | ❌ |
| Recharger Nginx | ✅ | ❌ | ❌ |
| Gérer domaine plateforme | ✅ | ❌ | ❌ |

## Scripts Bash

### domain-manager.sh (wrapper principal)

```bash
# Ajouter un domaine avec SSL
./scripts/domain-manager.sh add example.com 3000 --ssl

# Supprimer un domaine
./scripts/domain-manager.sh remove example.com

# Voir le statut
./scripts/domain-manager.sh status example.com

# Lister tous les domaines
./scripts/domain-manager.sh list

# Recharger Nginx
./scripts/domain-manager.sh reload
```

### Scripts individuels

| Script | Description |
|--------|-------------|
| `domain-cert-generate.sh` | Génère un certificat auto-signé |
| `domain-nginx-config.sh` | Crée la configuration Nginx |
| `domain-enable.sh` | Active un site (lien symbolique) |
| `domain-disable.sh` | Désactive un site |
| `domain-remove.sh` | Supprime complètement un domaine |

## Configuration Nginx Générée

### Avec SSL (HTTPS)

```nginx
# Redirection HTTP vers HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

# Serveur HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/twoine/certs/example.com/cert.pem;
    ssl_certificate_key /etc/twoine/certs/example.com/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:...;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Sécurité

### Validation des domaines

Les caractères suivants sont **interdits** :
- `;` (point-virgule) - injection de commandes
- `|` (pipe) - injection de commandes
- `..` (double point) - path traversal
- Espaces

Regex de validation :
```regex
^(?!.*\.\.)(?!.*\s)(?!.*;)(?!.*\|)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$
```

### Protection Nginx

- Headers de sécurité (X-Frame-Options, X-Content-Type-Options, HSTS)
- Protocoles SSL modernes (TLS 1.2+)
- Cipher suites recommandées
- Accès aux fichiers cachés bloqué

### Permissions fichiers

```
/etc/twoine/certs/<domain>/
├── cert.pem  (644 - lecture publique)
└── key.pem   (600 - lecture root uniquement)
```

## Cas d'erreur gérés

| Cas | Comportement |
|-----|--------------|
| Domaine déjà existant | Erreur 400 "Domain already registered" |
| Site supprimé | Domaines automatiquement nettoyés |
| Service supprimé | Domaine marqué en erreur, service NULL |
| Certificat invalide | Rollback automatique |
| Nginx config invalide | Rollback + backup restauré |
| Nginx reload échoue | Rollback du lien symbolique |

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CERTS_DIR` | `/etc/twoine/certs` | Répertoire des certificats |
| `NGINX_SITES_AVAILABLE` | `/etc/nginx/sites-available` | Configs Nginx disponibles |
| `NGINX_SITES_ENABLED` | `/etc/nginx/sites-enabled` | Configs Nginx activées |
| `SERVER_IP` | `127.0.0.1` | IP du serveur pour DNS |
| `SERVER_IPV6` | `null` | IPv6 du serveur (optionnel) |
| `TWOINE_CERT_VALIDITY` | `365` | Validité certificat en jours |
| `TWOINE_KEY_SIZE` | `2048` | Taille clé RSA |

## DNS (hors serveur)

Twoine **ne gère pas** le DNS automatiquement. L'utilisateur doit configurer les enregistrements chez son registrar :

```
example.com         A     82.65.108.219
api.example.com     A     82.65.108.219
```

Si IPv6 disponible :
```
example.com         AAAA  2001:db8::1
```

## Limitations

- **Certificats auto-signés uniquement** (pas de Let's Encrypt)
- **Pas de wildcard** (*.example.com)
- **Mono-serveur** (pas de load balancing)
- **Un domaine = un site** (pas de multi-site par domaine)
