/**
 * Module de gestion des configurations Nginx
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';
import {
    LIMITS_FILE,
    MAINTENANCE_DIR,
    assertFeatureModules,
    logFilePaths,
    maintenancePagePath,
    normalizeSiteOptions,
    renderLimitZones,
    renderMaintenanceHtml,
    renderNginxConfig
} from './nginxSite.js';

const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
const NGINX_CONFIGS_DIR = '/etc/nodejs-project-manager/nginx';
const BACKUP_DIR = path.join(NGINX_CONFIGS_DIR, 'backups');

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
 * Indique si la chaîne hôte contient déjà un port explicite (évite host:port:port).
 * IPv6: [2001:db8::1]:8080
 * IPv4 / nom: 192.168.1.1:5177 ou backend:3000
 */
function targetHostHasExplicitPort(host) {
    if (!host || typeof host !== 'string') return false;
    const h = host.trim();
    if (h.startsWith('[')) {
        const bracketEnd = h.indexOf(']:');
        return bracketEnd !== -1 && /^\d{1,5}$/.test(h.slice(bracketEnd + 2));
    }
    const lastColon = h.lastIndexOf(':');
    if (lastColon <= 0) return false;
    return /^\d{1,5}$/.test(h.slice(lastColon + 1));
}

/**
 * URL complète pour proxy_pass (un seul port dans l'upstream).
 */
function buildProxyPassUrl(targetProtocol, targetHost, port) {
    const proto = targetProtocol || 'http';
    const host = (targetHost || 'localhost').trim();
    if (targetHostHasExplicitPort(host)) {
        return `${proto}://${host}`;
    }
    const p = port != null && port !== '' ? String(port).trim() : '';
    if (p === '') {
        return `${proto}://${host}`;
    }
    return `${proto}://${host}:${p}`;
}

function backupSlot(id) {
    const safe = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!safe) throw new Error('Identifiant de sauvegarde invalide');
    return {
        conf: path.join(BACKUP_DIR, `${safe}.conf`),
        meta: path.join(BACKUP_DIR, `${safe}.json`)
    };
}

function hasBackup(id) {
    try {
        return fs.existsSync(backupSlot(id).conf);
    } catch {
        return false;
    }
}

function snapshotConfig(config) {
    if (!config?.id || !config.fileName) return false;
    const filePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    if (!fs.existsSync(filePath)) return false;
    initNginxConfigDir();
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const slot = backupSlot(config.id);
    fs.copyFileSync(filePath, slot.conf);
    const { warnings, hasBackup: _hasBackup, ...meta } = config;
    fs.writeFileSync(slot.meta, JSON.stringify(meta, null, 2));
    return true;
}

async function testNginxConfig() {
    try {
        const { stdout, stderr } = await shell.execCommand('nginx -t');
        return { ok: true, output: [stdout, stderr].filter(Boolean).join('\n') };
    } catch (error) {
        const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
        return { ok: false, output };
    }
}

async function withNginxTest(mutate, revert) {
    try {
        await mutate();
    } catch (error) {
        try {
            await revert();
        } catch (rollbackError) {
            logger.error(`Rollback Nginx échoué: ${rollbackError.message}`);
        }
        throw error;
    }
    try {
        const test = await testNginxConfig();
        if (!test.ok) {
            throw new Error(test.output || 'nginx -t a échoué');
        }
        await reloadNginx();
        return test;
    } catch (error) {
        try {
            await revert();
        } catch (rollbackError) {
            logger.error(`Rollback Nginx échoué: ${rollbackError.message}`);
        }
        throw new Error(`Configuration Nginx invalide. La configuration précédente a été conservée. ${error.message}`);
    }
}

function readTextIfExists(filePath) {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function writeLimitFile(configs) {
    const dir = path.dirname(LIMITS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LIMITS_FILE, renderLimitZones(configs));
}

function certificateWarning(certPath) {
    if (!fs.existsSync(certPath)) {
        throw new Error('Fichier de certificat introuvable. Obtenez un certificat depuis la page SSL.');
    }
    try {
        execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-checkend', '0'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch (error) {
        const detail = `${error.stderr || ''} ${error.stdout || ''}`.trim();
        if (/Certificate will expire/i.test(detail)) {
            throw new Error('Ce certificat est expiré. Renouvelez-le depuis la page SSL avant de l\'utiliser.');
        }
        throw new Error(`Impossible de lire le certificat : ${detail || error.message}`);
    }
    try {
        execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-checkend', '2592000'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return null;
    } catch {
        return 'Ce certificat expire dans moins de 30 jours.';
    }
}

async function getNginxCapabilities() {
    let output = '';
    let available = false;
    try {
        const result = await shell.execCommand('nginx -V');
        output = `${result.stdout || ''}\n${result.stderr || ''}`;
        available = /nginx\//.test(output);
    } catch (error) {
        output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
        available = /nginx\//.test(output);
    }

    const versionMatch = output.match(/nginx\/([0-9.]+)/);
    const modules = {
        ssl: output.includes('--with-http_ssl_module'),
        gzip: available && !output.includes('--without-http_gzip_module'),
        sub: output.includes('--with-http_sub_module'),
        gunzip: output.includes('--with-http_gunzip_module'),
        limitReq: available && !output.includes('--without-http_limit_req_module')
    };

    let confDIncluded = false;
    try {
        const conf = fs.readFileSync('/etc/nginx/nginx.conf', 'utf8');
        confDIncluded = /include\s+\/etc\/nginx\/conf\.d\/\*\.conf\s*;/.test(conf);
    } catch {
        confDIncluded = false;
    }

    const limitations = [];
    if (!modules.sub) {
        limitations.push('Le module sub_filter est absent : la bannière ne peut pas être injectée sans modifier le code du site.');
    } else {
        limitations.push('La bannière est insérée dans les réponses HTML, sans modifier les fichiers du site. Elle ne s\'applique pas aux contenus autres que HTML, ni aux pages construites uniquement dans le navigateur.');
        if (!modules.gunzip) {
            limitations.push('Sans le module gunzip, Nginx demande une réponse non compressée au backend pour pouvoir insérer la bannière.');
        }
    }
    if (modules.sub) {
        limitations.push('Un site statique ou un backend qui renvoie du HTML avec une balise body est compatible. Un proxy WebSocket ou un fichier binaire ne reçoit pas la bannière.');
    }
    if (!modules.ssl) limitations.push('Le module SSL est absent : HTTPS ne peut pas être activé.');
    if (!modules.gzip) limitations.push('Le module Gzip est absent.');
    if (!modules.limitReq || !confDIncluded) {
        limitations.push('La limitation de débit exige le module limit_req et l\'inclusion de /etc/nginx/conf.d/*.conf dans le contexte http.');
    }

    return {
        available,
        version: versionMatch ? versionMatch[1] : null,
        modules,
        confDIncluded,
        limitations
    };
}

function buildPersistedConfig(base, normalized, extra = {}) {
    return {
        ...base,
        domain: normalized.domain,
        port: normalized.port,
        secondaryDomains: normalized.secondaryDomains,
        listenHttp: normalized.listenHttp,
        listenHttps: normalized.listenHttps,
        hostingType: normalized.hostingType,
        root: normalized.root,
        index: normalized.index,
        useSSL: normalized.useSSL,
        sslCertPath: normalized.sslCertPath,
        sslKeyPath: normalized.sslKeyPath,
        redirectHTTP: normalized.redirectHTTP,
        sslProtocols: normalized.sslProtocols,
        securityHeaders: normalized.securityHeaders,
        siteStatus: normalized.siteStatus,
        bannerEnabled: normalized.bannerEnabled,
        bannerMessage: normalized.bannerMessage,
        bannerColor: normalized.bannerColor,
        bannerStyle: normalized.bannerStyle,
        maintenanceTitle: normalized.maintenanceTitle,
        maintenanceMessage: normalized.maintenanceMessage,
        targetHost: normalized.targetHost,
        targetProtocol: normalized.targetProtocol,
        proxyHeaders: normalized.proxyHeaders,
        websocket: normalized.websocket,
        proxyReadTimeout: normalized.proxyReadTimeout,
        proxyConnectTimeout: normalized.proxyConnectTimeout,
        proxySendTimeout: normalized.proxySendTimeout,
        clientMaxBodySize: normalized.clientMaxBodySize,
        gzip: normalized.gzip,
        expires: normalized.expires,
        limitReqEnabled: normalized.limitReqEnabled,
        limitReqRate: normalized.limitReqRate,
        limitReqBurst: normalized.limitReqBurst,
        clientBodyTimeout: normalized.clientBodyTimeout,
        sendTimeout: normalized.sendTimeout,
        ...extra
    };
}

/**
 * Générer le contenu d'une configuration Nginx
 */
function generateNginxConfig(domain, port, options = {}, context = {}) {
    const normalized = normalizeSiteOptions(domain, port, options);
    return renderNginxConfig(normalized, {
        fileName: context.fileName || getConfigFileName(domain),
        id: context.id || 'preview',
        errorPages: generateErrorPagesConfig()
    });
}

/**
 * Créer une nouvelle configuration Nginx
 */
async function prepareSite(domain, port, options, id) {
    const normalized = normalizeSiteOptions(domain, port, options || {});
    const fileName = getConfigFileName(normalized.domain);
    const capabilities = await getNginxCapabilities();
    assertFeatureModules(normalized, capabilities);

    const warnings = [];
    if (normalized.useSSL) {
        if (!fs.existsSync(normalized.sslKeyPath)) {
            throw new Error('Clé privée introuvable. Choisissez un certificat valide dans la page SSL.');
        }
        const warning = certificateWarning(normalized.sslCertPath);
        if (warning) warnings.push(warning);
    }
    if (normalized.hostingType === 'static' && normalized.root && !fs.existsSync(normalized.root)) {
        warnings.push(`Le répertoire ${normalized.root} n'existe pas encore.`);
    }
    if (normalized.bannerEnabled && normalized.siteStatus !== 'maintenance' && !capabilities.modules.gunzip && normalized.hostingType === 'proxy') {
        warnings.push('Le backend recevra une demande sans compression pour que la bannière puisse être insérée.');
    }

    return {
        normalized,
        fileName,
        warnings,
        maintenance: renderMaintenanceHtml(normalized),
        content: renderNginxConfig(normalized, {
            fileName,
            id,
            errorPages: generateErrorPagesConfig()
        })
    };
}

function restoreLimits(previousLimits) {
    if (previousLimits === null) {
        if (fs.existsSync(LIMITS_FILE)) fs.unlinkSync(LIMITS_FILE);
    } else {
        fs.writeFileSync(LIMITS_FILE, previousLimits);
    }
}

async function createNginxConfig(domain, port, description = '', options = {}) {
    const configs = loadNginxConfigs();
    const id = Date.now().toString();
    const prepared = await prepareSite(domain, port, options, id);

    if (configs.some(c => c.domain === prepared.normalized.domain)) {
        throw new Error(`Une configuration existe déjà pour ${prepared.normalized.domain}`);
    }

    const availablePath = path.join(NGINX_SITES_AVAILABLE, prepared.fileName);
    const enabledPath = path.join(NGINX_SITES_ENABLED, prepared.fileName);
    const pagePath = maintenancePagePath(prepared.fileName);
    const previousContent = readTextIfExists(availablePath);
    const previousLimits = readTextIfExists(LIMITS_FILE);
    const previousPage = readTextIfExists(pagePath);
    const hadEnabled = fs.existsSync(enabledPath);
    const draft = {
        id,
        limitReqEnabled: prepared.normalized.limitReqEnabled,
        limitReqRate: prepared.normalized.limitReqRate,
        limitReqBurst: prepared.normalized.limitReqBurst
    };

    await withNginxTest(async () => {
        if (prepared.normalized.siteStatus === 'maintenance') {
            if (!fs.existsSync(MAINTENANCE_DIR)) fs.mkdirSync(MAINTENANCE_DIR, { recursive: true });
            fs.writeFileSync(pagePath, prepared.maintenance);
        }
        fs.writeFileSync(availablePath, prepared.content);
        if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
        fs.symlinkSync(availablePath, enabledPath);
        writeLimitFile([...configs, draft]);
    }, async () => {
        if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
        if (previousContent === null) {
            if (fs.existsSync(availablePath)) fs.unlinkSync(availablePath);
        } else {
            fs.writeFileSync(availablePath, previousContent);
            if (hadEnabled) fs.symlinkSync(availablePath, enabledPath);
        }
        if (previousPage === null) {
            if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);
        } else {
            fs.writeFileSync(pagePath, previousPage);
        }
        restoreLimits(previousLimits);
    });

    const newConfig = buildPersistedConfig({
        id,
        description: description || '',
        fileName: prepared.fileName,
        createdAt: new Date().toISOString(),
        enabled: true,
        sslCertId: options.sslCertId || '',
        linkedProject: options.linkedProject || '',
        linkedService: options.linkedService || ''
    }, prepared.normalized);

    configs.push(newConfig);
    saveNginxConfigs(configs);
    logger.info(`Configuration Nginx créée: ${prepared.normalized.domain}`);
    return { ...newConfig, warnings: prepared.warnings };
}

/**
 * Lister toutes les configurations
 */
function listNginxConfigs() {
    return loadNginxConfigs().map(config => ({ ...config, hasBackup: hasBackup(config.id) }));
}

/**
 * Obtenir une configuration par ID
 */
function getNginxConfig(id) {
    const config = loadNginxConfigs().find(c => c.id === id);
    if (!config) return undefined;
    return { ...config, hasBackup: hasBackup(config.id) };
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
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Contenu requis');
    }

    const filePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
    const oldContent = fs.readFileSync(filePath, 'utf8');
    snapshotConfig(config);

    await withNginxTest(
        async () => { fs.writeFileSync(filePath, content); },
        async () => { fs.writeFileSync(filePath, oldContent); }
    );

    logger.info(`Configuration Nginx mise à jour: ${config.domain}`);
    return true;
}

/**
 * Mettre à jour une configuration Nginx (métadonnées + régénération du fichier site)
 */
async function updateNginxConfig(id, domain, port, description = '', options = {}) {
    const configs = loadNginxConfigs();
    const idx = configs.findIndex(c => c.id === id);
    if (idx === -1) {
        throw new Error('Configuration non trouvée');
    }

    const existing = configs[idx];
    const prepared = await prepareSite(domain, port, options, existing.id);
    if (configs.some(c => c.domain === prepared.normalized.domain && c.id !== id)) {
        throw new Error(`Une configuration existe déjà pour ${prepared.normalized.domain}`);
    }

    snapshotConfig(existing);

    const oldFileName = existing.fileName;
    const newFileName = prepared.fileName;
    const oldAvail = path.join(NGINX_SITES_AVAILABLE, oldFileName);
    const oldEn = path.join(NGINX_SITES_ENABLED, oldFileName);
    const newAvail = path.join(NGINX_SITES_AVAILABLE, newFileName);
    const newEn = path.join(NGINX_SITES_ENABLED, newFileName);
    const oldContent = readTextIfExists(oldAvail);
    const previousLimits = readTextIfExists(LIMITS_FILE);
    const pagePath = maintenancePagePath(newFileName);
    const oldPagePath = maintenancePagePath(oldFileName);
    const previousPage = readTextIfExists(pagePath);
    const previousOldPage = oldPagePath === pagePath ? previousPage : readTextIfExists(oldPagePath);
    const wasEnabled = existing.enabled !== false;
    const draftConfigs = configs.map(config => config.id === id
        ? {
            ...config,
            limitReqEnabled: prepared.normalized.limitReqEnabled,
            limitReqRate: prepared.normalized.limitReqRate,
            limitReqBurst: prepared.normalized.limitReqBurst
        }
        : config);

    await withNginxTest(async () => {
        if (prepared.normalized.siteStatus === 'maintenance') {
            if (!fs.existsSync(MAINTENANCE_DIR)) fs.mkdirSync(MAINTENANCE_DIR, { recursive: true });
            fs.writeFileSync(pagePath, prepared.maintenance);
        }
        if (oldFileName !== newFileName) {
            if (fs.existsSync(oldEn)) fs.unlinkSync(oldEn);
            if (fs.existsSync(oldAvail)) fs.unlinkSync(oldAvail);
        }
        fs.writeFileSync(newAvail, prepared.content);
        if (wasEnabled) {
            if (fs.existsSync(newEn)) fs.unlinkSync(newEn);
            fs.symlinkSync(newAvail, newEn);
        } else if (fs.existsSync(newEn)) {
            fs.unlinkSync(newEn);
        }
        writeLimitFile(draftConfigs);
    }, async () => {
        if (oldFileName !== newFileName) {
            if (fs.existsSync(newEn)) fs.unlinkSync(newEn);
            if (fs.existsSync(newAvail)) fs.unlinkSync(newAvail);
            if (oldContent !== null) {
                fs.writeFileSync(oldAvail, oldContent);
                if (wasEnabled) {
                    if (fs.existsSync(oldEn)) fs.unlinkSync(oldEn);
                    fs.symlinkSync(oldAvail, oldEn);
                }
            }
        } else if (oldContent !== null) {
            fs.writeFileSync(oldAvail, oldContent);
        }
        if (previousPage === null) {
            if (fs.existsSync(pagePath) && prepared.normalized.siteStatus === 'maintenance') fs.unlinkSync(pagePath);
        } else {
            fs.writeFileSync(pagePath, previousPage);
        }
        if (oldPagePath !== pagePath && previousOldPage !== null) {
            fs.writeFileSync(oldPagePath, previousOldPage);
        }
        restoreLimits(previousLimits);
    });

    const updated = buildPersistedConfig({
        ...existing,
        description: description !== undefined && description !== null ? description : existing.description,
        fileName: newFileName,
        sslCertId: options.sslCertId !== undefined ? options.sslCertId : (existing.sslCertId || ''),
        linkedProject: options.linkedProject || existing.linkedProject || '',
        linkedService: options.linkedService || existing.linkedService || ''
    }, prepared.normalized);
    delete updated.warnings;
    delete updated.hasBackup;
    configs[idx] = updated;
    saveNginxConfigs(configs);
    logger.info(`Configuration Nginx mise à jour: ${prepared.normalized.domain}`);
    return { ...updated, warnings: prepared.warnings };
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
    const previousContent = readTextIfExists(availablePath);
    const hadEnabled = fs.existsSync(enabledPath);
    const previousLimits = readTextIfExists(LIMITS_FILE);
    const remaining = configs.filter(c => c.id !== id);

    await withNginxTest(async () => {
        if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
        if (fs.existsSync(availablePath)) fs.unlinkSync(availablePath);
        writeLimitFile(remaining);
    }, async () => {
        if (previousContent !== null) fs.writeFileSync(availablePath, previousContent);
        if (hadEnabled && previousContent !== null) {
            if (fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
            fs.symlinkSync(availablePath, enabledPath);
        }
        restoreLimits(previousLimits);
    });

    saveNginxConfigs(remaining);

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
    const hadEnabled = fs.existsSync(enabledPath);

    await withNginxTest(async () => {
        if (enabled) {
            if (!fs.existsSync(availablePath)) throw new Error('Fichier de configuration introuvable');
            if (!fs.existsSync(enabledPath)) fs.symlinkSync(availablePath, enabledPath);
        } else if (fs.existsSync(enabledPath)) {
            fs.unlinkSync(enabledPath);
        }
    }, async () => {
        if (hadEnabled && !fs.existsSync(enabledPath)) fs.symlinkSync(availablePath, enabledPath);
        if (!hadEnabled && fs.existsSync(enabledPath)) fs.unlinkSync(enabledPath);
    });

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
    const errors = [];

    // Essayer systemctl d'abord (environnement classique)
    try {
        const { stdout } = await shell.execCommand('systemctl is-active nginx');
        const isActive = stdout.trim() === 'active';

        if (!isActive) {
            logger.info('Nginx n\'est pas actif, démarrage...');
            await shell.execCommand('systemctl start nginx');
            logger.info('Nginx démarré');
        } else {
            await shell.execCommand('systemctl reload nginx');
            logger.info('Nginx rechargé');
        }
        return true;
    } catch (error) {
        errors.push(`systemctl: ${error.message}`);
    }

    // Fallback: essayer nginx -s reload (fonctionne dans Docker)
    try {
        await shell.execCommand('nginx -s reload');
        logger.info('Nginx rechargé (via nginx -s reload)');
        return true;
    } catch (error) {
        errors.push(`nginx -s reload: ${error.message}`);
    }

    // Fallback: essayer service nginx reload
    try {
        await shell.execCommand('service nginx reload');
        logger.info('Nginx rechargé (via service)');
        return true;
    } catch (error) {
        errors.push(`service: ${error.message}`);
    }

    // Dernier recours: tenter de démarrer nginx directement
    try {
        await shell.execCommand('nginx');
        logger.info('Nginx démarré (via commande nginx directe)');
        return true;
    } catch (error) {
        errors.push(`nginx direct: ${error.message}`);
    }

    logger.error(`Impossible de recharger Nginx: ${errors.join('; ')}`);
    throw new Error(`Impossible de recharger Nginx. Erreurs: ${errors.join('; ')}`);
}

/**
 * Obtenir le statut de Nginx
 */
async function getNginxStatus() {
    let active = false;
    try {
        const { stdout } = await shell.execCommand('systemctl is-active nginx');
        active = stdout.trim() === 'active';
    } catch {
        try {
            await shell.execCommand('pgrep nginx');
            active = true;
        } catch {
            active = false;
        }
    }

    let capabilities;
    try {
        capabilities = await getNginxCapabilities();
    } catch (error) {
        capabilities = { available: false, version: null, modules: {}, confDIncluded: false, limitations: [error.message] };
    }

    return {
        active,
        status: active ? 'running' : 'stopped',
        ...capabilities
    };
}

function readSiteLog(id, type = 'access', lines = 200) {
    const config = getNginxConfig(id);
    if (!config) throw new Error('Configuration non trouvée');
    if (type !== 'access' && type !== 'error') throw new Error('Type de journal invalide');
    const count = Math.min(500, Math.max(1, parseInt(lines, 10) || 200));
    const logs = logFilePaths(config.fileName);
    const filePath = type === 'error' ? logs.error : logs.access;
    if (!fs.existsSync(filePath)) {
        return { path: filePath, content: '', missing: true };
    }
    const selected = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-count).join('\n');
    return { path: filePath, content: selected, missing: false };
}

async function restoreNginxConfig(id) {
    const configs = loadNginxConfigs();
    const idx = configs.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Configuration non trouvée');

    const slot = backupSlot(id);
    if (!fs.existsSync(slot.conf) || !fs.existsSync(slot.meta)) {
        throw new Error('Aucune configuration précédente à restaurer');
    }

    const previousMeta = JSON.parse(fs.readFileSync(slot.meta, 'utf8'));
    const previousContent = fs.readFileSync(slot.conf, 'utf8');
    if (!previousMeta.fileName || previousMeta.id !== id) {
        throw new Error('Sauvegarde inexploitable');
    }

    const current = configs[idx];
    const currentPath = path.join(NGINX_SITES_AVAILABLE, current.fileName);
    const currentEnabled = path.join(NGINX_SITES_ENABLED, current.fileName);
    const currentContent = readTextIfExists(currentPath);
    const currentWasEnabled = fs.existsSync(currentEnabled);
    const targetPath = path.join(NGINX_SITES_AVAILABLE, previousMeta.fileName);
    const targetEnabled = path.join(NGINX_SITES_ENABLED, previousMeta.fileName);
    const previousLimits = readTextIfExists(LIMITS_FILE);
    const restoredConfigs = configs.slice();
    restoredConfigs[idx] = previousMeta;

    await withNginxTest(async () => {
        if (current.fileName !== previousMeta.fileName) {
            if (fs.existsSync(currentEnabled)) fs.unlinkSync(currentEnabled);
            if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath);
        }
        fs.writeFileSync(targetPath, previousContent);
        if (previousMeta.enabled !== false) {
            if (fs.existsSync(targetEnabled)) fs.unlinkSync(targetEnabled);
            fs.symlinkSync(targetPath, targetEnabled);
        } else if (fs.existsSync(targetEnabled)) {
            fs.unlinkSync(targetEnabled);
        }
        writeLimitFile(restoredConfigs);
    }, async () => {
        if (current.fileName !== previousMeta.fileName) {
            if (fs.existsSync(targetEnabled)) fs.unlinkSync(targetEnabled);
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        }
        if (currentContent !== null) fs.writeFileSync(currentPath, currentContent);
        if (currentWasEnabled && currentContent !== null) {
            if (fs.existsSync(currentEnabled)) fs.unlinkSync(currentEnabled);
            fs.symlinkSync(currentPath, currentEnabled);
        }
        restoreLimits(previousLimits);
    });

    if (currentContent !== null) {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(slot.conf, currentContent);
        const { warnings, hasBackup: _ignored, ...meta } = current;
        fs.writeFileSync(slot.meta, JSON.stringify(meta, null, 2));
    }
    saveNginxConfigs(restoredConfigs);
    logger.info(`Configuration Nginx restaurée: ${previousMeta.domain}`);
    return { ...previousMeta, hasBackup: hasBackup(id) };
}

async function restoreGlobalConfig() {
    const globalConfigPath = '/etc/nginx/nginx.conf';
    const backupPath = '/etc/nginx/nginx.conf.backup';
    if (!fs.existsSync(backupPath)) {
        throw new Error('Aucune sauvegarde de nginx.conf');
    }
    const current = fs.readFileSync(globalConfigPath, 'utf8');
    const backup = fs.readFileSync(backupPath, 'utf8');
    await withNginxTest(
        async () => { fs.writeFileSync(globalConfigPath, backup); },
        async () => { fs.writeFileSync(globalConfigPath, current); }
    );
    fs.writeFileSync(backupPath, current);
    logger.info('nginx.conf restauré depuis la sauvegarde');
    return true;
}

/**
 * Lire le fichier de configuration global nginx.conf
 */
function readGlobalConfig() {
    const globalConfigPath = '/etc/nginx/nginx.conf';
    if (!fs.existsSync(globalConfigPath)) {
        throw new Error('Fichier nginx.conf non trouvé');
    }
    return fs.readFileSync(globalConfigPath, 'utf8');
}

/**
 * Mettre à jour le fichier de configuration global nginx.conf
 */
async function updateGlobalConfig(content) {
    const globalConfigPath = '/etc/nginx/nginx.conf';
    const backupPath = '/etc/nginx/nginx.conf.backup';
    
    // Sauvegarder l'ancien contenu pour rollback
    const oldContent = fs.readFileSync(globalConfigPath, 'utf8');
    fs.writeFileSync(backupPath, oldContent);
    
    try {
        // Écrire le nouveau contenu
        fs.writeFileSync(globalConfigPath, content);
        
        // Tester la configuration
        await shell.execCommand('nginx -t');
        
        // Recharger Nginx (démarre automatiquement s'il n'est pas actif)
        await reloadNginx();
        
        logger.info('Configuration globale Nginx mise à jour');
        return true;
    } catch (error) {
        // Rollback en cas d'erreur
        fs.writeFileSync(globalConfigPath, oldContent);
        throw new Error(`Erreur lors de la mise à jour de nginx.conf: ${error.message}`);
    }
}

/**
 * Codes d'erreur HTTP supportés pour les pages personnalisées
 */
const ERROR_CODES = [
    { code: 400, name: 'Bad Request', description: 'Requête malformée' },
    { code: 401, name: 'Unauthorized', description: 'Authentification requise' },
    { code: 403, name: 'Forbidden', description: 'Accès interdit' },
    { code: 404, name: 'Not Found', description: 'Page non trouvée' },
    { code: 500, name: 'Internal Server Error', description: 'Erreur interne du serveur' },
    { code: 502, name: 'Bad Gateway', description: 'Mauvaise passerelle' },
    { code: 503, name: 'Service Unavailable', description: 'Service indisponible' },
    { code: 504, name: 'Gateway Timeout', description: 'Délai d\'attente dépassé' }
];

const ERROR_PAGES_DIR = '/etc/nginx/error-pages';

/**
 * Initialiser le dossier des pages d'erreur
 */
function initErrorPagesDir() {
    if (!fs.existsSync(ERROR_PAGES_DIR)) {
        fs.mkdirSync(ERROR_PAGES_DIR, { recursive: true });
    }
}

/**
 * Lister les codes d'erreur disponibles
 */
function getErrorCodes() {
    return ERROR_CODES;
}

/**
 * Obtenir le chemin de la page d'erreur personnalisée
 */
function getErrorPagePath(errorCode) {
    return path.join(ERROR_PAGES_DIR, `${errorCode}.html`);
}

/**
 * Vérifier si une page d'erreur personnalisée existe
 */
function hasErrorPage(errorCode) {
    const pagePath = getErrorPagePath(errorCode);
    return fs.existsSync(pagePath);
}

/**
 * Lire le contenu d'une page d'erreur personnalisée
 */
function readErrorPage(errorCode) {
    const pagePath = getErrorPagePath(errorCode);
    if (!fs.existsSync(pagePath)) {
        return null;
    }
    return fs.readFileSync(pagePath, 'utf8');
}

/**
 * Créer ou mettre à jour une page d'erreur personnalisée
 */
async function setErrorPage(errorCode, htmlContent) {
    if (!ERROR_CODES.find(e => e.code === parseInt(errorCode))) {
        throw new Error(`Code d'erreur non supporté: ${errorCode}`);
    }

    initErrorPagesDir();
    const pagePath = getErrorPagePath(errorCode);
    const previous = readTextIfExists(pagePath);
    fs.writeFileSync(pagePath, htmlContent);

    try {
        await updateAllNginxConfigsWithErrorPages();
    } catch (error) {
        if (previous === null) {
            if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);
        } else {
            fs.writeFileSync(pagePath, previous);
        }
        throw error;
    }

    logger.success(`Page d'erreur ${errorCode} créée/mise à jour et Nginx rechargé`);
    return true;
}

/**
 * Supprimer une page d'erreur personnalisée
 */
async function deleteErrorPage(errorCode) {
    const pagePath = getErrorPagePath(errorCode);
    if (fs.existsSync(pagePath)) {
        const previous = fs.readFileSync(pagePath, 'utf8');
        fs.unlinkSync(pagePath);
        try {
            await updateAllNginxConfigsWithErrorPages();
        } catch (error) {
            fs.writeFileSync(pagePath, previous);
            throw error;
        }
        logger.info(`Page d'erreur ${errorCode} supprimée et Nginx rechargé`);
        return true;
    }
    return false;
}

/**
 * Mettre à jour toutes les configurations Nginx existantes avec les pages d'erreur
 */
async function updateAllNginxConfigsWithErrorPages() {
    const configs = loadNginxConfigs();
    const snapshots = [];
    for (const config of configs) {
        const availablePath = path.join(NGINX_SITES_AVAILABLE, config.fileName);
        if (!fs.existsSync(availablePath)) continue;
        snapshots.push({
            path: availablePath,
            content: fs.readFileSync(availablePath, 'utf8'),
            config
        });
    }

    await withNginxTest(async () => {
        const errorPages = generateErrorPagesConfig();
        for (const snap of snapshots) {
            const normalized = normalizeSiteOptions(snap.config.domain, snap.config.port, snap.config);
            const content = renderNginxConfig(normalized, {
                fileName: snap.config.fileName,
                id: snap.config.id,
                errorPages
            });
            fs.writeFileSync(snap.path, content);
        }
    }, async () => {
        for (const snap of snapshots) fs.writeFileSync(snap.path, snap.content);
    });
}

/**
 * Lister toutes les pages d'erreur personnalisées
 */
function listErrorPages() {
    initErrorPagesDir();
    const pages = [];

    for (const error of ERROR_CODES) {
        const pagePath = getErrorPagePath(error.code);
        const exists = fs.existsSync(pagePath);

        pages.push({
            ...error,
            hasCustomPage: exists,
            path: exists ? pagePath : null
        });
    }

    return pages;
}

/**
 * Générer la configuration Nginx pour les pages d'erreur
 * À inclure dans les blocs server
 */
function generateErrorPagesConfig() {
    const configs = [];

    for (const error of ERROR_CODES) {
        if (hasErrorPage(error.code)) {
            configs.push(`    error_page ${error.code} /error-pages/${error.code}.html;`);
        }
    }

    if (configs.length > 0) {
        return `
    # Pages d'erreur personnalisées
    location /error-pages/ {
        alias ${ERROR_PAGES_DIR}/;
        internal;
    }

${configs.join('\n')}
`;
    }

    return '';
}

/**
 * Obtenir le contenu de la page d'erreur par défaut
 */
function getDefaultErrorPage(errorCode) {
    const error = ERROR_CODES.find(e => e.code === parseInt(errorCode));
    if (!error) {
        return '';
    }

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erreur ${error.code} - ${error.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        .error-code {
            font-size: 8rem;
            font-weight: bold;
            color: #e94560;
            text-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
        }
        .error-name {
            font-size: 2rem;
            margin: 1rem 0;
            color: #f1f1f1;
        }
        .error-description {
            font-size: 1.2rem;
            color: #a0a0a0;
            margin-bottom: 2rem;
        }
        .back-link {
            display: inline-block;
            padding: 12px 24px;
            background: #e94560;
            color: #fff;
            text-decoration: none;
            border-radius: 8px;
            transition: background 0.3s;
        }
        .back-link:hover {
            background: #ff6b6b;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-code">${error.code}</div>
        <h1 class="error-name">${error.name}</h1>
        <p class="error-description">${error.description}</p>
        <a href="/" class="back-link">Retour à l'accueil</a>
    </div>
</body>
</html>`;
}

export default {
    createNginxConfig,
    listNginxConfigs,
    getNginxConfig,
    readNginxConfigFile,
    updateNginxConfigFile,
    updateNginxConfig,
    deleteNginxConfig,
    toggleNginxConfig,
    reloadNginx,
    getNginxStatus,
    getNginxCapabilities,
    testNginxConfig,
    readSiteLog,
    restoreNginxConfig,
    readGlobalConfig,
    updateGlobalConfig,
    restoreGlobalConfig,
    getErrorCodes,
    hasErrorPage,
    readErrorPage,
    setErrorPage,
    deleteErrorPage,
    listErrorPages,
    generateErrorPagesConfig,
    getDefaultErrorPage,
    ERROR_PAGES_DIR
};
