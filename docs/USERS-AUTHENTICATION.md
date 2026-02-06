# TWOINE - Gestion des Utilisateurs et Authentification

## Vue d'ensemble

Ce document décrit le système de gestion des utilisateurs de Twoine, incluant :
- Les rôles et permissions
- L'authentification JWT
- La sécurité des comptes
- Les relations User ↔ Site

---

## Types d'Utilisateurs (Rôles)

### 1. Admin (`admin`)
Accès complet à toutes les fonctionnalités.

**Permissions :**
- Créer / modifier / supprimer des utilisateurs
- Créer / modifier / supprimer des sites
- Assigner des sites à des utilisateurs
- Voir toutes les statistiques serveur
- Gérer les domaines
- Gérer les services
- Accéder à toutes les bases de données
- Accéder à tous les fichiers
- Se connecter "en tant que" un utilisateur (impersonation)
- Forcer la réinitialisation de mot de passe
- Bloquer / débloquer un compte

### 2. User (`user`)
Développeur avec accès à ses propres sites.

**Permissions :**
- Voir ses sites assignés
- Gérer les services de ses sites
- Accéder aux fichiers de ses sites
- Accéder aux bases de données de ses sites
- Voir les statistiques de ses sites uniquement

**Restrictions :**
- Ne peut pas voir les sites des autres utilisateurs
- Ne peut pas voir les statistiques globales serveur
- Ne peut pas gérer les utilisateurs

### 3. Readonly (`readonly`)
Accès en lecture seule.

**Permissions :**
- Voir ses sites assignés
- Voir les services (lecture seule)
- Voir les statistiques de ses sites
- Voir les fichiers (lecture seule)
- Voir les bases de données (lecture seule)

**Restrictions :**
- Ne peut rien modifier

---

## Schéma Logique

### Relations User ↔ Site

```
┌─────────────┐         ┌─────────────┐
│    User     │         │    Site     │
├─────────────┤         ├─────────────┤
│ _id         │         │ _id         │
│ username    │◄───┐    │ name        │
│ email       │    │    │ displayName │
│ password    │    │    │ owner ──────┼──► User._id
│ role        │    │    │ ...         │
│ sites[] ────┼────┼───►│             │
│   - site    │    │    └─────────────┘
│   - access  │    │
│   - assignBy│────┘
└─────────────┘

Relation Many-to-Many :
- Un User peut avoir accès à plusieurs Sites
- Un Site peut avoir plusieurs Users avec différents niveaux d'accès
```

### Niveaux d'accès aux sites

| Niveau | Description |
|--------|-------------|
| `owner` | Propriétaire du site, accès complet |
| `collaborator` | Peut modifier les services et fichiers |
| `readonly` | Lecture seule |

---

## Authentification JWT

### Pourquoi JWT ?

1. **Stateless** : Pas besoin de stocker les sessions côté serveur
2. **Scalable** : Fonctionne bien en environnement distribué
3. **Sécurisé** : Token signé, impossible à falsifier
4. **Performant** : Pas de requête DB pour chaque requête
5. **Standard** : Format ouvert (RFC 7519)

### Structure du Token

```json
{
  "userId": "ObjectId",
  "username": "string",
  "email": "string",
  "role": "admin|user|readonly",
  "impersonatedBy": "ObjectId|null",
  "type": "access|refresh",
  "iat": "timestamp",
  "exp": "timestamp"
}
```

### Flux d'authentification

```
┌─────────┐     POST /auth/login       ┌─────────┐
│ Client  │ ─────────────────────────► │  API    │
│         │   {email, password}        │         │
│         │                            │         │
│         │ ◄───────────────────────── │         │
│         │   {accessToken,            │         │
│         │    refreshToken}           │         │
└─────────┘                            └─────────┘
     │
     │  Authorization: Bearer <accessToken>
     ▼
┌─────────┐                            ┌─────────┐
│ Client  │ ─────────────────────────► │  API    │
│         │   GET /api/me/sites        │         │
│         │                            │         │
│         │ ◄───────────────────────── │         │
│         │   {sites: [...]}           │         │
└─────────┘                            └─────────┘
```

### Configuration

Variables d'environnement :

```bash
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

---

## Protection des Routes

### Middleware disponibles

| Middleware | Description |
|------------|-------------|
| `authenticate` | Vérifie le JWT et charge l'utilisateur |
| `adminOnly` | Accès admin uniquement |
| `userOnly` | User ou Admin (pas readonly) |
| `anyAuthenticated` | Tout utilisateur authentifié |
| `requireSiteAccess(param)` | Vérifie l'accès à un site |
| `requireSiteWriteAccess(param)` | Vérifie l'accès en écriture |
| `noImpersonation` | Interdit pendant l'impersonation |

### Exemple d'utilisation

```javascript
const authenticate = require('../middleware/authenticate');
const { adminOnly, requireSiteAccess } = require('../middleware/authorize');

// Route admin seulement
router.post('/admin/users', authenticate, adminOnly, createUser);

// Route avec vérification d'accès au site
router.get('/sites/:siteId', authenticate, requireSiteAccess('siteId'), getSite);

// Route protégée contre l'impersonation
router.delete('/users/:id', authenticate, adminOnly, noImpersonation, deleteUser);
```

---

## Prévention de l'Escalade de Privilèges

### Règles de sécurité

1. **Vérification systématique** : Chaque action vérifie le rôle avant exécution
2. **Pas d'accès direct** : Aucune commande système accessible directement
3. **Isolation** : Les utilisateurs ne peuvent pas accéder aux ressources d'autres utilisateurs
4. **Séparation admin** : Un admin ne peut pas se supprimer lui-même ni modifier son propre rôle

### Implémentation

```javascript
// Vérification avant chaque action sensible
if (user.role !== 'admin') {
    // Vérifier que l'utilisateur a accès au site
    const access = user.getSiteAccess(siteId);
    if (!access) {
        throw new Error('Access denied');
    }
    
    // Vérifier le niveau d'accès pour les modifications
    if (action === 'write' && access.accessLevel === 'readonly') {
        throw new Error('Write access required');
    }
}
```

---

## Sécurité de l'Impersonation

L'impersonation permet à un admin de se connecter "en tant que" un autre utilisateur.

### Règles de sécurité

1. **Admin seulement** : Seuls les admins peuvent utiliser l'impersonation
2. **Pas d'impersonation d'admin** : Impossible d'impersoner un autre admin
3. **Actions restreintes** : Certaines actions sont interdites pendant l'impersonation
4. **Logging** : Chaque impersonation est loggée
5. **Token court** : Token d'impersonation avec durée réduite (1h)
6. **Traçabilité** : Le token contient `impersonatedBy` pour audit

### Flux d'impersonation

```
1. Admin demande l'impersonation
   POST /admin/users/:id/impersonate

2. API génère un token spécial avec:
   - userId = target user
   - impersonatedBy = admin._id
   - expiresIn = 1h

3. Admin reçoit un nouveau token et agit en tant que l'utilisateur

4. Certaines routes bloquent l'impersonation:
   - Suppression d'utilisateurs
   - Modification de rôles
   - Blocage de comptes

5. Fin de l'impersonation:
   POST /admin/stop-impersonation
```

---

## API Endpoints

### Authentification (`/api/auth/`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/login` | Connexion | ❌ |
| POST | `/logout` | Déconnexion | ✅ |
| POST | `/logout-all` | Déconnexion de toutes les sessions | ✅ |
| POST | `/refresh` | Rafraîchir le token | ❌ |
| POST | `/change-password` | Changer son mot de passe | ✅ |
| POST | `/forgot-password` | Demander un reset | ❌ |
| POST | `/reset-password` | Reset avec token | ❌ |
| GET | `/me` | Obtenir ses infos | ✅ |
| PUT | `/me` | Modifier son profil | ✅ |
| GET | `/sessions` | Liste des sessions | ✅ |

### Administration (`/api/admin/`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/users` | Liste des utilisateurs | Admin |
| POST | `/users` | Créer un utilisateur | Admin |
| GET | `/users/:id` | Détails d'un utilisateur | Admin |
| PUT | `/users/:id` | Modifier un utilisateur | Admin |
| DELETE | `/users/:id` | Supprimer un utilisateur | Admin |
| POST | `/users/:id/block` | Bloquer un utilisateur | Admin |
| POST | `/users/:id/unblock` | Débloquer un utilisateur | Admin |
| POST | `/users/:id/reset-password` | Reset mot de passe | Admin |
| POST | `/users/:id/impersonate` | Impersoner un utilisateur | Admin |
| POST | `/stop-impersonation` | Arrêter l'impersonation | Admin |
| POST | `/users/:id/sites` | Assigner un site | Admin |
| DELETE | `/users/:id/sites/:siteId` | Retirer l'accès à un site | Admin |
| GET | `/stats` | Statistiques globales | Admin |
| GET | `/roles` | Liste des rôles | Admin |

### Utilisateur (`/api/me/`)

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/sites` | Mes sites | ✅ |
| GET | `/sites/:siteId` | Détails d'un site | ✅ + Access |
| GET | `/sites/:siteId/services` | Services d'un site | ✅ + Access |
| GET | `/sites/:siteId/stats` | Stats d'un site | ✅ + Access |
| GET | `/stats` | Mes statistiques | ✅ |

---

## Exemples de Requêtes

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

# Réponse
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "username": "user1",
      "email": "user@example.com",
      "role": "user"
    },
    "accessToken": "eyJhbGciOiJIUzI1...",
    "refreshToken": "eyJhbGciOiJIUzI1...",
    "expiresIn": "24h"
  }
}
```

### Créer un utilisateur (Admin)

```bash
POST /api/admin/users
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "role": "user",
  "firstName": "John",
  "lastName": "Doe",
  "mustChangePassword": true,
  "sites": [
    { "site": "site_id_1", "accessLevel": "collaborator" },
    { "site": "site_id_2", "accessLevel": "readonly" }
  ]
}
```

### Bloquer un utilisateur

```bash
POST /api/admin/users/:id/block
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Violation des conditions d'utilisation"
}
```

### Impersonation

```bash
# Démarrer l'impersonation
POST /api/admin/users/:id/impersonate
Authorization: Bearer <admin_token>

# Réponse: nouveau token pour agir en tant que l'utilisateur

# Arrêter l'impersonation
POST /api/admin/stop-impersonation
Authorization: Bearer <impersonation_token>

# Réponse: retour au token admin normal
```

---

## Configuration initiale

### Création du premier admin

```bash
# Via script
node scripts/setup-initial-admin.js

# Ou avec variables d'environnement
ADMIN_USERNAME=admin \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=SecurePass123! \
node scripts/setup-initial-admin.js
```

### Exigences mot de passe

- Minimum 8 caractères
- Au moins une majuscule
- Au moins une minuscule
- Au moins un chiffre
- Au moins un caractère spécial (!@#$%^&*(),.?":{}|<>)

---

## Bonnes Pratiques de Sécurité

1. **JWT_SECRET** : Utilisez une clé longue et aléatoire en production
2. **HTTPS** : Toujours utiliser HTTPS en production
3. **Rate limiting** : Limiter les tentatives de connexion
4. **Logging** : Logger toutes les actions sensibles
5. **Sessions** : Invalider les sessions après changement de mot de passe
6. **Mots de passe** : Ne jamais stocker en clair, toujours hasher avec bcrypt
7. **Tokens** : Durée de vie courte pour les access tokens
8. **Impersonation** : Logger et limiter dans le temps

---

## Fichiers créés

```
src/
├── models/
│   └── User.js           # Modèle utilisateur
├── services/
│   └── AuthService.js    # Service d'authentification
├── middleware/
│   ├── authenticate.js   # Middleware JWT (mis à jour)
│   └── authorize.js      # Middleware de rôles (mis à jour)
├── routes/
│   ├── auth.js          # Routes d'authentification
│   ├── admin.js         # Routes d'administration
│   └── users.js         # Routes utilisateur (/me)
scripts/
└── setup-initial-admin.js  # Script de création admin
```
