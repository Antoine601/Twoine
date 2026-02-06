# TWOINE - Gestion des Fichiers (SFTP + Explorateur Web)

## Vue d'ensemble

Ce module fournit un système complet de gestion des fichiers pour Twoine :
- **SFTP réel** via OpenSSH avec chroot par site
- **Explorateur web intégré** avec API REST sécurisée
- **Isolation stricte** entre sites
- **Contrôle d'accès** basé sur les rôles (admin/user/readonly)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TWOINE API                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  FileManager    │  │   SftpManager    │  │  Routes/files  │  │
│  │  (Node.js)      │  │   (Node.js)      │  │  (Express)     │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘  │
│           │                    │                     │           │
│           ▼                    ▼                     ▼           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Validation des chemins & Sécurité              ││
│  │         (Path traversal prevention, symlink check)          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SYSTÈME DE FICHIERS                          │
│                                                                  │
│  /var/www/sites/                                                 │
│  ├── site_monsite/          ← Chroot SFTP pour user site_monsite│
│  │   ├── services/          ← Code des services                 │
│  │   ├── data/              ← Données persistantes              │
│  │   ├── uploads/           ← Fichiers uploadés                 │
│  │   ├── logs/              ← Logs applicatifs                  │
│  │   └── tmp/               ← Fichiers temporaires              │
│  └── site_autresite/                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OpenSSH SFTP                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Match Group sftpusers                                      ││
│  │    ForceCommand internal-sftp                               ││
│  │    ChrootDirectory /var/www/sites/%u                        ││
│  │    PermitTTY no                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Structure des fichiers par site

```
/var/www/sites/site_example/
├── services/           # Code source des services (Node.js, Python, etc.)
│   ├── api/
│   └── frontend/
├── data/               # Données persistantes (SQLite, fichiers JSON, etc.)
├── uploads/            # Fichiers uploadés par les utilisateurs du site
├── logs/               # Logs applicatifs
└── tmp/                # Fichiers temporaires (nettoyé périodiquement)
```

### Permissions

| Répertoire | Propriétaire | Permissions | Description |
|------------|--------------|-------------|-------------|
| `/var/www/sites/site_X/` | `root:root` | `755` | Requis pour chroot SSH |
| `services/` | `site_X:sftpusers` | `755` | Code des services |
| `data/` | `site_X:sftpusers` | `755` | Données persistantes |
| `uploads/` | `site_X:sftpusers` | `755` | Fichiers uploadés |
| `logs/` | `site_X:sftpusers` | `755` | Logs (twoine peut écrire via ACL) |
| `tmp/` | `site_X:sftpusers` | `700` | Fichiers temporaires privés |

## API REST - Explorateur de fichiers

### Endpoints

| Méthode | Endpoint | Description | Rôles |
|---------|----------|-------------|-------|
| `GET` | `/api/sites/:siteId/files?path=/` | Lister un répertoire | Tous |
| `GET` | `/api/sites/:siteId/files/read?path=/file.txt` | Lire un fichier texte | Tous |
| `POST` | `/api/sites/:siteId/files/write` | Écrire un fichier | Admin, User |
| `POST` | `/api/sites/:siteId/files/upload` | Uploader des fichiers | Admin, User |
| `GET` | `/api/sites/:siteId/files/download?path=/file.txt` | Télécharger un fichier | Tous |
| `DELETE` | `/api/sites/:siteId/files?path=/file.txt` | Supprimer fichier/dossier | Admin, User |
| `POST` | `/api/sites/:siteId/files/rename` | Renommer | Admin, User |
| `POST` | `/api/sites/:siteId/files/mkdir` | Créer un dossier | Admin, User |
| `GET` | `/api/sites/:siteId/files/stats` | Statistiques disque | Tous |

### Endpoints SFTP

| Méthode | Endpoint | Description | Rôles |
|---------|----------|-------------|-------|
| `GET` | `/api/sites/:siteId/sftp` | Infos connexion SFTP | Tous |
| `POST` | `/api/sites/:siteId/sftp/reset-password` | Réinitialiser mot de passe | Admin, User |
| `POST` | `/api/sites/:siteId/sftp/enable` | Activer accès SFTP | Admin, User |
| `POST` | `/api/sites/:siteId/sftp/disable` | Désactiver accès SFTP | Admin, User |
| `GET` | `/api/admin/sftp/users` | Lister tous les users SFTP | Admin |

### Exemples d'utilisation

#### Lister un répertoire
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoine.example.com/api/sites/$SITE_ID/files?path=/services"
```

Réponse :
```json
{
  "success": true,
  "data": {
    "path": "/services",
    "parentPath": "/",
    "items": [
      {
        "name": "api",
        "path": "/services/api",
        "type": "directory",
        "size": null,
        "modified": "2024-01-15T10:30:00.000Z"
      },
      {
        "name": "package.json",
        "path": "/services/package.json",
        "type": "file",
        "size": 1234,
        "modified": "2024-01-15T09:00:00.000Z",
        "extension": ".json",
        "isEditable": true
      }
    ],
    "totalItems": 2
  }
}
```

#### Écrire un fichier
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "/services/config.json", "content": "{\"key\": \"value\"}"}' \
  "https://twoine.example.com/api/sites/$SITE_ID/files/write"
```

#### Uploader des fichiers
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@localfile.txt" \
  -F "targetPath=/uploads" \
  "https://twoine.example.com/api/sites/$SITE_ID/files/upload"
```

#### Obtenir les infos SFTP
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://twoine.example.com/api/sites/$SITE_ID/sftp"
```

Réponse :
```json
{
  "success": true,
  "data": {
    "username": "site_example",
    "homeDir": "/var/www/sites/site_example",
    "host": "sftp.example.com",
    "port": 22,
    "userExists": true,
    "isEnabled": true,
    "connectionString": "sftp://site_example@sftp.example.com:22"
  }
}
```

## Droits par rôle

### Admin
- ✅ Accès à **tous** les fichiers de **tous** les sites
- ✅ Upload, delete, rename, edit
- ✅ Voir tous les utilisateurs SFTP
- ✅ Gérer les accès SFTP de tous les sites

### User
- ✅ Accès aux fichiers de **ses sites** uniquement
- ✅ Upload, delete, rename, edit
- ✅ Gérer son propre accès SFTP
- ❌ Accès aux autres sites

### Readonly
- ✅ **Lecture seule** des fichiers de ses sites
- ✅ Téléchargement de fichiers
- ❌ Upload, delete, rename, edit
- ❌ Modification des paramètres SFTP

## Configuration SFTP

### Prérequis
- Ubuntu 22.04+
- OpenSSH Server
- Groupe `sftpusers` créé

### Installation

```bash
# Exécuter le script de configuration
sudo ./scripts/setup-sftp.sh
```

Ce script :
1. Crée le groupe `sftpusers`
2. Configure le répertoire `/var/www/sites`
3. Crée le fichier `/etc/ssh/sshd_config.d/twoine-sftp.conf`
4. Redémarre le service SSH

### Configuration manuelle

Ajouter à `/etc/ssh/sshd_config` ou créer `/etc/ssh/sshd_config.d/twoine-sftp.conf` :

```
Match Group sftpusers
    ForceCommand internal-sftp -u 0002 -l INFO
    ChrootDirectory /var/www/sites/%u
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    AllowAgentForwarding no
    PermitTTY no
    PasswordAuthentication yes
    PubkeyAuthentication yes
    LogLevel VERBOSE
```

### Créer un utilisateur SFTP

```bash
# Création automatique via Twoine (recommandé)
# Le mot de passe est généré et stocké de manière sécurisée

# Ou manuellement :
sudo ./scripts/sftp-user-create.sh monsite [motdepasse]
```

## Sécurité

### Pourquoi le chroot ?

Le **chroot** (change root) est une technique qui modifie le répertoire racine visible par un processus. Pour les utilisateurs SFTP :

1. **Isolation** : L'utilisateur ne voit que son répertoire, pas le reste du système
2. **Prévention d'attaques** : Impossible d'accéder à `/etc`, `/var/log`, etc.
3. **Simplicité** : L'utilisateur voit `/` mais c'est en réalité `/var/www/sites/site_X`

```
Vue utilisateur SFTP :          Réalité sur le serveur :
/                               /var/www/sites/site_example/
├── services/                   ├── services/
├── data/                       ├── data/
└── uploads/                    └── uploads/
```

### Protection contre la traversée de répertoire

Le `FileManager` implémente plusieurs niveaux de protection :

```javascript
// 1. Normalisation du chemin
cleanPath = relativePath.replace(/\\/g, '/');

// 2. Résolution du chemin absolu
const absolutePath = path.resolve(siteRoot, cleanPath);

// 3. Vérification que le chemin reste dans le site
if (!normalizedAbsolutePath.startsWith(normalizedSiteRoot)) {
    throw new Error('Path traversal detected: Access denied');
}

// 4. Vérification des liens symboliques
if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
    throw new Error('Access denied: symlink outside site');
}
```

Tentatives bloquées :
- `../../../etc/passwd` → Erreur
- `/etc/passwd` → Erreur (chemin absolu hors site)
- Symlink vers `/etc` → Ignoré/Erreur

### Protection contre les uploads malveillants

1. **Extensions interdites** : `.exe`, `.dll`, `.so`, `.bat`, etc.
2. **Validation du nom** : Caractères spéciaux interdits
3. **Limite de taille** : 50MB par défaut
4. **Pas d'exécution** : Les fichiers uploadés ne sont jamais exécutés directement

### Isolation entre sites

| Mécanisme | Description |
|-----------|-------------|
| **Users Linux séparés** | Chaque site a son propre utilisateur (`site_X`) |
| **Chroot SFTP** | L'utilisateur SFTP ne voit que son dossier |
| **Permissions strictes** | `750` sur les dossiers, ACL pour Twoine |
| **Validation API** | Vérification de l'accès au site avant chaque opération |
| **Pas de shell** | `/usr/sbin/nologin` empêche l'accès SSH classique |

### Bonnes pratiques

1. **Ne jamais désactiver le chroot** en production
2. **Auditer les logs** SSH : `journalctl -u sshd`
3. **Rotation des mots de passe** SFTP régulière
4. **Limiter les IPs** autorisées si possible (firewall)
5. **Surveiller l'espace disque** par site
6. **Sauvegardes régulières** des données

## Scripts disponibles

| Script | Description |
|--------|-------------|
| `setup-sftp.sh` | Configuration initiale d'OpenSSH pour Twoine |
| `sftp-user-create.sh` | Créer un utilisateur SFTP pour un site |
| `sftp-user-delete.sh` | Supprimer un utilisateur SFTP |
| `sftp-password-reset.sh` | Réinitialiser le mot de passe SFTP |
| `sftp-user-disable.sh` | Activer/désactiver l'accès SFTP |

### Exemples

```bash
# Configurer SFTP (une seule fois)
sudo ./scripts/setup-sftp.sh

# Créer un utilisateur
sudo ./scripts/sftp-user-create.sh monsite
# Output: {"success":true,"username":"site_monsite","password":"abc123..."}

# Réinitialiser le mot de passe
sudo ./scripts/sftp-password-reset.sh monsite
# Output: {"success":true,"username":"site_monsite","password":"xyz789..."}

# Désactiver temporairement
sudo ./scripts/sftp-user-disable.sh monsite disable

# Supprimer (sans les fichiers)
sudo ./scripts/sftp-user-delete.sh monsite

# Supprimer avec les fichiers (DANGER)
sudo ./scripts/sftp-user-delete.sh monsite --delete-files
```

## Flux de création de site

```
┌─────────────────────────────────────────────────────────────────┐
│                    Création d'un site                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. SiteManager.createSite()                                     │
│     - Valide le nom du site                                      │
│     - Génère la plage de ports                                   │
│     - Crée le document MongoDB                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Créer l'utilisateur Linux                                    │
│     - useradd --system site_example                              │
│     - Groupe sftpusers                                           │
│     - Shell /usr/sbin/nologin                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Créer la structure de dossiers                               │
│     - /var/www/sites/site_example/ (root:root)                   │
│     - services/, data/, uploads/, logs/, tmp/                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. SftpManager.createSftpUser()                                 │
│     - Définir le mot de passe SFTP                               │
│     - Retourner les credentials                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Site prêt !                                                  │
│     - Accès SFTP : sftp site_example@server                      │
│     - Accès Web : via API /api/sites/:id/files                   │
└─────────────────────────────────────────────────────────────────┘
```

## Dépannage

### L'utilisateur ne peut pas se connecter en SFTP

1. Vérifier que l'utilisateur existe : `id site_example`
2. Vérifier le groupe : `groups site_example` → doit inclure `sftpusers`
3. Vérifier les permissions du chroot :
   ```bash
   ls -la /var/www/sites/
   # site_example doit être owned by root:root avec 755
   ```
4. Tester la config SSH : `sudo sshd -t`
5. Voir les logs : `journalctl -u sshd -f`

### Erreur "Path traversal detected"

L'API a détecté une tentative d'accès hors du répertoire autorisé. Causes possibles :
- Chemin contenant `../`
- Chemin absolu commençant par `/etc`, `/var`, etc.
- Lien symbolique pointant hors du site

### Fichier non éditable dans l'interface web

Seuls les fichiers texte sont éditables. Extensions supportées :
`.txt`, `.md`, `.json`, `.js`, `.ts`, `.jsx`, `.tsx`, `.css`, `.html`, `.xml`, `.yml`, `.yaml`, `.py`, `.rb`, `.php`, `.sql`, etc.

Les fichiers binaires (images, archives, etc.) peuvent être uploadés/téléchargés mais pas édités.

### Quota disque dépassé

Utiliser l'endpoint `/api/sites/:siteId/files/stats` pour vérifier l'utilisation.
Nettoyer le dossier `tmp/` et les logs anciens.
