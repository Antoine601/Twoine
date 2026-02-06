# Twoine - Guide d'Installation

## Prérequis

### Système requis
- **OS**: Ubuntu 22.04 LTS (serveur vierge recommandé)
- **RAM**: Minimum 1 GB (2 GB recommandé)
- **Disque**: Minimum 5 GB libres
- **Accès**: Root (sudo)
- **Réseau**: Connexion internet active

### Ports utilisés
| Port | Service | Description |
|------|---------|-------------|
| 22 | SSH | Accès distant |
| 80 | HTTP | Redirection vers HTTPS |
| 443 | HTTPS | Interface Twoine |
| 3000 | Node.js | Backend (localhost uniquement) |
| 27017 | MongoDB | Base de données (localhost uniquement) |

---

## Installation Rapide

```bash
# Télécharger le script
curl -fsSL https://raw.githubusercontent.com/Antoine601/Twoine/main/install.sh -o install.sh

# Rendre exécutable
chmod +x install.sh

# Lancer l'installation (en root)
sudo ./install.sh
```

### Commandes de base après installation

```bash
# Vérifier l'état global
sudo twoine-status

# Démarrer / arrêter la plateforme
sudo twoine-start
sudo twoine-stop

# Vérifier la configuration
sudo twoine-validate
```

---

## Modes d'Installation

### Mode Interactif (par défaut)
```bash
sudo ./install.sh
```
Le script posera les questions nécessaires :
- Mot de passe admin
- Email admin
- Domaine (optionnel)
- Répertoire des sites

### Mode Silencieux
```bash
sudo ./install.sh --silent \
  --admin-password="MonMotDePasse123" \
  --admin-email="admin@mondomaine.com" \
  --domain="twoine.mondomaine.com" \
  --sites-dir="/var/www/twoine"
```

### Mode Debug
```bash
sudo ./install.sh --debug
```
Affiche des informations détaillées sur chaque étape.

### Mode Dry-Run
```bash
sudo ./install.sh --dry-run
```
Simule l'installation sans effectuer de modifications.

---

## Étapes de l'Installation

### 1. Vérifications Système
- Vérifie que l'OS est Ubuntu 22.04
- Vérifie les privilèges root
- Vérifie l'absence d'installation existante
- Vérifie la connexion internet
- Vérifie l'espace disque (≥5 GB)
- Vérifie la RAM (≥1 GB)

### 2. Configuration Interactive
- Demande le mot de passe admin (min. 8 caractères)
- Demande l'email admin
- Demande le domaine (optionnel)
- Demande le répertoire des sites

### 3. Installation des Dépendances
Paquets installés automatiquement :
- `curl`, `wget`, `git`
- `nginx`
- `nodejs` (v20 LTS)
- `mongodb` (v7.0)
- `openssh-server`
- `ufw`
- `openssl`
- `build-essential`

### 4. Création de la Structure
```
/opt/twoine/              # Installation principale
├── app/                  # Code source
├── config/               # Configuration (permissions 700)
├── ssl/                  # Certificats SSL
└── tmp/                  # Fichiers temporaires

/var/www/twoine/          # Répertoire des sites hébergés

/var/log/twoine/          # Logs
├── app/                  # Logs application
└── nginx/                # Logs nginx
```

### 5. Installation Applicative
- Clone le dépôt Twoine
- Installe les dépendances Node.js
- Génère le fichier `.env`
- Configure les secrets JWT
- Hash le mot de passe admin

### 6. Services Systemd
Crée et démarre les services `twoine-api`, `twoine-admin`, `twoine-user`, `twoine-worker` et `twoine-supervisor` :
- Démarrage automatique au boot
- Redémarrage automatique en cas de crash
- Logs via journalctl

### 7. Configuration Nginx
- Reverse proxy vers le backend
- Redirection HTTP → HTTPS
- Certificat SSL auto-signé
- Headers de sécurité
- Rate limiting

### 8. Configuration Firewall
UFW configuré avec :
- SSH (port 22)
- HTTP (port 80)
- HTTPS (port 443)

---

## Structure Finale

### Arborescence
```
/opt/twoine/
├── app/
│   ├── src/
│   │   └── server.js
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── .env
├── config/
│   └── .mongo_password
├── ssl/
│   ├── twoine.crt
│   └── twoine.key
└── tmp/

/var/www/twoine/
└── (sites hébergés)

/var/log/twoine/
├── app/
│   ├── twoine.log
│   └── twoine-error.log
└── nginx/
    ├── access.log
    └── error.log

/etc/systemd/system/
├── twoine-api.service
├── twoine-admin.service
├── twoine-user.service
├── twoine-worker.service
├── twoine-supervisor.service
└── twoine.target

/etc/nginx/sites-available/
└── twoine-platform

/usr/local/bin/
├── twoine-start
├── twoine-stop
├── twoine-status
├── twoine-update
└── twoine-validate
```

### Utilisateurs Système
| Utilisateur | Description |
|-------------|-------------|
| `twoine` | Utilisateur système principal |
| `www-data` | Groupe Nginx (twoine membre) |

### Services Actifs
| Service | Description | Commande |
|---------|-------------|----------|
| `twoine-api` | API backend | `systemctl status twoine-api` |
| `twoine-admin` | Interface admin | `systemctl status twoine-admin` |
| `twoine-user` | Interface utilisateur | `systemctl status twoine-user` |
| `twoine-worker` | Tâches de fond | `systemctl status twoine-worker` |
| `twoine-supervisor` | Supervision | `systemctl status twoine-supervisor` |
| `nginx` | Reverse proxy | `systemctl status nginx` |
| `mongod` | Base de données | `systemctl status mongod` |

---

## Sécurité

### Mesures Appliquées

1. **Isolation Utilisateur**
   - Utilisateur système dédié `twoine`
   - Permissions strictes sur les répertoires
   - Pas d'accès shell standard

2. **Secrets Sécurisés**
   - JWT secret généré aléatoirement (64 chars)
   - Mot de passe admin hashé (bcrypt, cost 12)
   - Credentials MongoDB non exposés

3. **Configuration Réseau**
   - Backend sur localhost uniquement
   - MongoDB sur localhost uniquement
   - Seuls SSH, HTTP, HTTPS exposés

4. **Protection Nginx**
   - Headers de sécurité (X-Frame-Options, etc.)
   - Rate limiting sur l'API
   - SSL/TLS moderne (TLSv1.2+)

5. **Systemd Hardening**
   - `NoNewPrivileges=true`
   - `ProtectSystem=strict`
   - `ProtectHome=read-only`

### Fichier .env
```
/opt/twoine/app/.env
├── Permissions: 600 (lecture seule par twoine)
├── Contient: JWT_SECRET, MongoDB URI, etc.
└── NE JAMAIS exposer ce fichier
```

---

## Commandes Utiles

### Gestion du Service
```bash
# Statut
systemctl status twoine

# Redémarrer
systemctl restart twoine

# Arrêter
systemctl stop twoine

# Logs en temps réel
journalctl -u twoine -f

# Logs complets
journalctl -u twoine --since "1 hour ago"
```

### Mise à Jour
```bash
# Mise à jour simple
twoine-update

# Ou manuellement
cd /opt/twoine/app
git pull
npm install --production
systemctl restart twoine
```

### Nginx
```bash
# Tester la configuration
nginx -t

# Recharger
systemctl reload nginx

# Logs
tail -f /var/log/twoine/nginx/access.log
```

### MongoDB
```bash
# Statut
systemctl status mongod

# Console
mongosh twoine
```

---

## Dépannage

### L'installation échoue
```bash
# Vérifier les logs
./install.sh --debug 2>&1 | tee install.log

# Vérifier l'espace disque
df -h

# Vérifier la mémoire
free -m
```

### Twoine ne démarre pas
```bash
# Vérifier le statut
systemctl status twoine

# Vérifier les logs
journalctl -u twoine -n 100

# Vérifier MongoDB
systemctl status mongod
```

### Erreur 502 Bad Gateway
```bash
# Twoine n'est pas démarré
systemctl start twoine

# Vérifier le port
ss -tlnp | grep 3000
```

### Certificat SSL invalide
Le certificat auto-signé génère un avertissement navigateur.
Configurer Let's Encrypt via l'interface admin pour un certificat valide.

---

## Risques & Avertissements

### ⚠️ Certificat Auto-Signé
L'installation génère un certificat auto-signé.
Pour la production, configurez Let's Encrypt via l'interface admin.

### ⚠️ Serveur Vierge Recommandé
L'installation peut entrer en conflit avec des services existants.
Utilisez un serveur vierge ou `--force` avec précaution.

### ⚠️ Mot de Passe Admin
Choisissez un mot de passe fort.
Il est hashé mais reste la clé d'accès principal.

### ⚠️ Backups
Twoine ne gère pas les backups automatiques.
Configurez vos propres sauvegardes (rsync, Borg, etc.).

---

## Désinstallation

```bash
# Arrêter les services
systemctl stop twoine-api twoine-admin twoine-user twoine-worker twoine-supervisor
systemctl disable twoine-api twoine-admin twoine-user twoine-worker twoine-supervisor twoine.target

# Supprimer les fichiers
rm -rf /opt/twoine
rm -rf /var/www/twoine
rm -rf /var/log/twoine
rm /etc/systemd/system/twoine-api.service
rm /etc/systemd/system/twoine-admin.service
rm /etc/systemd/system/twoine-user.service
rm /etc/systemd/system/twoine-worker.service
rm /etc/systemd/system/twoine-supervisor.service
rm /etc/systemd/system/twoine.target
rm /etc/nginx/sites-available/twoine-platform
rm /etc/nginx/sites-enabled/twoine-platform
rm /usr/local/bin/twoine-start
rm /usr/local/bin/twoine-stop
rm /usr/local/bin/twoine-status
rm /usr/local/bin/twoine-update
rm /usr/local/bin/twoine-validate

# Supprimer l'utilisateur
userdel -r twoine

# Recharger systemd
systemctl daemon-reload

# Optionnel: désinstaller MongoDB, Node.js, etc.
```

---

## Support

- **Documentation**: https://twoine.io/docs
- **GitHub**: https://github.com/Antoine601/Twoine
- **Issues**: https://github.com/Antoine601/Twoine/issues
