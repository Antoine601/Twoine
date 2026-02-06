# Twoine Admin Panel

Interface d'administration pour la plateforme Twoine.

## 📐 Structure UI Admin

```
admin-panel/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── AdminRoute.jsx       # Protection des routes admin
│   │   ├── layout/
│   │   │   ├── Header.jsx           # En-tête avec notifications et user menu
│   │   │   ├── Layout.jsx           # Layout principal avec sidebar
│   │   │   └── Sidebar.jsx          # Navigation latérale
│   │   └── ui/
│   │       ├── ConfirmDialog.jsx    # Dialogues de confirmation
│   │       ├── DataTable.jsx        # Tableau de données paginé
│   │       ├── EmptyState.jsx       # État vide
│   │       ├── Loading.jsx          # Indicateurs de chargement
│   │       ├── Modal.jsx            # Modales réutilisables
│   │       └── StatusBadge.jsx      # Badges de statut
│   ├── config/
│   │   └── api.js                   # Configuration Axios
│   ├── contexts/
│   │   └── AuthContext.jsx          # Contexte d'authentification admin
│   ├── pages/
│   │   ├── LoginPage.jsx            # Connexion admin
│   │   ├── DashboardPage.jsx        # Dashboard global
│   │   ├── UsersPage.jsx            # Gestion des utilisateurs
│   │   ├── UserDetailPage.jsx       # Détail d'un utilisateur
│   │   ├── SitesPage.jsx            # Gestion des sites
│   │   ├── SiteDetailPage.jsx       # Détail d'un site
│   │   ├── ServicesPage.jsx         # Gestion des services
│   │   ├── FilesPage.jsx            # Explorateur de fichiers
│   │   ├── DatabasesPage.jsx        # Gestion des bases de données
│   │   ├── DomainsPage.jsx          # Gestion des domaines
│   │   ├── StatsPage.jsx            # Statistiques serveur
│   │   ├── SecurityPage.jsx         # Sécurité & authentification
│   │   ├── ConfigPage.jsx           # Configuration système
│   │   ├── ProfilePage.jsx          # Profil admin
│   │   └── NotFoundPage.jsx         # Page 404
│   ├── App.jsx                      # Routeur principal
│   ├── index.css                    # Styles Tailwind
│   └── main.jsx                     # Point d'entrée
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.js
└── README.md
```

## 🧩 Composants

### Layout
- **Sidebar** : Navigation avec accès à toutes les sections admin
- **Header** : Notifications, impersonation banner, menu utilisateur

### UI
- **DataTable** : Tableau avec pagination, tri, recherche
- **Modal** : Fenêtres modales pour formulaires
- **ConfirmDialog** : Confirmations d'actions dangereuses
- **StatusBadge** : Indicateurs d'état (actif, bloqué, etc.)

## 💻 Installation

```bash
cd admin-panel
npm install
npm run dev
```

Le panel admin sera accessible sur `http://localhost:5174`

## 🔐 Sécurité

### Authentification
- JWT obligatoire pour toutes les routes
- Vérification du rôle `admin` côté frontend ET backend
- Tokens stockés dans `localStorage` avec préfixe `admin`
- Refresh token automatique

### Protections
- Middleware `adminOnly` sur toutes les routes backend
- Guard `AdminRoute` sur toutes les routes frontend
- Protection contre l'impersonation pour actions sensibles
- Logs de toutes les actions admin

## 🔁 API Endpoints

### Utilisateurs
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/users` | Liste des utilisateurs |
| POST | `/api/admin/users` | Créer un utilisateur |
| GET | `/api/admin/users/:id` | Détail utilisateur |
| PUT | `/api/admin/users/:id` | Modifier utilisateur |
| DELETE | `/api/admin/users/:id` | Supprimer utilisateur |
| POST | `/api/admin/users/:id/block` | Bloquer |
| POST | `/api/admin/users/:id/unblock` | Débloquer |
| POST | `/api/admin/users/:id/reset-password` | Reset mot de passe |
| POST | `/api/admin/users/:id/impersonate` | Se connecter en tant que |
| POST | `/api/admin/users/:id/sites` | Assigner un site |
| DELETE | `/api/admin/users/:id/sites/:siteId` | Retirer accès site |

### Sites
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites` | Liste des sites |
| POST | `/api/sites` | Créer un site |
| GET | `/api/sites/:id` | Détail site |
| PATCH | `/api/sites/:id` | Modifier site |
| DELETE | `/api/sites/:id` | Supprimer site |
| POST | `/api/sites/:id/services/start` | Démarrer services |
| POST | `/api/sites/:id/services/stop` | Arrêter services |
| POST | `/api/sites/:id/services/restart` | Redémarrer services |

### Services
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites/:siteId/services` | Liste des services |
| POST | `/api/sites/:siteId/services` | Créer service |
| POST | `/api/services/:id/start` | Démarrer |
| POST | `/api/services/:id/stop` | Arrêter |
| POST | `/api/services/:id/restart` | Redémarrer |
| DELETE | `/api/services/:id` | Supprimer |

### Fichiers
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites/:siteId/files` | Liste fichiers |
| GET | `/api/sites/:siteId/files/content` | Lire fichier |
| PUT | `/api/sites/:siteId/files/content` | Écrire fichier |
| POST | `/api/sites/:siteId/files/upload` | Upload fichier |
| POST | `/api/sites/:siteId/files/directory` | Créer dossier |
| DELETE | `/api/sites/:siteId/files` | Supprimer |

### Bases de données
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/databases` | Liste globale |
| GET | `/api/sites/:siteId/databases` | Liste par site |
| POST | `/api/sites/:siteId/databases` | Créer DB |
| DELETE | `/api/sites/:siteId/databases/:id` | Supprimer DB |

### Domaines
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/domains` | Liste globale |
| GET | `/api/sites/:siteId/domains` | Liste par site |
| POST | `/api/sites/:siteId/domains` | Ajouter domaine |
| DELETE | `/api/sites/:siteId/domains/:id` | Supprimer |
| POST | `/api/sites/:siteId/domains/:id/renew-ssl` | Renouveler SSL |

### Statistiques & Config
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/stats` | Stats globales |
| GET | `/api/stats/system` | Stats système |
| GET | `/api/admin/config` | Configuration |
| PUT | `/api/admin/config` | Modifier config |

## 📘 Flux Admin → Backend

### Authentification
1. Admin entre ses identifiants sur `/login`
2. Appel `POST /api/auth/login`
3. Backend vérifie credentials + rôle admin
4. Retourne JWT avec `role: admin`
5. Frontend stocke token et redirige vers dashboard

### Impersonation
1. Admin clique "Se connecter en tant que" sur un user
2. Appel `POST /api/admin/users/:id/impersonate`
3. Backend génère nouveau JWT avec `impersonatedBy`
4. Admin navigue comme l'utilisateur
5. Bandeau visible en haut indiquant l'impersonation
6. "Quitter" appelle `POST /api/admin/stop-impersonation`

### Actions CRUD
1. Frontend appelle l'endpoint approprié
2. Middleware vérifie: auth → admin → noImpersonation (si sensible)
3. Backend exécute l'action
4. Log de l'action admin
5. Retour du résultat au frontend

## 🛡️ Gestion des Erreurs

- **401** : Token invalide/expiré → Redirection login
- **403** : Pas admin ou action interdite → Message d'erreur
- **404** : Ressource non trouvée → Redirection ou message
- **409** : Conflit (doublon) → Message explicatif
- **500** : Erreur serveur → Toast d'erreur générique

## 🎨 Design System

- **Couleurs** : Palette admin sombre (admin-900 à admin-50)
- **Accent** : Primary (violet), Accent (vert), Danger (rouge), Warning (orange)
- **Composants** : Boutons, inputs, cards, badges, tables
- **Responsive** : Desktop prioritaire, adaptatif mobile

## ⚠️ Interdictions

- ❌ Pas d'accès sans authentification admin
- ❌ Pas de mélange avec l'interface user
- ❌ Pas d'API publique exposée
- ❌ Pas de gestion multi-serveurs
- ❌ Pas de dépendance cloud externe
