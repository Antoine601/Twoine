# Twoine - Admin Panel (Interface Administrateur)

## Vue d'ensemble

L'Admin Panel est une interface d'administration séparée de l'interface utilisateur, permettant la gestion complète du système Twoine.

## Accès

- **URL** : `http://localhost:5174` (développement)
- **Authentification** : JWT avec rôle `admin` obligatoire
- **Séparation** : Tokens stockés avec préfixe `admin` pour éviter les conflits

## Pages principales

### 1. Dashboard Global
- CPU, RAM, disque en temps réel
- Uptime serveur
- Nombre total de sites, utilisateurs, services
- Alertes système (service down, certificat expiré)
- Dernières connexions

### 2. Gestion des Utilisateurs
**Liste** :
- Login, rôle, sites assignés, état

**Actions** :
- Créer/supprimer utilisateur
- Reset mot de passe
- Forcer changement mot de passe
- Se connecter en tant que (impersonation)
- Assigner/retirer sites
- Bloquer/débloquer

### 3. Gestion des Sites
**Liste** :
- Nom, type, user associé, domaine, ports, état

**Actions** :
- Créer/supprimer site
- Modifier paramètres
- Assigner user
- Gérer services/DB/fichiers
- Start/stop/restart services

### 4. Détail d'un Site
- Informations complètes (nom, type serveur, type DB, ports, domaine, user Linux)
- Boutons : start/stop/restart services
- Accès rapide : fichiers, DB, stats

### 5. Gestion des Services
**Liste par site** :
- Nom service, commande, répertoire, état

**Actions** :
- Ajouter/supprimer service
- Modifier commandes
- Démarrer/arrêter/redémarrer

### 6. Gestion des Fichiers
**Explorateur global** :
- Tous les sites, arborescence complète

**Actions** :
- Upload, delete, rename
- Édition de fichiers texte (Monaco Editor)
- Création de dossiers
- Voir propriétaire

### 7. Gestion des Bases de Données
**Vue globale** : MongoDB, MySQL, PostgreSQL

**Actions** :
- Créer DB
- Lier DB à site
- Supprimer DB
- Voir détails de connexion

### 8. Gestion des Domaines
- Ajouter/supprimer domaine
- Assigner domaine → site
- Voir certificats SSL
- Renouveler certificat
- État SSL (valide, expire bientôt, expiré)

### 9. Statistiques Serveur
- CPU, RAM, disque en temps réel
- Graphiques historiques
- Uptime, requêtes, visiteurs
- Stats par site

### 10. Sécurité & Authentification
- État de sécurité (JWT, Rate Limiting, CORS, etc.)
- Politique mot de passe
- Historique connexions
- Comptes bloqués

### 11. Configuration Système
- Ports réservés
- Répertoires racine
- Plage de ports
- Configuration SFTP
- Mode production

### 12. Profil Admin
- Informations du compte
- Changement de mot de passe
- Déconnexion

## Sécurité

### Authentification
```javascript
// Middleware admin obligatoire
router.use(authenticate);
router.use(adminOnly);
```

### Protections
- **JWT** : Token obligatoire sur toutes les routes
- **adminOnly** : Vérifie le rôle admin
- **noImpersonation** : Interdit certaines actions pendant l'impersonation
- **Logs** : Toutes les actions admin sont loggées

### Impersonation
L'admin peut se connecter en tant qu'un autre utilisateur :
1. Génération d'un nouveau JWT avec `impersonatedBy`
2. Bandeau visible indiquant l'impersonation
3. Actions sensibles bloquées pendant l'impersonation
4. Possibilité de quitter à tout moment

## API Endpoints Admin

### Utilisateurs
| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/users` | Liste paginée avec filtres |
| `POST /api/admin/users` | Créer un utilisateur |
| `GET /api/admin/users/:id` | Détail utilisateur |
| `PUT /api/admin/users/:id` | Modifier utilisateur |
| `DELETE /api/admin/users/:id` | Supprimer utilisateur |
| `POST /api/admin/users/:id/block` | Bloquer |
| `POST /api/admin/users/:id/unblock` | Débloquer |
| `POST /api/admin/users/:id/reset-password` | Reset MDP |
| `POST /api/admin/users/:id/impersonate` | Impersonner |
| `POST /api/admin/stop-impersonation` | Arrêter impersonation |

### Statistiques
| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/stats` | Stats globales plateforme |
| `GET /api/stats/system` | Stats système (CPU, RAM, etc.) |

### Configuration
| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/config` | Lire configuration |
| `PUT /api/admin/config` | Modifier configuration |
| `POST /api/admin/config/reset` | Reset aux valeurs par défaut |

## Installation

```bash
# Installer les dépendances
cd admin-panel
npm install

# Développement
npm run dev

# Build production
npm run build
```

## Configuration

### Variables d'environnement
```env
VITE_API_URL=/api
```

### Vite Config
- Port : 5174 (différent du user panel sur 5173)
- Proxy vers l'API backend sur port 3000

## Stack Technique

- **Framework** : React 18 + Vite
- **Routing** : React Router DOM v6
- **Styling** : TailwindCSS
- **Icons** : Lucide React
- **Charts** : Recharts
- **HTTP** : Axios
- **Editor** : Monaco Editor
- **Notifications** : React Hot Toast

## Design System

### Couleurs
- **Primary** : Violet (#d946ef)
- **Admin** : Gris sombre (#0f172a - #f8fafc)
- **Accent** : Vert (#10b981)
- **Danger** : Rouge (#ef4444)
- **Warning** : Orange (#f59e0b)

### Composants CSS
```css
.btn         /* Boutons */
.btn-primary /* Bouton principal */
.btn-danger  /* Bouton danger */
.input       /* Champs de formulaire */
.card        /* Cartes */
.badge       /* Badges de statut */
.table       /* Tableaux */
```

## Interdictions

- ❌ Pas d'accès sans authentification admin
- ❌ Pas de mélange avec l'interface user
- ❌ Pas d'API publique
- ❌ Pas de gestion multi-serveurs
- ❌ Pas de dépendance cloud
- ❌ Pas d'actions root exposées directement
