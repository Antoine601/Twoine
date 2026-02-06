# Twoine - Sécurité : Sites et Services

## Vue d'ensemble de la sécurité

Ce document détaille les mesures de sécurité implémentées pour l'isolation et la protection des sites et services hébergés sur Twoine.

---

## 1. Isolation par utilisateur Linux

### Principe

Chaque site s'exécute sous un utilisateur Linux dédié, garantissant une isolation au niveau du système d'exploitation.

```
Site "myapp" → Utilisateur "site_myapp"
Site "blog"  → Utilisateur "site_blog"
```

### Caractéristiques de l'utilisateur

| Propriété | Valeur | Raison |
|-----------|--------|--------|
| Type | Système (`--system`) | Pas de home classique, pas dans /home |
| Shell | `/usr/sbin/nologin` | Empêche la connexion interactive |
| UID | 10000-19999 | Plage dédiée, évite les conflits |
| Home | `/var/www/sites/<nom>` | Données dans le répertoire du site |

### Création sécurisée

```bash
useradd \
    --system \
    --uid $UID \
    --gid $UID \
    --home-dir /var/www/sites/myapp \
    --shell /usr/sbin/nologin \
    --comment "Twoine Site: myapp" \
    site_myapp
```

---

## 2. Isolation des fichiers

### Permissions des répertoires

```
/var/www/sites/myapp/
├── services/     750  site_myapp:site_myapp
├── logs/         750  site_myapp:site_myapp
├── data/         750  site_myapp:site_myapp
└── tmp/          700  site_myapp:site_myapp
```

### ACL pour Twoine

Pour permettre à Twoine de lire les fichiers sans être propriétaire :

```bash
setfacl -R -m u:twoine:rx /var/www/sites/myapp
setfacl -R -d -m u:twoine:rx /var/www/sites/myapp
```

### Ce qu'un site NE PEUT PAS faire

- ❌ Lire les fichiers d'un autre site
- ❌ Écrire en dehors de son répertoire
- ❌ Accéder aux fichiers système
- ❌ Voir les processus des autres sites (avec hidepid)

---

## 3. Isolation des ports

### Attribution des ports

Chaque site reçoit une plage de 10 ports :

| Site | Plage de ports |
|------|----------------|
| Site 1 | 10000-10009 |
| Site 2 | 10010-10019 |
| Site 3 | 10020-10029 |

### Vérification

```javascript
// Vérifier qu'un port appartient bien au site
async isPortAvailable(port) {
    if (port < this.portRange.start || port > this.portRange.end) {
        return false; // Port hors plage
    }
    // Vérifier qu'il n'est pas déjà utilisé
    const existing = await Service.findOne({ site: this._id, port });
    return !existing;
}
```

### Binding local uniquement

Les services écoutent sur `127.0.0.1` par défaut :

```ini
Environment=HOST=127.0.0.1
```

Seul Nginx expose les services vers l'extérieur.

---

## 4. Protection systemd

### Directives de sécurité

```ini
[Service]
# Empêcher l'acquisition de nouveaux privilèges
NoNewPrivileges=true

# Système de fichiers en lecture seule
ProtectSystem=strict
ProtectHome=read-only

# Exceptions pour les répertoires du site
ReadWritePaths=/var/www/sites/myapp/...

# /tmp privé et isolé
PrivateTmp=true

# Protéger le kernel
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true

# Supprimer toutes les capabilities
CapabilityBoundingSet=
AmbientCapabilities=
```

### Limites de ressources

```ini
# Mémoire
MemoryMax=512M
MemoryHigh=512M

# CPU
CPUQuota=50%

# Fichiers
LimitNOFILE=65535

# Processus
LimitNPROC=4096
```

---

## 5. Validation des commandes

### Liste blanche

Seules certaines commandes sont autorisées comme préfixe :

```javascript
const allowedPrefixes = [
    'npm', 'node', 'yarn', 'pnpm',
    'python', 'python3',
    'php', 'php-fpm',
    'ruby', 'bundle',
    'go', 'cargo',
    'java', 'dotnet',
    './start', './run', './app',
];
```

### Patterns interdits

```javascript
const forbiddenPatterns = [
    /[;&|`$(){}[\]<>\\]/,  // Caractères shell dangereux
    /\.\./,                 // Path traversal
    /\/etc\//,              // Accès système
    /\/root/,               // Accès root
    /sudo|su\s/,            // Élévation de privilèges
    /chmod|chown/,          // Modification permissions
    /rm\s+-rf/,             // Suppression récursive
    /wget|curl.*\|/,        // Download and execute
];
```

### Exemple de validation

```javascript
validateStartCommand('npm start');           // ✅ OK
validateStartCommand('node server.js');      // ✅ OK
validateStartCommand('python app.py');       // ✅ OK
validateStartCommand('rm -rf /');            // ❌ REJETÉ
validateStartCommand('cat /etc/passwd');     // ❌ REJETÉ
validateStartCommand('npm start; whoami');   // ❌ REJETÉ (;)
validateStartCommand('$(whoami)');           // ❌ REJETÉ ($)
```

---

## 6. Contrôle d'accès API

### Authentification JWT

```javascript
// Middleware d'authentification
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
```

### Autorisation par rôle

| Rôle | Sites accessibles | Actions |
|------|-------------------|---------|
| `admin` | Tous | Toutes |
| `user` | Ses propres sites | CRUD complet |
| `readonly` | Ses propres sites | Lecture seule |

### Vérification de propriété

```javascript
// Vérifier que l'utilisateur est propriétaire du site
if (req.user.role !== 'admin' && 
    site.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Access denied' });
}
```

---

## 7. Configuration sudo

### Principe du moindre privilège

Le fichier `/etc/sudoers.d/twoine-sites` limite strictement les commandes root autorisées :

```
# Uniquement les commandes spécifiques
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl start twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl stop twoine-*
# ...

# JAMAIS de shell root
# twoine ALL=(root) NOPASSWD: /bin/bash  # INTERDIT
```

### Commandes autorisées

- ✅ Création/suppression d'utilisateurs `site_*`
- ✅ Gestion des services `twoine-*`
- ✅ Création de répertoires dans `/var/www/sites/`
- ❌ Accès shell root
- ❌ Modification de fichiers système
- ❌ Installation de paquets

---

## 8. Protection contre les attaques courantes

### Path Traversal

```javascript
// Vérification du chemin
if (!basePath.startsWith(SITES_DIR)) {
    throw new Error('Security: Invalid path');
}
```

### Injection de commandes

```javascript
// Validation stricte des noms
const pattern = /^[a-z][a-z0-9_-]{2,29}$/;
if (!pattern.test(siteName)) {
    throw new Error('Invalid site name');
}
```

### Déni de service

- Limites de ressources systemd (CPU, RAM)
- Rate limiting API
- Quotas disque par utilisateur (optionnel)

### Écoute non autorisée

- Services écoutent uniquement sur 127.0.0.1
- Ports attribués par plage, vérifiés à la création

---

## 9. Audit et traçabilité

### Logs systemd

```bash
# Logs d'un service
sudo journalctl -u twoine-myapp-frontend

# Logs de tous les services Twoine
sudo journalctl -u 'twoine-*'
```

### Logs applicatifs

```
/var/www/sites/myapp/logs/
├── frontend.log
├── frontend-error.log
├── backend.log
└── backend-error.log
```

### Audit des actions

Chaque action importante est loguée avec :
- Timestamp
- Utilisateur
- Action
- Résultat

---

## 10. Recommandations de production

### Checklist de sécurité

- [ ] Changer `JWT_SECRET` en production
- [ ] Activer HTTPS sur Nginx
- [ ] Configurer le firewall (ufw)
- [ ] Activer `hidepid=2` sur /proc
- [ ] Configurer les quotas disque
- [ ] Mettre en place la rotation des logs
- [ ] Configurer fail2ban pour l'API
- [ ] Auditer régulièrement les permissions

### Configuration firewall recommandée

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Rotation des logs

```
/var/www/sites/*/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 root adm
    sharedscripts
}
```

---

## Résumé des couches de sécurité

```
┌────────────────────────────────────────────────────────────┐
│                    INTERNET                                 │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  NGINX - SSL/TLS, Rate Limiting, WAF (optionnel)           │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  API TWOINE - JWT Auth, RBAC, Validation                   │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  SYSTEMD - Sandboxing, Resource Limits, Process Isolation  │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  LINUX - User Isolation, File Permissions, ACL             │
└────────────────────────────────────────────────────────────┘
```

---

*Document de sécurité Twoine v1.0.0*
