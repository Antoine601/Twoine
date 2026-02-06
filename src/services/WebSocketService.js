/**
 * TWOINE - WebSocket Service
 * Gestion des connexions WebSocket pour le temps réel
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Site = require('../models/Site');

const JWT_SECRET = process.env.JWT_SECRET || 'twoine-secret-key-change-in-production';

/**
 * Service de gestion des WebSockets
 */
class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // userId -> Set<WebSocket>
        this.adminClients = new Set(); // WebSocket connections d'admins
        this.siteSubscriptions = new Map(); // siteId -> Set<WebSocket>
    }

    /**
     * Initialise le serveur WebSocket
     * @param {http.Server} server - Serveur HTTP
     */
    initialize(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws',
            verifyClient: this.verifyClient.bind(this),
        });

        this.wss.on('connection', this.handleConnection.bind(this));

        console.log('[WebSocketService] Initialized on /ws');
    }

    /**
     * Vérifie le client avant connexion
     * @param {Object} info 
     * @param {Function} callback 
     */
    async verifyClient(info, callback) {
        try {
            const url = new URL(info.req.url, 'ws://localhost');
            const token = url.searchParams.get('token');

            if (!token) {
                callback(false, 401, 'No token provided');
                return;
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.userId).lean();

            if (!user || user.status === 'blocked') {
                callback(false, 403, 'User not found or blocked');
                return;
            }

            // Stocker les infos utilisateur pour la connexion
            info.req.user = {
                id: user._id.toString(),
                role: user.role,
                sites: user.sites?.map(s => s.site.toString()) || [],
            };

            callback(true);
        } catch (error) {
            console.error('[WebSocketService] Auth error:', error.message);
            callback(false, 401, 'Invalid token');
        }
    }

    /**
     * Gère une nouvelle connexion WebSocket
     * @param {WebSocket} ws 
     * @param {http.IncomingMessage} req 
     */
    handleConnection(ws, req) {
        const user = req.user;
        if (!user) {
            ws.close(1008, 'No user info');
            return;
        }

        ws.userId = user.id;
        ws.userRole = user.role;
        ws.userSites = user.sites;
        ws.isAlive = true;
        ws.subscribedSites = new Set();

        // Ajouter aux clients
        if (!this.clients.has(user.id)) {
            this.clients.set(user.id, new Set());
        }
        this.clients.get(user.id).add(ws);

        // Si admin, ajouter à la liste admin
        if (user.role === 'admin') {
            this.adminClients.add(ws);
        }

        console.log(`[WebSocketService] Client connected: ${user.id} (${user.role})`);

        // Gérer les messages
        ws.on('message', (data) => this.handleMessage(ws, data));

        // Heartbeat
        ws.on('pong', () => { ws.isAlive = true; });

        // Déconnexion
        ws.on('close', () => this.handleDisconnect(ws));

        // Erreur
        ws.on('error', (error) => {
            console.error(`[WebSocketService] Client error:`, error.message);
        });

        // Envoyer confirmation de connexion
        this.send(ws, {
            type: 'connected',
            data: {
                userId: user.id,
                role: user.role,
            },
        });
    }

    /**
     * Gère un message entrant
     * @param {WebSocket} ws 
     * @param {Buffer} data 
     */
    handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscribe(ws, message);
                    break;

                case 'unsubscribe':
                    this.handleUnsubscribe(ws, message);
                    break;

                case 'ping':
                    this.send(ws, { type: 'pong' });
                    break;

                default:
                    console.log(`[WebSocketService] Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('[WebSocketService] Message parse error:', error.message);
        }
    }

    /**
     * Gère une demande d'abonnement
     * @param {WebSocket} ws 
     * @param {Object} message 
     */
    handleSubscribe(ws, message) {
        const { channel, siteId } = message;

        if (channel === 'server' && ws.userRole === 'admin') {
            // Admin uniquement pour les stats serveur
            ws.subscribedToServer = true;
            this.send(ws, { type: 'subscribed', channel: 'server' });
        } else if (channel === 'site' && siteId) {
            // Vérifier accès au site
            if (ws.userRole !== 'admin' && !ws.userSites.includes(siteId)) {
                this.send(ws, { type: 'error', message: 'Access denied to site' });
                return;
            }

            // Ajouter à la subscription
            if (!this.siteSubscriptions.has(siteId)) {
                this.siteSubscriptions.set(siteId, new Set());
            }
            this.siteSubscriptions.get(siteId).add(ws);
            ws.subscribedSites.add(siteId);

            this.send(ws, { type: 'subscribed', channel: 'site', siteId });
        } else if (channel === 'alerts') {
            ws.subscribedToAlerts = true;
            this.send(ws, { type: 'subscribed', channel: 'alerts' });
        }
    }

    /**
     * Gère une demande de désabonnement
     * @param {WebSocket} ws 
     * @param {Object} message 
     */
    handleUnsubscribe(ws, message) {
        const { channel, siteId } = message;

        if (channel === 'server') {
            ws.subscribedToServer = false;
            this.send(ws, { type: 'unsubscribed', channel: 'server' });
        } else if (channel === 'site' && siteId) {
            if (this.siteSubscriptions.has(siteId)) {
                this.siteSubscriptions.get(siteId).delete(ws);
            }
            ws.subscribedSites.delete(siteId);
            this.send(ws, { type: 'unsubscribed', channel: 'site', siteId });
        } else if (channel === 'alerts') {
            ws.subscribedToAlerts = false;
            this.send(ws, { type: 'unsubscribed', channel: 'alerts' });
        }
    }

    /**
     * Gère la déconnexion d'un client
     * @param {WebSocket} ws 
     */
    handleDisconnect(ws) {
        // Retirer des clients
        if (ws.userId && this.clients.has(ws.userId)) {
            this.clients.get(ws.userId).delete(ws);
            if (this.clients.get(ws.userId).size === 0) {
                this.clients.delete(ws.userId);
            }
        }

        // Retirer des admins
        this.adminClients.delete(ws);

        // Retirer des subscriptions de sites
        for (const siteId of ws.subscribedSites || []) {
            if (this.siteSubscriptions.has(siteId)) {
                this.siteSubscriptions.get(siteId).delete(ws);
            }
        }

        console.log(`[WebSocketService] Client disconnected: ${ws.userId}`);
    }

    /**
     * Envoie un message à un client
     * @param {WebSocket} ws 
     * @param {Object} data 
     */
    send(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    /**
     * Broadcast les stats serveur aux admins abonnés
     * @param {Object} stats 
     */
    broadcastServerStats(stats) {
        const message = {
            type: 'serverStats',
            data: stats,
            timestamp: new Date().toISOString(),
        };

        for (const ws of this.adminClients) {
            if (ws.subscribedToServer && ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        }
    }

    /**
     * Broadcast les stats d'un site aux abonnés
     * @param {string} siteId 
     * @param {Object} stats 
     */
    broadcastSiteStats(siteId, stats) {
        const subscribers = this.siteSubscriptions.get(siteId);
        if (!subscribers || subscribers.size === 0) return;

        const message = {
            type: 'siteStats',
            siteId,
            data: stats,
            timestamp: new Date().toISOString(),
        };

        for (const ws of subscribers) {
            if (ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        }
    }

    /**
     * Broadcast une alerte aux utilisateurs concernés
     * @param {Object} alert 
     */
    broadcastAlert(alert) {
        const message = {
            type: 'alert',
            data: alert,
            timestamp: new Date().toISOString(),
        };

        // Toujours envoyer aux admins
        for (const ws of this.adminClients) {
            if (ws.subscribedToAlerts && ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        }

        // Si l'alerte concerne un site, envoyer aux utilisateurs du site
        if (alert.site?.id) {
            const siteId = alert.site.id.toString();
            const subscribers = this.siteSubscriptions.get(siteId);
            
            if (subscribers) {
                for (const ws of subscribers) {
                    if (ws.subscribedToAlerts && ws.readyState === WebSocket.OPEN) {
                        this.send(ws, message);
                    }
                }
            }
        }
    }

    /**
     * Broadcast un changement d'état de service
     * @param {string} siteId 
     * @param {Object} service 
     */
    broadcastServiceStatus(siteId, service) {
        const subscribers = this.siteSubscriptions.get(siteId);
        if (!subscribers || subscribers.size === 0) return;

        const message = {
            type: 'serviceStatus',
            siteId,
            data: service,
            timestamp: new Date().toISOString(),
        };

        for (const ws of subscribers) {
            if (ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        }

        // Aussi aux admins
        for (const ws of this.adminClients) {
            if (ws.readyState === WebSocket.OPEN) {
                this.send(ws, message);
            }
        }
    }

    /**
     * Envoie un message à un utilisateur spécifique
     * @param {string} userId 
     * @param {Object} data 
     */
    sendToUser(userId, data) {
        const userClients = this.clients.get(userId);
        if (!userClients) return;

        for (const ws of userClients) {
            this.send(ws, data);
        }
    }

    /**
     * Démarre le heartbeat pour détecter les connexions mortes
     */
    startHeartbeat() {
        setInterval(() => {
            if (!this.wss) return;

            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    /**
     * Obtient les statistiques du service WebSocket
     * @returns {Object}
     */
    getStats() {
        return {
            totalConnections: this.wss?.clients?.size || 0,
            uniqueUsers: this.clients.size,
            adminConnections: this.adminClients.size,
            siteSubscriptions: Object.fromEntries(
                Array.from(this.siteSubscriptions.entries())
                    .map(([siteId, clients]) => [siteId, clients.size])
            ),
        };
    }
}

// Export singleton
const webSocketService = new WebSocketService();

module.exports = {
    WebSocketService,
    webSocketService,
};
