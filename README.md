# Twoine

Outil de gestion de projets pour Ubuntu 22.04 avec utilisateurs SFTP chroot sécurisés, gestion PM2 et interface Web moderne.

GitHub
License
Node

## 🚀 Fonctionnalités

### Interface CLI

- ✅ Création de projets avec utilisateurs SFTP chroot dédiés
- ✅ Gestion des services via PM2 (start/stop/restart)
- ✅ Génération automatique de scripts bash (start.sh, stop.sh, restart.sh, status.sh)
- ✅ Configuration SSH automatique pour SFTP sécurisé
- ✅ Interface interactive avec menus colorés

### Interface Web

- 🌐 Dashboard moderne avec statistiques en temps réel
- 📊 Vue d'ensemble de tous les projets et services
- ⚡ Gestion complète des services (démarrage, arrêt, redémarrage)
- 📝 Visualisation des logs PM2 en temps réel
- 🔑 Changement de mot de passe SFTP
- 🗄️ **Gestion des bases de données MySQL et MongoDB**
- 🔗 Assignation de bases de données aux projets
- � **Éditeur de base de données intégré (phpMyAdmin-like)**
- � Système de permissions utilisateur
- 🎨 Interface dark theme avec TailwindCSS
- 🔄 Auto-refresh toutes les 15 secondes

## 📋 Prérequis

- **OS** : Ubuntu 22.04 LTS
- **Node.js** : >= 20.0.0
- **PM2** : Installé globalement (`npm install -g pm2`)
- **Droits** : Accès root (sudo)

## 📦 Installation

```bash
# Cloner le repository
git clone https://github.com/Antoine601/Twoine.git
cd Twoine

# Installer les dépendances
npm install

# Rendre le script d'installation exécutable (optionnel)
chmod +x install.sh
```

## 🎯 Utilisation

### Interface CLI

```bash
# Lancer l'interface CLI interactive
sudo npm start

# Mode développement avec auto-reload
sudo npm run dev
```

### Interface Web

```bash
# Lancer le serveur web
sudo npm run web

# Mode développement avec auto-reload
sudo npm run web:dev
```

L'interface web sera accessible sur **[http://localhost:3847](http://localhost:3847)**

### Mise à jour

```bash
# Mettre à jour depuis GitHub (pull + npm install)
npm run update
```

## 🏗️ Structure d'un projet

Chaque projet créé aura la structure suivante :

```
/var/www/nom-projet/
├── sites/              # Dossier accessible via SFTP (appartient à l'utilisateur SFTP)
│   ├── service1/       # Exemple: API Node.js
│   ├── service2/       # Exemple: Frontend React
│   └── ...
├── scripts/            # Scripts générés automatiquement
│   ├── start.sh        # Démarre tous les services
│   ├── stop.sh         # Arrête tous les services
│   ├── restart.sh      # Redémarre tous les services
│   └── status.sh       # Affiche le statut
└── project.json        # Configuration du projet
```

## 🔐 Sécurité SFTP

- Chaque projet a un utilisateur SFTP dédié : `sftp_nom-projet`
- Utilisateurs en chroot dans leur dossier projet
- Pas d'accès shell (nologin)
- Configuration SSH automatique dans `/etc/ssh/sshd_config`

## 🛠️ API REST

L'interface web expose une API REST complète :

### Projets

- `GET /api/projects` - Liste tous les projets
- `GET /api/projects/:name` - Détails d'un projet
- `POST /api/projects` - Créer un projet
- `DELETE /api/projects/:name` - Supprimer un projet

### Services

- `GET /api/projects/:name/services` - Liste les services
- `POST /api/projects/:name/services` - Ajouter un service
- `PUT /api/projects/:name/services/:serviceName` - Modifier un service
- `DELETE /api/projects/:name/services/:serviceName` - Supprimer un service
- `POST /api/projects/:name/services/:serviceName/start` - Démarrer
- `POST /api/projects/:name/services/:serviceName/stop` - Arrêter
- `POST /api/projects/:name/services/:serviceName/restart` - Redémarrer
- `GET /api/projects/:name/services/:serviceName/logs` - Voir les logs

### Bases de données

- `GET /api/databases` - Liste toutes les bases de données
- `GET /api/databases/:id` - Détails d'une base de données
- `POST /api/databases/mysql` - Créer une base MySQL
- `POST /api/databases/mongodb` - Créer une base MongoDB
- `PUT /api/databases/:id` - Modifier une base de données
- `DELETE /api/databases/:id` - Supprimer une base de données
- `POST /api/databases/:id/assign` - Assigner une BDD à un projet
- `POST /api/databases/:id/unassign` - Retirer l'assignation
- `GET /api/databases/:id/connection-string` - Obtenir la chaîne de connexion

### Éditeur de base de données

- `POST /api/databases/:id/query` - Exécuter une requête SQL MySQL
- `GET /api/databases/:id/tables` - Liste les tables MySQL
- `GET /api/databases/:id/tables/:tableName/structure` - Structure d'une table MySQL
- `GET /api/databases/:id/tables/:tableName/data` - Données d'une table MySQL (avec pagination)
- `GET /api/databases/:id/collections` - Liste les collections MongoDB
- `POST /api/databases/:id/collections/:collectionName/query` - Exécuter une opération MongoDB
- `POST /api/databases/:id/import-bson` - Importer un fichier BSON dans une collection MongoDB

### Utilitaires

- `GET /api/pm2/status` - Statut global PM2
- `POST /api/regenerate-all-scripts` - Régénérer tous les scripts

## 📁 Architecture du code

```
src/
├── config/
│   └── constants.js        # Constantes de configuration
├── modules/
│   ├── projects.js         # Gestion des projets
│   ├── services.js         # Gestion des services PM2
│   ├── scripts.js          # Génération des scripts bash
│   ├── databases.js        # Gestion des bases de données
│   └── sftp.js             # Configuration SFTP/SSH
├── ui/
│   └── menu.js             # Interface CLI interactive
├── utils/
│   ├── logger.js           # Système de logs
│   └── shell.js            # Exécution de commandes
├── web/
│   ├── server.js           # Serveur Express
│   ├── api.js              # Routes API REST
│   └── public/
│       └── index.html      # SPA React
└── index.js                # Point d'entrée CLI
```

## 🎨 Technologies utilisées

### Backend

- Node.js 20+
- Express.js
- PM2 (Process Manager)
- MySQL2 (Connexion MySQL)
- MongoDB (Connexion MongoDB)
- Inquirer (CLI interactive)
- Chalk, Boxen, Figlet (UI CLI)

### Frontend

- React 18 (via CDN)
- TailwindCSS
- Lucide Icons
- Vanilla JavaScript (pas de build)

## 📝 Exemple d'utilisation

### Créer un projet avec l'interface Web

1. Accéder à [http://localhost:3847](http://localhost:3847)
2. Cliquer sur "Nouveau projet"
3. Remplir le formulaire (nom + mot de passe SFTP)
4. Le projet est créé avec l'utilisateur SFTP

### Ajouter un service

1. Cliquer sur le projet
2. "Ajouter un service"
3. Configurer :
  - Nom du service
  - Dossier (relatif à `sites/`)
  - Commandes de setup (ex: `npm install`)
  - Commande de démarrage (ex: `npm start`)

### Se connecter en SFTP

```bash
sftp sftp_nom-projet@votre-serveur
# Mot de passe : celui défini à la création
```

### Gérer les bases de données

1. Accéder à l'onglet "Bases de données"
2. Cliquer sur "Nouvelle base de données"
3. Choisir le type (MySQL ou MongoDB)
4. Remplir les informations de connexion
5. Optionnel : Assigner la BDD à un projet

**Permissions utilisateur :**

- Les **administrateurs** peuvent créer, modifier et supprimer toutes les bases de données
- Les **utilisateurs normaux** ne voient que les bases de données des projets qui leur sont assignés
- Chaque base de données peut être assignée à un projet spécifique
- Les chaînes de connexion sont générées automatiquement

### Utiliser l'éditeur de base de données

L'éditeur intégré permet de gérer vos bases de données directement depuis l'interface web :

**Pour MySQL :**

1. Cliquer sur "Ouvrir l'éditeur" sur une base de données MySQL
2. Naviguer entre les tables dans le panneau latéral
3. Visualiser la structure des tables (colonnes, types, clés)
4. Consulter les données avec pagination automatique
5. Exécuter des requêtes SQL personnalisées
6. Voir les résultats en temps réel

**Pour MongoDB :**

1. Cliquer sur "Ouvrir l'éditeur" sur une base de données MongoDB
2. Naviguer entre les collections dans le panneau latéral
3. Consulter les documents avec pagination
4. Exécuter des opérations MongoDB (find, insertOne, updateOne, deleteOne)
5. Format JSON pour les requêtes : `{"operation": "find", "query": {}, "options": {"limit": 10}}`
6. **Importer des données BSON** : Glisser-déposer un fichier `.bson` pour importer des données directement

**Fonctionnalités :**

- ✅ Navigation intuitive entre tables/collections
- ✅ Visualisation de la structure (MySQL)
- ✅ Pagination automatique (100 lignes/documents par page)
- ✅ Éditeur de requêtes avec syntaxe SQL ou JSON
- ✅ Exécution sécurisée des requêtes
- ✅ Affichage des résultats formatés
- ✅ **Import de fichiers BSON par drag-and-drop (MongoDB)**

### Importer des données BSON dans MongoDB

L'application permet d'importer facilement des fichiers BSON (format d'export natif de MongoDB) :

**Via l'API :**

```bash
curl -X POST http://localhost:3847/api/databases/{database_id}/import-bson \
  -F "bsonFile=@/chemin/vers/fichier.bson" \
  -F "collection=nom_collection"
```

**Fonctionnement :**

- Supporte les fichiers BSON générés par `mongodump` ou `mongoexport --type=bson`
- Parse automatiquement tous les documents du fichier
- Insère les documents dans la collection spécifiée
- Retourne le nombre de documents importés
- Gère les erreurs de parsing et de connexion

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👤 Auteur

**Antoine601**

- GitHub: [@Antoine601](https://github.com/Antoine601)
- Repository: [Twoine](https://github.com/Antoine601/Twoine)

## 🐛 Bugs & Issues

Pour signaler un bug ou demander une fonctionnalité, ouvrez une issue sur [GitHub Issues](https://github.com/Antoine601/Twoine/issues).

## ⚠️ Notes importantes

- Cet outil doit être exécuté avec les droits root (sudo)
- Conçu spécifiquement pour Ubuntu 22.04 LTS
- Sauvegardez toujours `/etc/ssh/sshd_config` avant utilisation
- Les logs sont stockés dans `/var/log/nodejs-project-manager/`
- La configuration est dans `/etc/nodejs-project-manager/`

## 🔮 Roadmap

- Support Docker
- Authentification multi-utilisateurs pour l'interface Web
- Gestion des bases de données MySQL et MongoDB
- Éditeur de base de données intégré (phpMyAdmin-like)
- Monitoring avancé des ressources
- Notifications par email/webhook
- Support d'autres distributions Linux
- Interface mobile responsive améliorée
- Backup automatique des bases de données





#   T w o i n e  
 #   T w o i n e  
 