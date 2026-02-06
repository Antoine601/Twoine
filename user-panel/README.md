# Twoine User Panel

Interface utilisateur moderne pour la plateforme d'auto-hébergement Twoine.

## Stack Technique

- **Frontend**: Vite + React 18
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **Notifications**: React Hot Toast

## Installation

```bash
cd user-panel
npm install
```

## Développement

```bash
npm run dev
```

Le serveur de développement démarre sur `http://localhost:5173`

## Build Production

```bash
npm run build
```

Les fichiers de production sont générés dans le dossier `dist/`.

## Configuration

Créer un fichier `.env` pour les variables d'environnement:

```env
VITE_API_URL=/api
```

## Structure du Projet

```
user-panel/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   ├── Layout.jsx
│   │   │   └── Sidebar.jsx
│   │   └── ui/
│   │       ├── ConfirmDialog.jsx
│   │       ├── EmptyState.jsx
│   │       ├── Loading.jsx
│   │       ├── Modal.jsx
│   │       └── StatusBadge.jsx
│   ├── config/
│   │   └── api.js
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── pages/
│   │   ├── ChangePasswordPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── DatabasesPage.jsx
│   │   ├── DomainsPage.jsx
│   │   ├── FilesPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── NotFoundPage.jsx
│   │   ├── ProfilePage.jsx
│   │   ├── ServicesPage.jsx
│   │   ├── SiteDetailPage.jsx
│   │   ├── SitesPage.jsx
│   │   └── StatsPage.jsx
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── vite.config.js
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Connexion utilisateur |
| Dashboard | `/` | Vue d'ensemble |
| Sites | `/sites` | Liste des sites |
| Site Detail | `/sites/:id` | Détail d'un site |
| Services | `/sites/:id/services` | Gestion des services |
| Files | `/sites/:id/files` | Explorateur de fichiers |
| Databases | `/sites/:id/databases` | Gestion des bases de données |
| Domains | `/sites/:id/domains` | Domaines (lecture seule) |
| Stats | `/sites/:id/stats` | Statistiques |
| Profile | `/profile` | Profil utilisateur |
| Change Password | `/change-password` | Changer le mot de passe |

## Rôles et Permissions

### User (Développeur)
- ✅ Voir ses sites
- ✅ Gérer ses services (start/stop/restart)
- ✅ Gérer les fichiers (upload/edit/delete)
- ✅ Gérer les bases de données
- ✅ Voir les statistiques
- ❌ Créer des utilisateurs
- ❌ Gérer les domaines

### Readonly
- ✅ Voir ses sites
- ✅ Voir les services
- ✅ Voir les fichiers (lecture seule)
- ✅ Voir les bases de données
- ✅ Voir les statistiques
- ❌ Start/Stop services
- ❌ Modifier les fichiers
- ❌ Modifier les bases de données

## Sécurité

- Authentification JWT obligatoire
- Refresh token automatique
- Vérification du rôle sur chaque action
- Protection contre l'accès admin
- Isolation stricte par site

## API Endpoints Utilisés

### Authentification
- `POST /auth/login` - Connexion
- `POST /auth/logout` - Déconnexion
- `POST /auth/refresh` - Rafraîchir le token
- `GET /auth/me` - Infos utilisateur
- `PUT /auth/me` - Modifier profil
- `POST /auth/change-password` - Changer mot de passe

### Sites
- `GET /sites` - Liste des sites
- `GET /sites/:id` - Détail d'un site
- `POST /sites/:id/start` - Démarrer un site
- `POST /sites/:id/stop` - Arrêter un site
- `POST /sites/:id/restart` - Redémarrer un site

### Services
- `GET /sites/:id/services` - Liste des services
- `GET /services/:id` - Détail d'un service
- `POST /services/:id/start` - Démarrer
- `POST /services/:id/stop` - Arrêter
- `POST /services/:id/restart` - Redémarrer

### Fichiers
- `GET /sites/:id/files` - Lister le répertoire
- `GET /sites/:id/files/read` - Lire un fichier
- `POST /sites/:id/files/write` - Écrire un fichier
- `POST /sites/:id/files/upload` - Upload
- `DELETE /sites/:id/files` - Supprimer
- `POST /sites/:id/files/mkdir` - Créer dossier
- `POST /sites/:id/files/rename` - Renommer
- `GET /sites/:id/files/download` - Télécharger
- `GET /sites/:id/files/stats` - Stats disque

### Bases de données
- `GET /sites/:id/databases` - Liste
- `GET /sites/:id/databases/:dbId` - Détail
- `POST /sites/:id/databases/:dbId/test` - Test connexion
- `POST /sites/:id/databases/:dbId/reset-password` - Reset password
- `DELETE /sites/:id/databases/:dbId` - Supprimer

### Utilisateur
- `GET /me/databases` - Mes bases de données
