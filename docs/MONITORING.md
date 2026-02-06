# TWOINE - Supervision & Statistiques Serveur

## 📐 Architecture du Module

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────┬───────────────────────────────────────────┤
│   Admin Panel       │           User Panel                       │
│   - StatsPage       │           - StatsPage                      │
│   - Vue serveur     │           - Vue site assigné               │
│   - Vue tous sites  │           - Services                       │
│   - Alertes         │           - Alertes du site                │
└─────────┬───────────┴───────────────────┬───────────────────────┘
          │                               │
          │  HTTP/REST + WebSocket        │
          ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                   │
├─────────────────────────────────────────────────────────────────┤
│  Routes: /stats/*                                                │
│  ├── GET /stats/server          (admin)                         │
│  ├── GET /stats/server/history  (admin)                         │
│  ├── GET /stats/system          (tous)                          │
│  ├── GET /stats/sites           (admin)                         │
│  ├── GET /stats/site/:id        (admin + assigné)               │
│  ├── GET /stats/site/:id/history                                │
│  ├── GET /stats/services/:siteId                                │
│  ├── GET /stats/alerts                                          │
│  ├── POST /stats/alerts/:id/acknowledge                         │
│  └── POST /stats/alerts/:id/resolve (admin)                     │
├─────────────────────────────────────────────────────────────────┤
│  Services                                                        │
│  ├── SystemMonitor   - Collecte métriques OS                    │
│  ├── StatsService    - Agrégation, historique, alertes          │
│  └── WebSocketService - Temps réel                              │
├─────────────────────────────────────────────────────────────────┤
│  Models                                                          │
│  ├── ServerStats     - Snapshots serveur (TTL 24h)              │
│  ├── SiteStats       - Snapshots par site (TTL 24h)             │
│  ├── Alert           - Alertes système                          │
│  └── MonitoringConfig - Configuration                           │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SYSTÈME (Ubuntu 22.04)                       │
├─────────────────────────────────────────────────────────────────┤
│  Sources de données:                                             │
│  ├── /proc/stat        - CPU                                    │
│  ├── /proc/meminfo     - Mémoire                                │
│  ├── /proc/net/dev     - Réseau                                 │
│  ├── df                - Disque                                 │
│  ├── ps                - Processus par user                     │
│  └── systemctl         - État services                          │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de données

1. **Collecte périodique** (défaut: 30s)
   - `StatsService.collectAndStore()` déclenché par timer
   - `SystemMonitor` lit les métriques système
   - Stockage dans MongoDB (`ServerStats`, `SiteStats`)
   - Vérification des seuils d'alerte
   - Émission WebSocket aux clients abonnés

2. **Requête API**
   - Client → Route → Service → Données fraîches ou cache
   - Vérification des permissions (admin / user assigné)

3. **WebSocket temps réel**
   - Connexion avec token JWT
   - Abonnement aux channels (server, site, alerts)
   - Push des updates à chaque collecte

## 💻 Backend

### Services créés

#### `SystemMonitor.js`

Collecte des métriques système via lecture directe des fichiers `/proc` et commandes système.

```javascript
const { systemMonitor } = require('./services/SystemMonitor');

// Collecter toutes les stats système
const stats = await systemMonitor.collectSystemStats();
// { cpu, memory, disk, network, processes, uptime }

// Stats d'un site spécifique
const siteStats = await systemMonitor.getSiteStats(site);

// Stats d'un service systemd
const serviceStats = await systemMonitor.getServiceStats('twoine-mysite-api');

// Liste tous les services Twoine
const services = await systemMonitor.listTwoineServicesStatus();
```

#### `StatsService.js`

Gestion centralisée des statistiques avec historique et alertes.

```javascript
const { statsService } = require('./services/StatsService');

// Initialiser et démarrer la collecte
await statsService.initialize();
statsService.startCollection();

// Obtenir stats serveur
const serverStats = await statsService.getServerStats();

// Historique (1h, 60 points max)
const history = await statsService.getServerHistory(1, 60);

// Stats d'un site
const siteStats = await statsService.getSiteStats(siteId);

// Alertes
const alerts = await statsService.getAlerts({ status: 'active' });
await statsService.acknowledgeAlert(alertId, userId);
await statsService.resolveAlert(alertId);
```

#### `WebSocketService.js`

Gestion des connexions WebSocket pour le temps réel.

```javascript
const { webSocketService } = require('./services/WebSocketService');

// Initialiser avec le serveur HTTP
webSocketService.initialize(httpServer);
webSocketService.startHeartbeat();

// Broadcast stats serveur (appelé par StatsService)
webSocketService.broadcastServerStats(stats);

// Broadcast stats site
webSocketService.broadcastSiteStats(siteId, stats);

// Broadcast alerte
webSocketService.broadcastAlert(alert);
```

### Routes API

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/stats/server` | GET | Admin | Stats serveur complètes |
| `/stats/server/history` | GET | Admin | Historique serveur |
| `/stats/system` | GET | Tous | Stats système (filtrées pour non-admin) |
| `/stats/sites` | GET | Admin | Stats de tous les sites |
| `/stats/site/:id` | GET | Admin/Assigné | Stats d'un site |
| `/stats/site/:id/history` | GET | Admin/Assigné | Historique d'un site |
| `/stats/services/:siteId` | GET | Admin/Assigné | Services d'un site |
| `/stats/services` | GET | Admin | Stats globales services |
| `/stats/alerts` | GET | Tous | Alertes (filtrées) |
| `/stats/alerts/:id/acknowledge` | POST | Tous | Acquitter une alerte |
| `/stats/alerts/:id/resolve` | POST | Admin | Résoudre une alerte |
| `/stats/config` | GET | Admin | Config monitoring |
| `/stats/config` | PUT | Admin | Modifier config |
| `/stats/websocket` | GET | Admin | Stats WebSocket |

### Modèles MongoDB

#### `ServerStats`
```javascript
{
  timestamp: Date,           // Auto-expire après 24h
  cpu: {
    percent: Number,
    cores: Number,
    model: String,
    loadAvg: { one, five, fifteen }
  },
  memory: {
    total: Number,
    used: Number,
    free: Number,
    percent: Number
  },
  disk: {
    total: Number,
    used: Number,
    free: Number,
    percent: Number
  },
  network: {
    bytesIn: Number,
    bytesOut: Number
  },
  totals: {
    sites: Number,
    services: Number,
    users: Number,
    servicesRunning: Number
  }
}
```

#### `SiteStats`
```javascript
{
  site: ObjectId,            // Référence Site
  timestamp: Date,           // Auto-expire après 24h
  cpu: { percent, timeMs },
  memory: { usedBytes, percent, limit },
  disk: { usedBytes, percent, limit, fileCount },
  services: { total, running, stopped, failed }
}
```

#### `Alert`
```javascript
{
  type: String,              // cpu_high, memory_high, disk_high, service_down...
  severity: String,          // info, warning, error, critical
  message: String,
  data: Mixed,
  site: ObjectId,            // Optionnel
  service: ObjectId,         // Optionnel
  status: String,            // active, acknowledged, resolved
  acknowledgedBy: ObjectId,
  createdAt: Date,
  resolvedAt: Date           // TTL 7 jours après résolution
}
```

#### `MonitoringConfig`
```javascript
{
  _id: 'monitoring_config',  // Singleton
  collectionInterval: 30,    // Secondes
  alertThresholds: {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 75, critical: 90 },
    disk: { warning: 80, critical: 95 }
  },
  alertsEnabled: true,
  siteStatsEnabled: true,
  retentionHours: 24
}
```

## 🎨 Frontend

### Admin Panel - StatsPage

**Onglets:**
- **Vue d'ensemble**: CPU, RAM, Disque, Uptime, graphiques temps réel, compteurs plateforme
- **Sites**: Liste expandable avec stats par site et services
- **Alertes**: Gestion des alertes avec acquittement/résolution

**Fonctionnalités:**
- Auto-refresh configurable (5s, 10s, 30s, 60s)
- Graphiques historiques (30 dernières minutes)
- Indicateur d'alertes actives dans le header
- Expansion des détails de chaque site
- Affichage services avec PID, RAM, uptime

### User Panel - StatsPage

**Vue:**
- Stats du site assigné uniquement
- Services avec contrôles (start/stop/restart)
- Alertes du site
- Graphique d'utilisation (1h)
- Informations: domaines, ports, fichiers

**Fonctionnalités:**
- Auto-refresh 15s
- Actions sur services (selon permissions)
- Acquittement des alertes

## 🔐 Sécurité

### Permissions

| Ressource | Admin | User | Readonly |
|-----------|-------|------|----------|
| Stats serveur | ✅ | ❌ | ❌ |
| Stats tous sites | ✅ | ❌ | ❌ |
| Stats site assigné | ✅ | ✅ | ✅ |
| Services site | ✅ | ✅ | ✅ (lecture) |
| Actions services | ✅ | ✅ | ❌ |
| Alertes globales | ✅ | ❌ | ❌ |
| Alertes site | ✅ | ✅ | ✅ |
| Acquitter alerte | ✅ | ✅ | ❌ |
| Résoudre alerte | ✅ | ❌ | ❌ |
| Config monitoring | ✅ | ❌ | ❌ |

### Validation

- JWT obligatoire sur toutes les routes
- Vérification rôle via middleware
- Filtrage par site assigné pour les users
- Pas d'exposition de données système brutes aux non-admins
- Noms de services validés (pattern `twoine-*`)

### WebSocket

- Token JWT requis à la connexion (`/ws?token=...`)
- Vérification utilisateur actif et non bloqué
- Abonnements limités aux ressources autorisées
- Heartbeat pour détecter connexions mortes

## 📊 Données supervisées

### Niveau Serveur (Admin uniquement)

| Métrique | Source | Fréquence |
|----------|--------|-----------|
| CPU % | /proc/stat | 30s |
| CPU cores | os.cpus() | Au démarrage |
| Load average | os.loadavg() | 30s |
| RAM utilisée | /proc/meminfo | 30s |
| RAM totale | os.totalmem() | Au démarrage |
| Disque % | df | 30s |
| Uptime | os.uptime() | 30s |
| Processus | ps | 30s |
| Réseau I/O | /proc/net/dev | 30s |
| Sites total | MongoDB count | 30s |
| Services total | MongoDB count | 30s |
| Users total | MongoDB count | 30s |

### Niveau Site (Admin + User assigné)

| Métrique | Source | Fréquence |
|----------|--------|-----------|
| CPU % site | ps -u <user> | 30s |
| RAM site | ps -u <user> | 30s |
| Disque site | du -sb | 30s |
| Fichiers count | find \| wc -l | 30s |
| Services running | MongoDB + systemctl | 30s |
| Domaines liés | MongoDB | À la demande |
| Ports range | MongoDB | À la demande |

### Niveau Service (Admin + User assigné)

| Métrique | Source | Fréquence |
|----------|--------|-----------|
| État (active/inactive) | systemctl is-active | À la demande |
| PID | systemctl show | À la demande |
| Uptime | ActiveEnterTimestamp | À la demande |
| RAM | MemoryCurrent | À la demande |
| CPU time | CPUUsageNSec | À la demande |
| Restarts count | NRestarts | À la demande |

## ⚡ Performance

### Optimisations

1. **Cache en mémoire**: Dernières stats serveur/site en cache (5-10s)
2. **Batch queries**: Collecte parallèle de plusieurs métriques
3. **TTL MongoDB**: Suppression automatique après 24h
4. **Limite historique**: Max 200 points par requête
5. **WebSocket**: Push uniquement aux abonnés

### Recommandations

- Intervalle collecte: 30s (défaut) - ajustable 10-300s
- Ne pas descendre sous 10s en production
- Surveiller l'usage MongoDB si beaucoup de sites

## ⚠️ Alertes

### Types d'alertes

| Type | Seuils par défaut | Sévérité |
|------|-------------------|----------|
| `cpu_high` | 70% warning, 90% critical | warning/critical |
| `memory_high` | 75% warning, 90% critical | warning/critical |
| `disk_high` | 80% warning, 95% critical | warning/critical |
| `service_down` | Service arrêté | error |
| `site_down` | Tous services arrêtés | critical |

### Cycle de vie

1. **Active**: Alerte créée, visible et notifications
2. **Acknowledged**: Alerte vue par un admin/user, reste visible
3. **Resolved**: Alerte fermée, supprimée après 7 jours

### Déduplication

- Pas de doublon si alerte similaire < 5 minutes
- Basé sur: type + severity + site + service

## 🔌 Intégration WebSocket

### Connexion client

```javascript
const token = localStorage.getItem('accessToken');
const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);

ws.onopen = () => {
  // S'abonner aux stats serveur (admin)
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'server' }));
  
  // S'abonner à un site
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'site', siteId: '...' }));
  
  // S'abonner aux alertes
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'alerts' }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'serverStats':
      // Mise à jour stats serveur
      break;
    case 'siteStats':
      // Mise à jour stats site
      break;
    case 'alert':
      // Nouvelle alerte
      break;
    case 'serviceStatus':
      // Changement état service
      break;
  }
};
```

## 🚀 Démarrage

### Initialisation dans l'application

```javascript
// server.js ou app.js
const { statsService, webSocketService } = require('./services');

// Après connexion MongoDB
await statsService.initialize();

// Après création du serveur HTTP
webSocketService.initialize(server);
webSocketService.startHeartbeat();

// Démarrer la collecte
statsService.startCollection();

// Connecter les événements
statsService.on('serverStats', (stats) => {
  webSocketService.broadcastServerStats(stats);
});

statsService.on('siteStats', ({ siteId, stats }) => {
  webSocketService.broadcastSiteStats(siteId, stats);
});

statsService.on('alert', (alert) => {
  webSocketService.broadcastAlert(alert);
});
```

## 📝 Limites

- **Mono-serveur**: Pas de support multi-serveur
- **Pas d'agent externe**: Tout est collecté localement
- **Historique 24h**: Pas de stockage long terme
- **Pas de métriques applicatives**: Uniquement système
- **Requêtes/visiteurs**: Non implémenté (nécessiterait parsing logs nginx)

## 🔧 Configuration

Variables d'environnement optionnelles:

```bash
# Répertoire des sites
SITES_DIR=/var/www/sites

# Secret JWT (pour WebSocket auth)
JWT_SECRET=your-secret-key
```

Configuration via API (`PUT /stats/config`):

```json
{
  "collectionInterval": 30,
  "alertThresholds": {
    "cpu": { "warning": 70, "critical": 90 },
    "memory": { "warning": 75, "critical": 90 },
    "disk": { "warning": 80, "critical": 95 }
  },
  "alertsEnabled": true,
  "siteStatsEnabled": true,
  "retentionHours": 24
}
```
