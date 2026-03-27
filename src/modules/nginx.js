/**
 * Module de gestion Nginx - Reverse Proxy
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH } from '../config/constants.js';
import projects from './projects.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';

const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';

/**
 * Ajoute une configuration reverse proxy à un projet
 * @param {string} projectName - Nom du projet
 * @param {object} proxyConfig - Configuration du proxy
 * @returns {object} - Configuration créée
 */
export function addProxy(projectName, proxyConfig) {
    const { name, domain, targetPort, targetHost, ssl } = proxyConfig;

    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
        throw new Error('Le nom du proxy doit commencer par une lettre et ne contenir que des lettres, chiffres, tirets et underscores');
    }

    const projectConfig = projects.loadProjectConfig(projectName);

    if (!projectConfig.proxies) {
        projectConfig.proxies = [];
    }

    if (projectConfig.proxies.some(p => p.name === name)) {
        throw new Error(`Le proxy ${name} existe déjà dans ce projet`);
    }

    if (projectConfig.proxies.some(p => p.domain === domain)) {
        throw new Error(`Le domaine ${domain} est déjà utilisé dans ce projet`);
    }

    const proxy = {
        name,
        domain,
        targetHost: targetHost || 'localhost',
        targetPort,
        ssl: ssl || false,
        createdAt: new Date().toISOString()
    };

    projectConfig.proxies.push(proxy);
    projects.saveProjectConfig(projectName, projectConfig);

    logger.success(`Proxy ${name} ajouté au projet ${projectName}`);
    return proxy;
}

/**
 * Supprime une configuration proxy
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @returns {Promise<void>}
 */
export async function removeProxy(projectName, proxyName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    const proxyIndex = projectConfig.proxies?.findIndex(p => p.name === proxyName);

    if (proxyIndex === -1 || proxyIndex === undefined) {
        throw new Error(`Le proxy ${proxyName} n'existe pas dans ce projet`);
    }

    const proxy = projectConfig.proxies[proxyIndex];

    try {
        await disableProxy(projectName, proxyName);
    } catch {
        // Ignorer si le proxy n'est pas activé
    }

    projectConfig.proxies.splice(proxyIndex, 1);
    projects.saveProjectConfig(projectName, projectConfig);

    logger.success(`Proxy ${proxyName} supprimé du projet ${projectName}`);
}

/**
 * Met à jour une configuration proxy
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @param {object} updates - Mises à jour
 * @returns {object}
 */
export function updateProxy(projectName, proxyName, updates) {
    const projectConfig = projects.loadProjectConfig(projectName);
    const proxyIndex = projectConfig.proxies?.findIndex(p => p.name === proxyName);

    if (proxyIndex === -1 || proxyIndex === undefined) {
        throw new Error(`Le proxy ${proxyName} n'existe pas dans ce projet`);
    }

    const proxy = projectConfig.proxies[proxyIndex];

    if (updates.domain) {
        if (projectConfig.proxies.some((p, idx) => p.domain === updates.domain && idx !== proxyIndex)) {
            throw new Error(`Le domaine ${updates.domain} est déjà utilisé`);
        }
        proxy.domain = updates.domain;
    }

    if (updates.targetHost !== undefined) {
        proxy.targetHost = updates.targetHost;
    }

    if (updates.targetPort !== undefined) {
        proxy.targetPort = updates.targetPort;
    }

    if (updates.ssl !== undefined) {
        proxy.ssl = updates.ssl;
    }

    proxy.updatedAt = new Date().toISOString();

    projects.saveProjectConfig(projectName, projectConfig);
    logger.success(`Proxy ${proxyName} mis à jour`);

    return proxy;
}

/**
 * Récupère une configuration proxy
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @returns {object|null}
 */
export function getProxy(projectName, proxyName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    return projectConfig.proxies?.find(p => p.name === proxyName) || null;
}

/**
 * Liste tous les proxies d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {Array}
 */
export function listProxies(projectName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    return projectConfig.proxies || [];
}

/**
 * Génère la configuration Nginx pour un proxy
 * @param {string} projectName - Nom du projet
 * @param {object} proxy - Configuration du proxy
 * @returns {string}
 */
function generateNginxConfig(projectName, proxy) {
    const configName = `${projectName}-${proxy.name}`;
    const upstream = `${proxy.targetHost}:${proxy.targetPort}`;

    let config = `# Reverse proxy pour ${projectName} - ${proxy.name}
# Généré automatiquement par Twoine

upstream ${configName}_backend {
    server ${upstream};
}

server {
    listen 80;
    server_name ${proxy.domain};

    access_log /var/log/nginx/${configName}_access.log;
    error_log /var/log/nginx/${configName}_error.log;

    location / {
        proxy_pass http://${configName}_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;

    if (proxy.ssl) {
        config += `
# Configuration SSL (à configurer avec certbot)
# Exécutez: sudo certbot --nginx -d ${proxy.domain}
`;
    }

    return config;
}

/**
 * Active un proxy (crée et active la configuration Nginx)
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @returns {Promise<void>}
 */
export async function enableProxy(projectName, proxyName) {
    const proxy = getProxy(projectName, proxyName);

    if (!proxy) {
        throw new Error(`Le proxy ${proxyName} n'existe pas`);
    }

    const configName = `${projectName}-${proxy.name}`;
    const availablePath = path.join(NGINX_SITES_AVAILABLE, configName);
    const enabledPath = path.join(NGINX_SITES_ENABLED, configName);

    const nginxConfig = generateNginxConfig(projectName, proxy);

    logger.info(`Création de la configuration Nginx pour ${proxyName}...`);
    fs.writeFileSync(availablePath, nginxConfig, 'utf8');

    if (!fs.existsSync(enabledPath)) {
        fs.symlinkSync(availablePath, enabledPath);
    }

    logger.info('Test de la configuration Nginx...');
    await shell.execCommand('nginx -t');

    logger.info('Rechargement de Nginx...');
    await shell.execCommand('systemctl reload nginx');

    logger.success(`Proxy ${proxyName} activé (${proxy.domain} → ${proxy.targetHost}:${proxy.targetPort})`);
}

/**
 * Désactive un proxy (supprime le lien symbolique)
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @returns {Promise<void>}
 */
export async function disableProxy(projectName, proxyName) {
    const proxy = getProxy(projectName, proxyName);

    if (!proxy) {
        throw new Error(`Le proxy ${proxyName} n'existe pas`);
    }

    const configName = `${projectName}-${proxy.name}`;
    const enabledPath = path.join(NGINX_SITES_ENABLED, configName);

    if (fs.existsSync(enabledPath)) {
        fs.unlinkSync(enabledPath);
    }

    logger.info('Rechargement de Nginx...');
    await shell.execCommand('systemctl reload nginx');

    logger.success(`Proxy ${proxyName} désactivé`);
}

/**
 * Vérifie si un proxy est activé
 * @param {string} projectName - Nom du projet
 * @param {string} proxyName - Nom du proxy
 * @returns {boolean}
 */
export function isProxyEnabled(projectName, proxyName) {
    const proxy = getProxy(projectName, proxyName);

    if (!proxy) {
        return false;
    }

    const configName = `${projectName}-${proxy.name}`;
    const enabledPath = path.join(NGINX_SITES_ENABLED, configName);

    return fs.existsSync(enabledPath);
}

/**
 * Récupère le statut de tous les proxies d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {Array}
 */
export function getAllProxiesStatus(projectName) {
    const proxies = listProxies(projectName);
    
    return proxies.map(proxy => ({
        ...proxy,
        enabled: isProxyEnabled(projectName, proxy.name)
    }));
}

export default {
    addProxy,
    removeProxy,
    updateProxy,
    getProxy,
    listProxies,
    enableProxy,
    disableProxy,
    isProxyEnabled,
    getAllProxiesStatus
};
