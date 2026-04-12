/**
 * Module de gestion des clés API pour l'accès aux modèles IA
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TOOL_CONFIG_PATH } from '../config/constants.js';
import projects from './projects.js';
import logger from '../utils/logger.js';

const API_KEYS_CONFIG_FILE = path.join(TOOL_CONFIG_PATH, 'api-keys.json');

/**
 * Initialise le fichier de configuration des clés API
 */
export function initApiKeysConfig() {
    if (!fs.existsSync(API_KEYS_CONFIG_FILE)) {
        fs.writeFileSync(API_KEYS_CONFIG_FILE, JSON.stringify({ keys: [] }, null, 2));
        logger.debug(`Fichier de configuration des clés API créé: ${API_KEYS_CONFIG_FILE}`);
    }
}

/**
 * Charge la configuration des clés API
 * @returns {object}
 */
export function loadApiKeys() {
    try {
        initApiKeysConfig();
        const data = fs.readFileSync(API_KEYS_CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Erreur lors du chargement des clés API: ${error.message}`);
        return { keys: [] };
    }
}

/**
 * Sauvegarde la configuration des clés API
 * @param {object} config
 */
export function saveApiKeys(config) {
    try {
        initApiKeysConfig();
        fs.writeFileSync(API_KEYS_CONFIG_FILE, JSON.stringify(config, null, 2));
        logger.debug('Configuration des clés API sauvegardée');
    } catch (error) {
        throw new Error(`Erreur lors de la sauvegarde: ${error.message}`);
    }
}

/**
 * Génère une clé API unique
 * @returns {string}
 */
function generateApiKey() {
    const randomBytes = crypto.randomBytes(32);
    const key = randomBytes.toString('hex');
    return `twn_${key}`;
}

/**
 * Crée une nouvelle clé API
 * @param {object} config - Configuration de la clé
 * @returns {object}
 */
export function createApiKey(config) {
    const { name, modelName, projects: projectsList, requestsPerMinute, createdBy } = config;

    if (!name || !modelName) {
        throw new Error('Le nom et le modèle sont requis');
    }

    // Vérifier que les projets existent
    if (projectsList && projectsList.length > 0) {
        for (const projectName of projectsList) {
            if (!projects.projectExists(projectName)) {
                throw new Error(`Le projet ${projectName} n'existe pas`);
            }
        }
    }

    const apiKeysConfig = loadApiKeys();

    // Vérifier si le nom existe déjà
    if (apiKeysConfig.keys.find(k => k.name === name)) {
        throw new Error(`Une clé API avec le nom ${name} existe déjà`);
    }

    const apiKey = {
        id: `apikey_${Date.now()}`,
        name,
        key: generateApiKey(),
        modelName,
        projects: projectsList || [],
        limits: {
            requestsPerMinute: requestsPerMinute || 10
        },
        status: 'active',
        createdBy: createdBy || 'admin',
        createdAt: new Date().toISOString(),
        usage: []
    };

    apiKeysConfig.keys.push(apiKey);
    saveApiKeys(apiKeysConfig);

    logger.info(`Clé API créée: ${name}`);
    return apiKey;
}

/**
 * Liste toutes les clés API
 * @param {string|null} projectName - Filtrer par projet (optionnel)
 * @returns {Array}
 */
export function getAllApiKeys(projectName = null) {
    const config = loadApiKeys();
    
    if (!projectName) {
        return config.keys;
    }

    return config.keys.filter(key => 
        key.projects.includes(projectName)
    );
}

/**
 * Récupère une clé API par son ID
 * @param {string} id
 * @returns {object|null}
 */
export function getApiKeyById(id) {
    const config = loadApiKeys();
    return config.keys.find(k => k.id === id) || null;
}

/**
 * Récupère une clé API par sa valeur
 * @param {string} key
 * @returns {object|null}
 */
export function getApiKeyByValue(key) {
    const config = loadApiKeys();
    return config.keys.find(k => k.key === key) || null;
}

/**
 * Met à jour une clé API
 * @param {string} id
 * @param {object} updates
 * @returns {object}
 */
export function updateApiKey(id, updates) {
    const config = loadApiKeys();
    const index = config.keys.findIndex(k => k.id === id);

    if (index === -1) {
        throw new Error('Clé API non trouvée');
    }

    const allowedUpdates = ['name', 'modelName', 'projects', 'limits', 'status'];
    const filteredUpdates = {};

    for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
            filteredUpdates[key] = updates[key];
        }
    }

    // Vérifier que les projets existent
    if (filteredUpdates.projects) {
        for (const projectName of filteredUpdates.projects) {
            if (!projects.projectExists(projectName)) {
                throw new Error(`Le projet ${projectName} n'existe pas`);
            }
        }
    }

    config.keys[index] = { ...config.keys[index], ...filteredUpdates };
    saveApiKeys(config);

    logger.info(`Clé API mise à jour: ${id}`);
    return config.keys[index];
}

/**
 * Supprime une clé API
 * @param {string} id
 */
export function deleteApiKey(id) {
    const config = loadApiKeys();
    const index = config.keys.findIndex(k => k.id === id);

    if (index === -1) {
        throw new Error('Clé API non trouvée');
    }

    const deletedKey = config.keys[index];
    config.keys.splice(index, 1);
    saveApiKeys(config);

    logger.info(`Clé API supprimée: ${deletedKey.name}`);
}

/**
 * Régénère une clé API
 * @param {string} id
 * @returns {object}
 */
export function regenerateApiKey(id) {
    const config = loadApiKeys();
    const index = config.keys.findIndex(k => k.id === id);

    if (index === -1) {
        throw new Error('Clé API non trouvée');
    }

    config.keys[index].key = generateApiKey();
    config.keys[index].usage = [];
    saveApiKeys(config);

    logger.info(`Clé API régénérée: ${id}`);
    return config.keys[index];
}

/**
 * Enregistre l'utilisation d'une clé API
 * @param {string} key
 * @param {object} usageData
 */
export function recordUsage(key, usageData) {
    const config = loadApiKeys();
    const apiKey = config.keys.find(k => k.key === key);

    if (!apiKey) {
        return;
    }

    const usage = {
        timestamp: new Date().toISOString(),
        ...usageData
    };

    apiKey.usage.push(usage);

    // Garder seulement les 1000 dernières utilisations
    if (apiKey.usage.length > 1000) {
        apiKey.usage = apiKey.usage.slice(-1000);
    }

    saveApiKeys(config);
}

/**
 * Vérifie le rate limit d'une clé API
 * @param {string} key
 * @returns {boolean}
 */
export function checkRateLimit(key) {
    const apiKey = getApiKeyByValue(key);
    
    if (!apiKey) {
        return false;
    }

    if (apiKey.status !== 'active') {
        return false;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentRequests = apiKey.usage.filter(u => {
        const usageTime = new Date(u.timestamp).getTime();
        return usageTime > oneMinuteAgo;
    });

    return recentRequests.length < apiKey.limits.requestsPerMinute;
}

/**
 * Récupère l'historique d'utilisation d'une clé API
 * @param {string} id
 * @param {number} limit
 * @returns {Array}
 */
export function getUsageHistory(id, limit = 100) {
    const apiKey = getApiKeyById(id);
    
    if (!apiKey) {
        throw new Error('Clé API non trouvée');
    }

    return apiKey.usage.slice(-limit).reverse();
}

export default {
    createApiKey,
    getAllApiKeys,
    getApiKeyById,
    getApiKeyByValue,
    updateApiKey,
    deleteApiKey,
    regenerateApiKey,
    recordUsage,
    checkRateLimit,
    getUsageHistory
};
