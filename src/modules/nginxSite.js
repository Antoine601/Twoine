/**
 * Validation et rendu des sites Nginx gérés par Twoine.
 * Aucune commande privilégiée : le module nginx.js applique le résultat.
 */

const DOMAIN_RE = /^(?:\*\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const HOST_RE = /^[a-zA-Z0-9.:_-]+$/;
const PATH_RE = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const INDEX_RE = /^[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)*$/;
const SIZE_RE = /^\d{1,5}[kKmMgG]?$/;
const RATE_RE = /^\d{1,5}r\/[sm]$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BANNER_TEXT_RE = /^[\p{L}\p{N}\s.,:!?()'\-–—%/]+$/u;
const CERT_PATH_RE = /^\/etc\/(?:letsencrypt|ssl)\/[A-Za-z0-9._+/-]+$/;
const REFERRER_POLICIES = ['no-referrer', 'strict-origin-when-cross-origin', 'same-origin', 'origin-when-cross-origin'];
const EXPIRES_VALUES = ['off', '1h', '1d', '7d', '30d'];
const TLS_PROTOCOLS = ['TLSv1.2', 'TLSv1.3'];
const SITE_STATUSES = ['normal', 'showcase', 'development', 'maintenance'];
const BANNER_STYLES = ['bar', 'solid', 'outline'];

export const LIMITS_FILE = '/etc/nginx/conf.d/twoine-limits.conf';
export const MAINTENANCE_DIR = '/etc/nginx/maintenance-pages';

const STATUS_BANNER = {
    showcase: 'Site vitrine',
    development: 'Site en cours de développement',
    maintenance: 'Site en maintenance'
};

function asBool(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 'true' || value === 1 || value === '1';
}

function parsePort(value, label, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (!required) return null;
        throw new Error(`${label} requis`);
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${label} invalide`);
    }
    return port;
}

function parseTimeout(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const timeout = Number(value);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
        throw new Error('Délai d\'attente invalide (1 à 3600 secondes)');
    }
    return timeout;
}

function assertDomain(domain, label = 'Domaine') {
    if (typeof domain !== 'string' || !DOMAIN_RE.test(domain) || domain.includes('..')) {
        throw new Error(`${label} invalide`);
    }
}

function uniqueDomains(primary, extra) {
    const seen = new Set([primary.toLowerCase()]);
    const domains = [];
    for (const raw of extra) {
        const domain = String(raw || '').trim();
        if (!domain) continue;
        assertDomain(domain, 'Domaine secondaire');
        const key = domain.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        domains.push(domain);
        if (domains.length > 20) {
            throw new Error('20 domaines secondaires maximum');
        }
    }
    return domains;
}

function parseDomainList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    return value.split(/[,\s]+/);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeNginxQuoted(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$');
}

export function zoneName(id) {
    const safe = String(id || '').replace(/[^A-Za-z0-9]/g, '');
    if (!safe) throw new Error('Identifiant de zone limit_req invalide');
    return `twoine_${safe}`;
}

export function logFilePaths(fileName) {
    const safe = String(fileName || '').replace(/[^A-Za-z0-9._-]/g, '_');
    if (!safe) throw new Error('Nom de fichier de journal invalide');
    return {
        access: `/var/log/nginx/${safe}.access.log`,
        error: `/var/log/nginx/${safe}.error.log`
    };
}

export function maintenancePagePath(fileName) {
    const safe = String(fileName || '').replace(/[^A-Za-z0-9._-]/g, '_');
    if (!safe) throw new Error('Nom de page de maintenance invalide');
    return `${MAINTENANCE_DIR}/${safe}.html`;
}

function headerDirectives(options) {
    const headers = options.securityHeaders || {};
    const lines = [];
    if (headers.xContentTypeOptions) {
        lines.push('add_header X-Content-Type-Options "nosniff" always;');
    }
    if (headers.xFrameOptions === 'DENY' || headers.xFrameOptions === 'SAMEORIGIN') {
        lines.push(`add_header X-Frame-Options "${headers.xFrameOptions}" always;`);
    }
    if (headers.referrerPolicy) {
        lines.push(`add_header Referrer-Policy "${headers.referrerPolicy}" always;`);
    }
    if (headers.hsts && options.useSSL) {
        lines.push('add_header Strict-Transport-Security "max-age=31536000" always;');
    }
    return lines;
}

function bannerDirectives(options) {
    if (!options.bannerEnabled || options.siteStatus === 'maintenance') return [];
    const color = options.bannerColor;
    const css = options.bannerStyle === 'outline'
        ? `display:block;box-sizing:border-box;width:100%;padding:10px 16px;text-align:center;font:600 14px/1.4 sans-serif;background:#ffffff;color:${color};border-bottom:3px solid ${color};`
        : `display:block;box-sizing:border-box;width:100%;padding:10px 16px;text-align:center;font:600 14px/1.4 sans-serif;background:${color};color:#ffffff;`;
    const html = `<div id="twoine-site-banner" style="${css}">${escapeHtml(options.bannerMessage)}</div></body>`;
    return [
        `sub_filter "</body>" "${escapeNginxQuoted(html)}";`,
        'sub_filter_once on;',
        'sub_filter_types text/html;'
    ];
}

function proxyDirectives(options) {
    const lines = [
        `proxy_pass ${options.proxyPass};`,
        'proxy_http_version 1.1;'
    ];
    if (options.websocket) {
        lines.push('proxy_set_header Upgrade $http_upgrade;');
        lines.push('proxy_set_header Connection "upgrade";');
    }
    const headers = options.proxyHeaders;
    if (headers.host) lines.push('proxy_set_header Host $host;');
    if (headers.xRealIp) lines.push('proxy_set_header X-Real-IP $remote_addr;');
    if (headers.xForwardedFor) lines.push('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    if (headers.xForwardedProto) lines.push('proxy_set_header X-Forwarded-Proto $scheme;');
    if (headers.xForwardedHost) lines.push('proxy_set_header X-Forwarded-Host $host;');
    if (options.bannerEnabled && options.siteStatus !== 'maintenance') {
        lines.push('proxy_set_header Accept-Encoding "";');
    }
    lines.push('proxy_buffering off;');
    lines.push('proxy_request_buffering off;');
    lines.push(`proxy_connect_timeout ${options.proxyConnectTimeout}s;`);
    lines.push(`proxy_send_timeout ${options.proxySendTimeout}s;`);
    lines.push(`proxy_read_timeout ${options.proxyReadTimeout}s;`);
    lines.push('proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;');
    lines.push('proxy_next_upstream_tries 2;');
    lines.push('proxy_intercept_errors on;');
    return lines;
}

function joinBlock(lines) {
    return lines.filter(line => line !== '').map(line => `        ${line}`).join('\n');
}

/**
 * Normalise les options saisies. Les champs absents conservent le comportement
 * historique (proxy, WebSocket, sans gzip ni en-têtes) pour les configurations déjà enregistrées.
 */
export function normalizeSiteOptions(domain, port, options = {}) {
    if (!domain || typeof domain !== 'string') {
        throw new Error('Domaine requis');
    }
    assertDomain(domain.trim(), 'Domaine principal');
    const primary = domain.trim();
    const hostingType = options.hostingType === 'static' ? 'static' : 'proxy';
    const portNumber = parsePort(port, 'Port du backend', { required: hostingType === 'proxy' });

    const listenHttp = parsePort(options.listenHttp === undefined ? 80 : options.listenHttp, 'Port HTTP');
    const listenHttps = parsePort(options.listenHttps === undefined ? 443 : options.listenHttps, 'Port HTTPS');
    if (listenHttp === listenHttps) {
        throw new Error('Les ports HTTP et HTTPS doivent être différents');
    }

    const secondaryDomains = uniqueDomains(primary, parseDomainList(options.secondaryDomains));
    const useSSL = asBool(options.useSSL, false);
    const redirectHTTP = useSSL && asBool(options.redirectHTTP, false);

    let root = '';
    let index = 'index.html';
    if (hostingType === 'static' || (typeof options.root === 'string' && options.root.trim())) {
        root = typeof options.root === 'string' ? options.root.trim() : '';
    }
    if (hostingType === 'static') {
        if (!root || !PATH_RE.test(root) || root.includes('..')) {
            throw new Error('Répertoire racine invalide');
        }
        index = (options.index || 'index.html').trim();
        if (!INDEX_RE.test(index)) throw new Error('Fichier d\'accueil invalide');
    } else if (root && (!PATH_RE.test(root) || root.includes('..'))) {
        throw new Error('Répertoire racine invalide');
    }

    let targetHost = (options.targetHost || 'localhost').trim();
    if (!HOST_RE.test(targetHost)) throw new Error('Hôte du backend invalide');
    const targetProtocol = options.targetProtocol === 'https' ? 'https' : 'http';

    let sslCertPath = '';
    let sslKeyPath = '';
    let sslProtocols = [];
    if (useSSL) {
        sslCertPath = String(options.sslCertPath || '').trim();
        sslKeyPath = String(options.sslKeyPath || '').trim();
        if (!CERT_PATH_RE.test(sslCertPath) || sslCertPath.includes('..')) {
            throw new Error('Chemin du certificat invalide');
        }
        if (!CERT_PATH_RE.test(sslKeyPath) || sslKeyPath.includes('..')) {
            throw new Error('Chemin de la clé privée invalide');
        }
        const requested = Array.isArray(options.sslProtocols) && options.sslProtocols.length
            ? options.sslProtocols
            : TLS_PROTOCOLS;
        sslProtocols = [];
        for (const protocol of requested) {
            if (!TLS_PROTOCOLS.includes(protocol)) {
                throw new Error('Version TLS non autorisée. Utilisez TLSv1.2 ou TLSv1.3.');
            }
            if (!sslProtocols.includes(protocol)) sslProtocols.push(protocol);
        }
        if (sslProtocols.length === 0) throw new Error('Sélectionnez au moins une version TLS');
    }

    const sourceHeaders = options.securityHeaders || {};
    const legacyHeaders = options.securityHeaders === undefined;
    const securityHeaders = {
        xContentTypeOptions: legacyHeaders ? false : asBool(sourceHeaders.xContentTypeOptions, false),
        xFrameOptions: legacyHeaders ? '' : (sourceHeaders.xFrameOptions === 'DENY' || sourceHeaders.xFrameOptions === 'SAMEORIGIN' ? sourceHeaders.xFrameOptions : ''),
        referrerPolicy: legacyHeaders ? '' : (REFERRER_POLICIES.includes(sourceHeaders.referrerPolicy) ? sourceHeaders.referrerPolicy : ''),
        hsts: legacyHeaders ? false : asBool(sourceHeaders.hsts, false)
    };
    if (!legacyHeaders && sourceHeaders.referrerPolicy && !securityHeaders.referrerPolicy) {
        throw new Error('Referrer-Policy invalide');
    }

    const siteStatus = SITE_STATUSES.includes(options.siteStatus) ? options.siteStatus : 'normal';
    const bannerEnabled = asBool(options.bannerEnabled, false);
    let bannerMessage = typeof options.bannerMessage === 'string' ? options.bannerMessage.trim() : '';
    if (bannerEnabled && !bannerMessage) bannerMessage = STATUS_BANNER[siteStatus] || '';
    if (bannerEnabled && !bannerMessage) {
        throw new Error('Indiquez le message de la bannière');
    }
    if (bannerMessage && (!BANNER_TEXT_RE.test(bannerMessage) || bannerMessage.length > 180)) {
        throw new Error('Message de bannière invalide');
    }
    const bannerColor = COLOR_RE.test(options.bannerColor || '') ? options.bannerColor : '#b45309';
    const bannerStyle = BANNER_STYLES.includes(options.bannerStyle) ? options.bannerStyle : 'bar';

    const maintenanceTitle = typeof options.maintenanceTitle === 'string' && options.maintenanceTitle.trim()
        ? options.maintenanceTitle.trim()
        : 'Maintenance';
    const maintenanceMessage = typeof options.maintenanceMessage === 'string' && options.maintenanceMessage.trim()
        ? options.maintenanceMessage.trim()
        : 'Ce site est temporairement indisponible.';
    if (!BANNER_TEXT_RE.test(maintenanceTitle) || maintenanceTitle.length > 80) {
        throw new Error('Titre de la page de maintenance invalide');
    }
    if (!BANNER_TEXT_RE.test(maintenanceMessage) || maintenanceMessage.length > 400) {
        throw new Error('Message de la page de maintenance invalide');
    }

    const legacyProxyHeaders = options.proxyHeaders === undefined;
    const sourceProxy = options.proxyHeaders || {};
    const proxyHeaders = {
        host: legacyProxyHeaders ? true : asBool(sourceProxy.host, true),
        xRealIp: legacyProxyHeaders ? true : asBool(sourceProxy.xRealIp, true),
        xForwardedFor: legacyProxyHeaders ? true : asBool(sourceProxy.xForwardedFor, true),
        xForwardedProto: legacyProxyHeaders ? true : asBool(sourceProxy.xForwardedProto, true),
        xForwardedHost: legacyProxyHeaders ? true : asBool(sourceProxy.xForwardedHost, true)
    };

    const clientMaxBodySize = options.clientMaxBodySize ? String(options.clientMaxBodySize).trim() : '';
    if (clientMaxBodySize && !SIZE_RE.test(clientMaxBodySize)) {
        throw new Error('Taille maximale des fichiers invalide');
    }
    const expires = EXPIRES_VALUES.includes(options.expires) ? options.expires : 'off';
    const limitReqEnabled = asBool(options.limitReqEnabled, false);
    const limitReqRate = RATE_RE.test(options.limitReqRate || '') ? options.limitReqRate : '10r/s';
    if (options.limitReqRate && !RATE_RE.test(options.limitReqRate)) {
        throw new Error('Débit limit_req invalide');
    }
    let limitReqBurst = options.limitReqBurst === undefined || options.limitReqBurst === '' ? 20 : Number(options.limitReqBurst);
    if (!Number.isInteger(limitReqBurst) || limitReqBurst < 0 || limitReqBurst > 1000) {
        throw new Error('Burst limit_req invalide');
    }

    const normalized = {
        domain: primary,
        secondaryDomains,
        port: portNumber,
        listenHttp,
        listenHttps,
        hostingType,
        root,
        index,
        useSSL,
        sslCertPath,
        sslKeyPath,
        redirectHTTP,
        sslProtocols,
        securityHeaders,
        siteStatus,
        bannerEnabled,
        bannerMessage,
        bannerColor,
        bannerStyle,
        maintenanceTitle,
        maintenanceMessage,
        targetHost,
        targetProtocol,
        proxyHeaders,
        websocket: asBool(options.websocket, true),
        proxyReadTimeout: parseTimeout(options.proxyReadTimeout, 60),
        proxyConnectTimeout: parseTimeout(options.proxyConnectTimeout, 60),
        proxySendTimeout: parseTimeout(options.proxySendTimeout, 60),
        clientMaxBodySize,
        gzip: asBool(options.gzip, false),
        expires,
        limitReqEnabled,
        limitReqRate,
        limitReqBurst,
        clientBodyTimeout: parseTimeout(options.clientBodyTimeout, 60),
        sendTimeout: parseTimeout(options.sendTimeout, 60),
        serverNames: [primary, ...secondaryDomains].join(' '),
        proxyPass: ''
    };

    if (hostingType === 'proxy') {
        normalized.proxyPass = buildProxyPass(targetProtocol, targetHost, portNumber);
    }
    return normalized;
}

export function buildProxyPass(targetProtocol, targetHost, port) {
    const host = targetHost.trim();
    const explicit = host.startsWith('[')
        ? host.includes(']:')
        : /:\d{1,5}$/.test(host);
    if (explicit || port === null || port === undefined || port === '') {
        return `${targetProtocol}://${host}`;
    }
    return `${targetProtocol}://${host}:${port}`;
}

export function renderMaintenanceHtml(options) {
    const title = escapeHtml(options.maintenanceTitle);
    const message = escapeHtml(options.maintenanceMessage);
    const color = options.bannerColor || '#b45309';
    const banner = options.bannerEnabled
        ? `<div style="padding:12px 16px;text-align:center;background:${color};color:#fff;font-family:sans-serif;font-weight:600;">${escapeHtml(options.bannerMessage || message)}</div>`
        : '';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { margin: 0; font-family: sans-serif; background: #f5f5f5; color: #171717; }
        main { max-width: 36rem; margin: 12vh auto; padding: 2rem; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; }
        h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
        p { margin: 0; line-height: 1.5; color: #404040; }
    </style>
</head>
<body>
    ${banner}
    <main>
        <h1>${title}</h1>
        <p>${message}</p>
    </main>
</body>
</html>
`;
}

export function renderNginxConfig(options, context) {
    const logs = logFilePaths(context.fileName);
    const maintenancePath = maintenancePagePath(context.fileName);
    const names = options.serverNames;
    const headers = headerDirectives(options);
    const banner = bannerDirectives(options);
    const common = [];
    if (options.clientMaxBodySize) common.push(`client_max_body_size ${options.clientMaxBodySize};`);
    common.push(`client_body_timeout ${options.clientBodyTimeout}s;`);
    common.push(`send_timeout ${options.sendTimeout}s;`);
    if (options.gzip) {
        common.push('gzip on;');
        common.push('gzip_vary on;');
        common.push('gzip_proxied any;');
        common.push('gzip_comp_level 5;');
        common.push('gzip_min_length 256;');
        common.push('gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;');
    }
    common.push(`access_log ${logs.access};`);
    common.push(`error_log ${logs.error};`);

    const limit = options.limitReqEnabled
        ? [`limit_req zone=${zoneName(context.id)} burst=${options.limitReqBurst} nodelay;`]
        : [];

    let locations = '';
    if (options.siteStatus === 'maintenance') {
        locations = `
    error_page 503 /__twoine_maintenance.html;
    location = /__twoine_maintenance.html {
        alias ${maintenancePath};
        internal;
${joinBlock(headers)}
    }

    location / {
${joinBlock([...limit, 'return 503;'])}
    }`;
    } else if (options.hostingType === 'static') {
        const assetHeaders = [...headers];
        if (options.expires && options.expires !== 'off') {
            assetHeaders.push(`expires ${options.expires};`);
        }
        locations = `
    root ${options.root};
    index ${options.index};

    location / {
${joinBlock([...limit, ...headers, ...banner])}
        try_files $uri $uri/ =404;
    }${options.expires && options.expires !== 'off' ? `

    location ~* \\.(?:css|js|mjs|jpg|jpeg|png|gif|ico|svg|webp|woff2?)$ {
${joinBlock([...limit, ...assetHeaders])}
    }` : ''}`;
    } else {
        const proxy = proxyDirectives(options);
        const assetExtra = options.expires && options.expires !== 'off' ? [`expires ${options.expires};`] : [];
        locations = `
    location / {
${joinBlock([...limit, ...headers, ...proxy, ...banner])}
    }${assetExtra.length ? `

    location ~* \\.(?:css|js|mjs|jpg|jpeg|png|gif|ico|svg|webp|woff2?)$ {
${joinBlock([...limit, ...headers, ...proxy, ...assetExtra, ...banner])}
    }` : ''}`;
    }

    const errorPages = context.errorPages || '';
    const sslLines = options.useSSL
        ? `
    ssl_certificate ${options.sslCertPath};
    ssl_certificate_key ${options.sslKeyPath};
    ssl_protocols ${options.sslProtocols.join(' ')};`
        : '';

    const listens = [];
    if (options.useSSL) {
        listens.push(`    listen ${options.listenHttps} ssl;`);
        if (!options.redirectHTTP) listens.push(`    listen ${options.listenHttp};`);
    } else {
        listens.push(`    listen ${options.listenHttp};`);
    }

    let config = `# Généré par Twoine
# twoine-site-status: ${options.siteStatus}
server {
${listens.join('\n')}
    server_name ${names};
${sslLines}
${common.map(line => `    ${line}`).join('\n')}
${errorPages}${locations}
}
`;

    if (options.useSSL && options.redirectHTTP) {
        config += `
server {
    listen ${options.listenHttp};
    server_name ${names};
    return 301 https://$host$request_uri;
}
`;
    }

    return config;
}

export function renderLimitZones(configs) {
    const lines = [
        '# Généré par Twoine. Réécrit à chaque application d\'une configuration.',
        ''
    ];
    for (const config of configs) {
        if (!config || !config.limitReqEnabled || !config.id) continue;
        const rate = RATE_RE.test(config.limitReqRate || '') ? config.limitReqRate : null;
        if (!rate) continue;
        const burst = Number(config.limitReqBurst);
        if (!Number.isInteger(burst)) continue;
        lines.push(`limit_req_zone $binary_remote_addr zone=${zoneName(config.id)}:10m rate=${rate};`);
    }
    lines.push('');
    return lines.join('\n');
}

export function assertFeatureModules(options, capabilities) {
    if (!capabilities || !capabilities.available) {
        throw new Error('Nginx est indisponible : impossible de vérifier les modules nécessaires.');
    }
    const modules = capabilities.modules || {};
    if (options.useSSL && !modules.ssl) {
        throw new Error('Le module SSL de Nginx est absent. HTTPS ne peut pas être activé.');
    }
    if (options.gzip && !modules.gzip) {
        throw new Error('Le module Gzip est absent de ce Nginx.');
    }
    if (options.bannerEnabled && options.siteStatus !== 'maintenance' && !modules.sub) {
        throw new Error('La bannière nécessite le module http_sub_module, absent de ce Nginx. Elle ne peut pas être ajoutée sans modifier le site.');
    }
    if (options.limitReqEnabled && !modules.limitReq) {
        throw new Error('Le module limit_req est absent de ce Nginx.');
    }
    if (options.limitReqEnabled && !capabilities.confDIncluded) {
        throw new Error('nginx.conf n\'inclut pas /etc/nginx/conf.d/*.conf. La zone limit_req doit être déclarée dans le contexte http.');
    }
}
