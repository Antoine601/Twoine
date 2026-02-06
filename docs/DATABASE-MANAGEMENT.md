# TWOINE - Gestion des Bases de Données

## Vue d'ensemble

Twoine fournit un système complet de gestion des bases de données permettant de créer, gérer et lier des bases de données aux sites hébergés.

### Types de bases supportées

| Type | Port par défaut | Description |
|------|-----------------|-------------|
| MongoDB | 27017 | Base NoSQL document-oriented |
| MySQL | 3306 | Base relationnelle (via MariaDB) |
| MariaDB | 3306 | Fork open-source de MySQL |
| PostgreSQL | 5432 | Base relationnelle avancée |

---

## Architecture

### Schéma logique

```
┌─────────────────────────────────────────────────────────────────┐
│                         TWOINE                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐      ┌──────────┐      ┌──────────────────┐     │
│   │   User   │──────│   Site   │──────│    Database      │     │
│   │ (Twoine) │ 1..* │          │ 1..* │                  │     │
│   └──────────┘      └──────────┘      └──────────────────┘     │
│        │                                       │                 │
│        │ role                                  │                 │
│        ▼                                       ▼                 │
│   ┌──────────┐                        ┌──────────────────┐     │
│   │  admin   │ ← full access          │   DB User        │     │
│   │  user    │ ← CRUD own DBs         │   (isolated)     │     │
│   │ readonly │ ← read only            └──────────────────┘     │
│   └──────────┘                                 │                 │
│                                                │                 │
└────────────────────────────────────────────────┼─────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────┐
                    │                            ▼                │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
                    │  │ MongoDB  │  │  MySQL   │  │ PostgreSQL│  │
                    │  │ :27017   │  │  :3306   │  │  :5432   │  │
                    │  └──────────┘  └──────────┘  └──────────┘  │
                    │           (localhost only)                  │
                    └─────────────────────────────────────────────┘
```

### Isolation des bases

Chaque base de données est isolée par :

1. **Utilisateur DB dédié** - Chaque base a son propre utilisateur avec droits limités
2. **Pas d'accès root exposé** - Aucun accès administrateur aux moteurs DB
3. **Binding localhost** - Les moteurs n'écoutent que sur 127.0.0.1
4. **Firewall** - Ports DB bloqués depuis l'extérieur

---

## Rôles et Permissions

### Admin

| Permission | Description |
|------------|-------------|
| Voir toutes les bases | Accès global |
| Créer des bases | Pour n'importe quel site |
| Supprimer des bases | Avec ou sans données |
| Modifier les bases | Toutes les configurations |
| Lier/délier | Associer bases aux sites |
| Reset mot de passe | Réinitialiser les credentials |
| Voir connexions | Toutes les chaînes de connexion |

### User

| Permission | Description |
|------------|-------------|
| Voir ses bases | Uniquement sur ses sites |
| Créer des bases | Sur ses sites uniquement |
| Lire/écrire | CRUD sur ses données |
| Supprimer | Ses propres bases |
| Reset mot de passe | Ses propres bases |

### Readonly

| Permission | Description |
|------------|-------------|
| Voir ses bases | Uniquement sur ses sites |
| Lire | SELECT uniquement |
| ❌ Écrire | Interdit |
| ❌ Modifier | Interdit |
| ❌ Supprimer | Interdit |

---

## Installation

### Prérequis

- Ubuntu 22.04 LTS
- Node.js 18+
- Accès sudo

### Installation des moteurs DB

```bash
# Installer tous les moteurs
sudo ./scripts/setup-databases.sh all

# Ou individuellement
sudo ./scripts/setup-databases.sh mongodb
sudo ./scripts/setup-databases.sh mysql
sudo ./scripts/setup-databases.sh postgresql
```

### Configuration

Les credentials admin sont sauvegardés dans `/etc/twoine/db-credentials.env`:

```bash
# Ajouter au .env de Twoine
cat /etc/twoine/db-credentials.env >> /opt/twoine/.env
```

Variables d'environnement requises:

```env
# MongoDB
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_ADMIN_USER=twoine_admin
MONGODB_ADMIN_PASSWORD=<generated>

# MySQL/MariaDB
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_ADMIN_USER=twoine_admin
MYSQL_ADMIN_PASSWORD=<generated>

# PostgreSQL
POSTGRESQL_HOST=localhost
POSTGRESQL_PORT=5432
POSTGRESQL_ADMIN_USER=twoine_admin
POSTGRESQL_ADMIN_PASSWORD=<generated>
POSTGRESQL_ADMIN_DB=postgres

# Chiffrement des mots de passe DB
DB_ENCRYPTION_KEY=<64 hex chars>
```

---

## API Endpoints

### Admin

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/databases` | Liste toutes les bases |
| POST | `/api/admin/databases` | Crée une nouvelle base |
| POST | `/api/admin/databases/link` | Lie une base existante |
| GET | `/api/admin/databases/:id` | Détails d'une base |
| DELETE | `/api/admin/databases/:id` | Supprime une base |
| POST | `/api/admin/databases/:id/reset-password` | Reset mot de passe |
| POST | `/api/admin/databases/:id/test` | Teste la connexion |
| GET | `/api/admin/databases/:id/stats` | Statistiques |

### Sites

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites/:siteId/databases` | Liste les bases du site |
| POST | `/api/sites/:siteId/databases` | Crée une base pour le site |
| GET | `/api/sites/:siteId/databases/:dbId` | Détails |
| DELETE | `/api/sites/:siteId/databases/:dbId` | Supprime |
| POST | `/api/sites/:siteId/databases/:dbId/reset-password` | Reset |
| POST | `/api/sites/:siteId/databases/:dbId/test` | Test connexion |

### Utilisateur

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/me/databases` | Liste mes bases |

---

## Exemples d'utilisation

### Créer une base MongoDB

```bash
curl -X POST http://localhost:3000/api/sites/SITE_ID/databases \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myapp_db",
    "type": "mongodb",
    "displayName": "My App Database"
  }'
```

Réponse:
```json
{
  "success": true,
  "message": "Database created successfully",
  "database": {
    "id": "...",
    "name": "myapp_db",
    "type": "mongodb",
    "status": "active"
  },
  "credentials": {
    "username": "tw_sitename_myapp_db",
    "password": "GeneratedSecurePassword123",
    "connectionString": "mongodb://tw_sitename_myapp_db:...@localhost:27017/myapp_db?authSource=myapp_db"
  }
}
```

### Lier une base existante

```bash
curl -X POST http://localhost:3000/api/admin/databases/link \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "legacy_db",
    "type": "mysql",
    "siteId": "SITE_ID",
    "host": "localhost",
    "port": 3306,
    "databaseName": "existing_database",
    "username": "existing_user",
    "password": "existing_password"
  }'
```

### Variables d'environnement générées

Chaque base génère automatiquement des variables d'environnement pour le site:

```env
# Variables génériques
DB_MYAPP_DB_TYPE=mongodb
DB_MYAPP_DB_HOST=localhost
DB_MYAPP_DB_PORT=27017
DB_MYAPP_DB_NAME=myapp_db
DB_MYAPP_DB_USER=tw_sitename_myapp_db
DB_MYAPP_DB_PASSWORD=<password>
DB_MYAPP_DB_URL=mongodb://...

# Variables spécifiques MongoDB
MONGODB_URI=mongodb://...
MONGO_URL=mongodb://...

# Variables spécifiques MySQL
MYSQL_HOST=localhost
MYSQL_DATABASE=myapp_db
MYSQL_USER=tw_sitename_myapp_db
MYSQL_PASSWORD=<password>

# Variables spécifiques PostgreSQL
DATABASE_URL=postgresql://...
PGHOST=localhost
PGDATABASE=myapp_db
PGUSER=tw_sitename_myapp_db
PGPASSWORD=<password>
```

---

## Commandes DB directes

### MongoDB

```bash
# Créer une base
./scripts/db-user-manage.sh create-db mongodb mydb myuser

# Lister les bases
./scripts/db-user-manage.sh list-dbs mongodb

# Reset mot de passe
./scripts/db-user-manage.sh reset-pass mongodb myuser newpassword mydb

# Supprimer
./scripts/db-user-manage.sh delete-db mongodb mydb myuser
```

### MySQL/MariaDB

```bash
# Créer une base
./scripts/db-user-manage.sh create-db mysql mydb myuser

# Lister les bases
./scripts/db-user-manage.sh list-dbs mysql

# Reset mot de passe
./scripts/db-user-manage.sh reset-pass mysql myuser newpassword

# Supprimer
./scripts/db-user-manage.sh delete-db mysql mydb myuser
```

### PostgreSQL

```bash
# Créer une base
./scripts/db-user-manage.sh create-db postgresql mydb myuser

# Lister les bases
./scripts/db-user-manage.sh list-dbs postgresql

# Reset mot de passe
./scripts/db-user-manage.sh reset-pass postgresql myuser newpassword

# Supprimer
./scripts/db-user-manage.sh delete-db postgresql mydb myuser
```

---

## Cas d'usage

### Suppression d'un site - Que faire des bases?

Lors de la suppression d'un site, trois options sont disponibles:

| Action | Description |
|--------|-------------|
| `delete` | Supprime les bases et leurs données |
| `unlink` | Supprime l'entrée Twoine mais garde les données |
| `keep` | Marque comme orpheline, garde tout |

```javascript
// Dans le code
await databaseManager.handleSiteDeletion(siteId, 'unlink');
```

### Utilisateur avec plusieurs sites

Un utilisateur peut avoir accès à plusieurs sites, chacun avec ses propres bases:

```
User "john"
├── Site "blog"
│   ├── DB "blog_content" (MongoDB)
│   └── DB "blog_analytics" (PostgreSQL)
└── Site "shop"
    ├── DB "shop_products" (MySQL)
    └── DB "shop_orders" (MySQL)
```

### Readonly tente d'écrire

```bash
# Tentative d'exécution de requête d'écriture
curl -X POST /api/sites/ID/databases/DBID/query \
  -d '{"query": "INSERT INTO users VALUES (...)"}'

# Réponse (403 Forbidden)
{
  "success": false,
  "error": "Readonly users can only execute SELECT, SHOW, and DESCRIBE queries"
}
```

---

## Sécurité

### Stockage des mots de passe

- Les mots de passe DB sont **chiffrés** avec AES-256-GCM
- Jamais stockés en clair dans la base MongoDB
- Clé de chiffrement dans variable d'environnement `DB_ENCRYPTION_KEY`
- Jamais affichés dans les réponses API (sauf à la création)

### Génération des mots de passe

```javascript
// 24 bytes = 32 caractères base64
crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '')
```

### Isolation réseau

```bash
# MongoDB - localhost only
net:
  bindIp: 127.0.0.1

# MySQL - localhost only  
bind-address = 127.0.0.1

# PostgreSQL - localhost only
listen_addresses = 'localhost'
```

### Firewall

```bash
# Bloquer l'accès externe
ufw deny 27017/tcp  # MongoDB
ufw deny 3306/tcp   # MySQL
ufw deny 5432/tcp   # PostgreSQL
```

### Principe du moindre privilège

Chaque utilisateur DB a uniquement les droits nécessaires:

- **MongoDB**: `readWrite` + `dbAdmin` sur sa base uniquement
- **MySQL**: `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER, REFERENCES`
- **PostgreSQL**: `ALL` sur sa base uniquement

---

## Bonnes pratiques

1. **Générer une clé de chiffrement sécurisée**
   ```bash
   openssl rand -hex 32
   ```

2. **Sauvegarder les credentials admin** - Garder une copie sécurisée hors serveur

3. **Auditer régulièrement** - Vérifier les accès et supprimer les bases orphelines

4. **Backups automatisés** - Configurer des sauvegardes régulières

5. **Rotation des mots de passe** - Utiliser la fonction reset-password périodiquement

6. **Monitoring** - Surveiller l'utilisation des ressources DB

---

## Dépannage

### Erreur de connexion MongoDB

```bash
# Vérifier que MongoDB écoute
sudo systemctl status mongod
sudo ss -tlnp | grep 27017

# Tester l'authentification
mongosh -u twoine_admin -p PASSWORD --authenticationDatabase admin
```

### Erreur de connexion MySQL

```bash
# Vérifier le service
sudo systemctl status mariadb
sudo ss -tlnp | grep 3306

# Tester la connexion
mysql -u twoine_admin -p
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier le service
sudo systemctl status postgresql
sudo ss -tlnp | grep 5432

# Tester la connexion
PGPASSWORD=PASSWORD psql -h localhost -U twoine_admin -d postgres
```

### Base inaccessible après création

1. Vérifier le status dans Twoine
2. Consulter les logs: `/var/log/twoine/`
3. Tester la connexion manuellement
4. Vérifier les permissions de l'utilisateur DB
