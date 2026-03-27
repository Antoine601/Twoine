/**
 * Module de gestion des configurations Nginx
 */

import fs from 'fs';
import path from 'path';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';

const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
const NGINX_CONFIGS_DIR = '/etc/nodejs-project-manager/nginx';

/**
 * Initialiser le dossier de configuration Nginx
 */
function initNginxConfigDir() {
    if (!fs.existsSync(NGINX_CONFIGS_DIR)) {
        fs.mkdirSync(NGINX_CONFIGS_DIR, { recursive: true });
    }
}

/**
 * Charger toutes les configurations Nginx
 */
function loadNginxConfigs() {
    initNginxConfigDir();
    const configFile = path.join(NGINX_CONFIGS_DIR, 'configs.json');
    
    if (!fs.existsSync(configFile)) {
        return [];
    }
    
    try {
        const data = fs.readFileSync(configFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Erreur lors du chargement des configs Nginx: ${error.message}`);
        return [];
    }
}

/**
 * Sauvegarder les configurations Nginx
 */
function saveNginxConfigs(configs) {
    initNginxConfigDir();
    const configFile = path.join(NGINX_CONFIGS_DIR, 'configs.json');
    fs.writeFileSync(configFile, JSON.stringify(configs, null, 2));
}

/**
 * Générer un nom de fichier de configuration
 */
function getConfigFileName(domain) {
    return domain.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/**
 * Générer le contenu d'une configuration Nginx
 */
function generateNginxConfig(domain, port, options = {}) {
    const {
        useSSL = false,
        sslCertPath = '',
        sslKeyPath = '',
        redirectHTTP = false,
        targetHost = 'localhost',
        targetProtocol = 'http'
    } = options;

    let config = '';

    // Configuration HTTPS si SSL activé
    if (useSSL) {
        config += `server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate     ${sslCertPath};
    ssl_certificate_key ${sslKeyPath};

    location / {
        proxy_pass ${targetProtocol}://${targetHost}:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

`;

        // Redirection HTTP vers HTTPS si activée
        if (redirectHTTP) {
            config += `server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}
`;
        }
    } else {
        // Configuration HTTP simple
        config += `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass ${targetProtocol}://${targetHost}:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
    }

    return config;
}

/**
 * Créer une nouvelle configuration Nginx
 */
async function createNginxConfig(domain, port, description = '', options = {}) {
    if (!domain || !port) {
        throw new Error('Domaine et port requis');
    }

    const configs = loadNginxConfigs();
    
    // Vérifier si le domaine existe déjà
    if (configs.find(c => c.domain === domain)) {
        throw new Error(`Une configuration existe déjà pour ${domain}`);
    }

    const fileName = getConfigFileName(domain);
    const availablePath = path.join(NGINX_SITES_AVAILABLE, fileName);
    const enabledPath = path.join(NGINX_SITES_ENABLED, fileName);

    // Générer et écrire la configuration
    const configContent = generateNginxConfig(domain, port, options);
    fs.writeFileSync(availablePath, configContent);

    // Créer le lien symbolique pour activer
    if (fs.existsSync(enabledPath)) {
        fs.unlinkSync(enabledPath);
    }
    fs.symlinkSync(availablePath, enabledPath);

    // Tester la configuration Nginx
    try {
        await shell.execCommand('nginx -t');
    } catch (error) {
        // Rollback en cas d'erreur
        fs.unlinkSync(availablePath);
        if (fs.existsSync(enabledPath)) {
            fs.unlinkSync(enabledPath);
        }
        throw new Error(`Configuration Nginx invalide: ${error.message}`);
    }

    // Recharger Nginx
    await shell.execCommand('systemctl reload nginx');

    // Sauvegarder dans notre index
    const newConfig = {
        id: Date.now().toString(),
        domain,
        port: parseInt(port),
        description,
        fileName,
        createdAt: new Date().toISOString(),
        enabled: true,
        useSSL: options.useSSL || false,
        sslCertPath: options.sslCertPath || '',
        sslKeyPath: options.sslKeyPath || '',
        redirectHTTP: options.redirectHTTP || false,
        targetHost: options.targetHost || 'localhost',
        targetProtocol: options.targetProtocol || 'http'
    };

    configs.push(newConfig);
    saveNginxConfigs(configs);

    const target = `${options.targetProtocol || 'http'}://${options.targetHost || 'localhost'}:${port}`;
    logger.info(`Configuration Nginx créée: ${domain} -> ${target}`);
    return newConfig;
}

/**
 * Lister toutes les configurations
 */
function listNginxConfigs() {
    return loadNginxConfigs();
}

/**
 * Obtenir une configuration par ID
 */
function getNginxConfig(id) {
    const configs = loadNginxConfigs();
    return configs.find(c => c.id === id);
}

/**
 * Lire le contenu d'un fichier de configuration
 */
function readNginxConfigFile(id) {
    const config = getNginxConfig(id);
    if (!config) {
        throw new Error('Configuration non trouvée');
    }

    const filePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    if (!fs.existsSync(filePath)) {
        throw new Error('Fichier de configuration non trouvé');
    }

    return fs.readFileSync(filePath, 'utf8');
}

/**
 * Mettre à jour le contenu d'un fichier de configuration
 */
async function updateNginxConfigFile(id, content) {
    const config = getNginxConfig(id);
    if (!config) {
        throw new Error('Configuration non trouvée');
    }

    const filePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    
    // Sauvegarder l'ancien contenu pour rollback
    const oldContent = fs.readFileSync(filePath, 'utf8');
    
    try {
        // Écrire le nouveau contenu
        fs.writeFileSync(filePath, content);
        
        // Tester la configuration
        await shell.execCommand('nginx -t');
        
        // Recharger Nginx
        await shell.execCommand('systemctl reload nginx');
        
        logger.info(`Configuration Nginx mise à jour: ${config.domain}`);
        return true;
    } catch (error) {
        // Rollback en cas d'erreur
        fs.writeFileSync(filePath, oldContent);
        throw new Error(`Erreur lors de la mise à jour: ${error.message}`);
    }
}

/**
 * Supprimer une configuration
 */
async function deleteNginxConfig(id) {
    const configs = loadNginxConfigs();
    const config = configs.find(c => c.id === id);
    
    if (!config) {
        throw new Error('Configuration non trouvée');
    }

    const availablePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    const enabledPath = path.join(NGINX_SITES_ENABLED, config.fileName);

    // Supprimer les fichiers
    if (fs.existsSync(enabledPath)) {
        fs.unlinkSync(enabledPath);
    }
    if (fs.existsSync(availablePath)) {
        fs.unlinkSync(availablePath);
    }

    // Recharger Nginx
    await shell.execCommand('systemctl reload nginx');

    // Mettre à jour l'index
    const updatedConfigs = configs.filter(c => c.id !== id);
    saveNginxConfigs(updatedConfigs);

    logger.info(`Configuration Nginx supprimée: ${config.domain}`);
    return true;
}

/**
 * Activer/Désactiver une configuration
 */
async function toggleNginxConfig(id, enabled) {
    const configs = loadNginxConfigs();
    const config = configs.find(c => c.id === id);
    
    if (!config) {
        throw new Error('Configuration non trouvée');
    }

    const availablePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    const enabledPath = path.join(NGINX_SITES_ENABLED, config.fileName);

    if (enabled) {
        // Activer
        if (!fs.existsSync(enabledPath)) {
            fs.symlinkSync(availablePath, enabledPath);
        }
    } else {
        // Désactiver
        if (fs.existsSync(enabledPath)) {
            fs.unlinkSync(enabledPath);
        }
    }

    // Recharger Nginx
    await shell.execCommand('systemctl reload nginx');

    // Mettre à jour l'index
    config.enabled = enabled;
    saveNginxConfigs(configs);

    logger.info(`Configuration Nginx ${enabled ? 'activée' : 'désactivée'}: ${config.domain}`);
    return config;
}

/**
 * Recharger Nginx
 */
async function reloadNginx() {
    await shell.execCommand('systemctl reload nginx');
    logger.info('Nginx rechargé');
    return true;
}

/**
 * Obtenir le statut de Nginx
 */
async function getNginxStatus() {
    try {
        const { stdout } = await shell.execCommand('systemctl status nginx');
        const isActive = stdout.includes('active (running)');
        return {
            active: isActive,
            status: isActive ? 'running' : 'stopped'
        };
    } catch (error) {
        return {
            active: false,
            status: 'error',
            error: error.message
        };
    }
}

export default {
    createNginxConfig,
    listNginxConfigs,
    getNginxConfig,
    readNginxConfigFile,
    updateNginxConfigFile,
    deleteNginxConfig,
    toggleNginxConfig,
    reloadNginx,
    getNginxStatus
};
