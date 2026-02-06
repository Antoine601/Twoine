# Twoine - User Panel Documentation

## Vue d'ensemble

Le User Panel est l'interface utilisateur de la plateforme Twoine. Il permet aux utilisateurs (non-admin) de gérer leurs sites, services, fichiers et bases de données.

## Architecture Frontend

### Stack Technique

| Technologie | Version | Usage |
|-------------|---------|-------|
| Vite | 5.x | Build tool |
| React | 18.x | Framework UI |
| React Router | 6.x | Routing |
| TailwindCSS | 3.x | Styling |
| Axios | 1.6.x | HTTP client |
| Lucide React | 0.294.x | Icônes |
| Recharts | 2.10.x | Graphiques |
| date-fns | 2.30.x | Dates |
| react-hot-toast | 2.4.x | Notifications |

### Structure des Dossiers

```
user-panel/
├── src/
│   ├── components/          # Composants réutilisables
│   │   ├── auth/           # Authentification
│   │   ├── layout/         # Layout (Sidebar, Header)
│   │   └── ui/             # Composants UI génériques
│   ├── config/             # Configuration (API)
│   ├── contexts/           # React Contexts
│   ├── pages/              # Pages de l'application
│   ├── App.jsx             # Composant racine + Routes
│   ├── index.css           # Styles globaux
│   └── main.jsx            # Point d'entrée
```

## Composants

### Layout

#### `Layout.jsx`
Conteneur principal avec sidebar fixe et zone de contenu.

#### `Sidebar.jsx`
Navigation latérale avec:
- Logo Twoine
- Navigation principale (Dashboard, Sites)
- Navigation contextuelle (quand dans un site)
- Lien retour vers la liste des sites

#### `Header.jsx`
Barre supérieure avec:
- Indicateur mode readonly
- Menu utilisateur dropdown
- Liens vers profil et déconnexion

### Composants UI

#### `Loading.jsx`
Indicateurs de chargement (spinner).

#### `StatusBadge.jsx`
Badge de statut coloré (running, stopped, error, etc.).

#### `EmptyState.jsx`
État vide avec icône et message personnalisables.

#### `Modal.jsx`
Fenêtre modale générique.

#### `ConfirmDialog.jsx`
Dialogue de confirmation pour actions dangereuses.

## Pages

### 1. Login (`/login`)

Page de connexion avec:
- Champ email/username
- Champ mot de passe (avec toggle visibilité)
- Gestion des erreurs
- Redirection post-login

### 2. Dashboard (`/`)

Vue d'ensemble avec:
- Message de bienvenue
- Statistiques (sites, services, DBs)
- Alertes (services en erreur)
- Liste rapide des sites

### 3. Sites (`/sites`)

Liste des sites avec:
- Recherche
- Cards avec infos (nom, type, domaine, ports)
- Badge de statut
- Lien externe vers le domaine

### 4. Site Detail (`/sites/:id`)

Détail d'un site avec:
- Infos générales (description, user Linux, ports)
- Liste des domaines
- Boutons actions (Start/Stop/Restart)
- Quick access vers sous-sections
- Aperçu des services

### 5. Services (`/sites/:id/services`)

Gestion des services avec:
- Cards par service
- Statut temps réel
- Boutons Start/Stop/Restart
- Détails expandables (commandes, config)
- Infos ressources (memory, uptime)

### 6. Files (`/sites/:id/files`)

Explorateur de fichiers avec:
- Navigation par breadcrumb
- Liste des fichiers/dossiers
- Actions: Upload, New Folder, Download, Edit, Delete
- Éditeur de fichier texte inline
- Icônes par type de fichier

### 7. Databases (`/sites/:id/databases`)

Gestion des bases de données avec:
- Cards par base
- Connection string (masquable/copiable)
- Test de connexion
- Reset password
- Suppression

### 8. Domains (`/sites/:id/domains`)

Domaines (lecture seule) avec:
- Liste des domaines
- Statut SSL/TLS
- Statut de vérification
- Dates d'expiration

### 9. Stats (`/sites/:id/stats`)

Statistiques avec:
- Cards métriques (CPU, RAM, Disk, Uptime)
- Barres de progression des limites
- Graphique d'usage (mock data)
- Liste des services avec métriques

### 10. Profile (`/profile`)

Profil utilisateur avec:
- Infos compte (email, rôle, dates)
- Formulaire édition (prénom, nom)
- Lien vers changement mot de passe

### 11. Change Password (`/change-password`)

Changement de mot de passe avec:
- Validation en temps réel
- Indicateurs de force
- Gestion du "mustChangePassword"

## Gestion des Rôles

### AuthContext

Le contexte d'authentification expose:

```javascript
{
  user,           // Données utilisateur
  loading,        // État de chargement
  login,          // Fonction connexion
  logout,         // Fonction déconnexion
  changePassword, // Changer mot de passe
  updateProfile,  // Modifier profil
  isReadonly,     // true si role === 'readonly'
  isUser,         // true si role === 'user'
  isAdmin,        // true si role === 'admin'
  canWrite,       // true si peut modifier (user)
}
```

### Restrictions UI

| Action | User | Readonly |
|--------|------|----------|
| Voir sites | ✅ | ✅ |
| Start/Stop services | ✅ | ❌ |
| Upload fichiers | ✅ | ❌ |
| Modifier fichiers | ✅ | ❌ |
| Supprimer fichiers | ✅ | ❌ |
| Modifier DB | ✅ | ❌ |
| Reset password DB | ✅ | ❌ |
| Voir stats | ✅ | ✅ |

### Implémentation

Les boutons d'action utilisent `canWrite` du contexte:

```jsx
const { canWrite } = useAuth()

{canWrite && (
  <button onClick={handleAction}>
    Action
  </button>
)}
```

Les utilisateurs readonly voient un bandeau d'avertissement dans le header.

## Sécurité

### JWT Authentication

1. Token stocké dans `localStorage`
2. Ajouté automatiquement aux requêtes via interceptor Axios
3. Refresh automatique si token expiré
4. Déconnexion si refresh échoue

### Protection des Routes

```jsx
<Route element={<ProtectedRoute />}>
  {/* Routes protégées */}
</Route>
```

`ProtectedRoute` vérifie:
- Présence d'un utilisateur
- Rôle non-admin (redirige vers panel admin)
- `mustChangePassword` (redirige vers changement)

### Validation Backend

Toutes les actions sont re-validées côté serveur:
- Vérification du token JWT
- Vérification des permissions sur le site
- Vérification du rôle pour les actions d'écriture

## API Configuration

### Interceptors Axios

```javascript
// Request: Ajoute le token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response: Gère refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Tentative de refresh...
    }
  }
)
```

### Proxy Développement

Vite proxy `/api` vers le backend:

```javascript
// vite.config.js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

## Déploiement

### Build Production

```bash
npm run build
```

### Intégration avec le Backend

Options:
1. **Servir les fichiers statiques** depuis Express
2. **Reverse proxy Nginx** avec routes séparées
3. **Sous-domaine** dédié (panel.example.com)

### Configuration Nginx

```nginx
# User Panel
location / {
    root /var/www/twoine/user-panel/dist;
    try_files $uri $uri/ /index.html;
}

# API Backend
location /api {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Améliorations Futures

1. **Thème sombre** - Toggle light/dark mode
2. **PWA** - Support offline et installation
3. **WebSocket** - Logs en temps réel
4. **Monaco Editor** - Éditeur de code avancé
5. **Terminal Web** - Accès shell limité
6. **Multi-langue** - i18n support
7. **Raccourcis clavier** - Navigation rapide
