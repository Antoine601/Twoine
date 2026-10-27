/**
 * Module de gestion des certificats SSL Let's Encrypt
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const SSL_DIR = '/etc/ssl/twoine';
const SSL_DB_FILE = path.join(SSL_DIR, 'certificates.json');
const SSL_TEMPLATES_FILE = path.join(SSL_DIR, 'templates.json');
const SSL_LOG_DIR = path.join(SSL_DIR, 'renewal-logs');
const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CERT_ID_RE = /^[0-9a-f-]{36}$/i;

function assertDomainName(domain) {
    if (typeof domain !== 'string' || !DOMAIN_RE.test(domain) || domain.includes('..') || domain.includes('*')) {
        throw new Error('Domaine invalide. Les certificats wildcard ne sont pas obtenus par cette méthode.');
    }
}

function assertEmail(email) {
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || /[\s"'\\]/.test(email)) {
        throw new Error('Email invalide');
    }
}

function parseOpenSslDate(output, key) {
    const match = output.match(new RegExp(`${key}=(.+)`));
    if (!match) return null;
    const date = new Date(match[1].trim());
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseCertificateDomains(subjectOutput, sanOutput) {
    const domains = [];
    const san = sanOutput || '';
    for (const match of san.matchAll(/DNS:([^,\s]+)/g)) {
        domains.push(match[1]);
    }
    if (domains.length === 0) {
        const cn = (subjectOutput || '').match(/CN\s*=\s*([^/\n,]+)/);
        if (cn) domains.push(cn[1].trim());
    }
    return [...new Set(domains)];
}

function runOpenSsl(args) {
    return execFileSync('openssl', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

class SSLManager {
    constructor() {
        this.ensureDirectories();
        this.loadDatabase();
        this.loadTemplates();
    }

    ensureDirectories() {
        try {
            if (!fs.existsSync(SSL_DIR)) {
                fs.mkdirSync(SSL_DIR, { recursive: true, mode: 0o755 });
            }
        } catch (error) {
            logger.error(`Erreur lors de la création des dossiers SSL: ${error.message}`);
            throw error;
        }
    }

    loadDatabase() {
        try {
            if (fs.existsSync(SSL_DB_FILE)) {
                const data = fs.readFileSync(SSL_DB_FILE, 'utf8');
                this.certificates = JSON.parse(data);
            } else {
                this.certificates = [];
                this.saveDatabase();
            }
        } catch (error) {
            logger.error(`Erreur lors du chargement de la base SSL: ${error.message}`);
            this.certificates = [];
        }
    }

    saveDatabase() {
        try {
            fs.writeFileSync(SSL_DB_FILE, JSON.stringify(this.certificates, null, 2), { mode: 0o644 });
        } catch (error) {
            logger.error(`Erreur lors de la sauvegarde de la base SSL: ${error.message}`);
            throw error;
        }
    }

    getAllCertificates() {
        return this.certificates.map(cert => this.publicCertificate(cert));
    }

    inspectCertificate(certPath) {
        if (!certPath || !fs.existsSync(certPath)) {
            return {
                status: 'error',
                error: 'Fichier de certificat introuvable',
                domains: [],
                issuedAt: null,
                expiresAt: null
            };
        }
        try {
            const dates = runOpenSsl(['x509', '-in', certPath, '-noout', '-dates', '-subject']);
            let san = '';
            try {
                san = runOpenSsl(['x509', '-in', certPath, '-noout', '-ext', 'subjectAltName']);
            } catch {
                san = '';
            }
            const issued = parseOpenSslDate(dates, 'notBefore');
            const expires = parseOpenSslDate(dates, 'notAfter');
            const domains = parseCertificateDomains(dates, san);
            let status = 'valid';
            let error = '';
            if (!expires) {
                status = 'error';
                error = 'Date d\'expiration illisible';
            } else if (expires.getTime() <= Date.now()) {
                status = 'expired';
            } else if (expires.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000) {
                status = 'expiring';
            }
            return {
                status,
                error,
                domains,
                issuedAt: issued ? issued.toISOString() : null,
                expiresAt: expires ? expires.toISOString() : null
            };
        } catch (error) {
            return {
                status: 'error',
                error: `${error.stderr || error.message || 'Lecture OpenSSL impossible'}`.trim(),
                domains: [],
                issuedAt: null,
                expiresAt: null
            };
        }
    }

    publicCertificate(cert) {
        const live = this.inspectCertificate(cert.certPath);
        const domains = live.domains.length ? live.domains : (cert.domains || [cert.domain]);
        return {
            id: cert.id,
            domain: cert.domain,
            domains,
            provider: cert.provider || 'letsencrypt',
            linkedProject: cert.linkedProject || '',
            organization: cert.organization,
            country: cert.country,
            certPath: cert.certPath,
            keyPath: cert.keyPath,
            createdAt: cert.createdAt,
            issuedAt: live.issuedAt || cert.issuedAt || cert.createdAt,
            expiresAt: live.expiresAt || cert.expiresAt,
            status: live.status,
            statusError: live.error || cert.lastError || '',
            lastRenewalAt: cert.lastRenewalAt || null,
            lastRenewalStatus: cert.lastRenewalStatus || null,
            lastCheckAt: cert.lastCheckAt || null,
            lastCheckStatus: cert.lastCheckStatus || null,
            altDomains: cert.altDomains || []
        };
    }

    logFile(id) {
        if (!CERT_ID_RE.test(id)) throw new Error('Identifiant de certificat invalide');
        return path.join(SSL_LOG_DIR, `${id}.log`);
    }

    appendLog(id, label, text) {
        if (!fs.existsSync(SSL_LOG_DIR)) {
            fs.mkdirSync(SSL_LOG_DIR, { recursive: true, mode: 0o750 });
        }
        const entry = `\n----- ${new Date().toISOString()} — ${label} -----\n${text || ''}\n`;
        fs.appendFileSync(this.logFile(id), entry, { mode: 0o640 });
    }

    readRenewalLog(id) {
        const filePath = this.logFile(id);
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-200).join('\n');
    }

    getCertificateById(id) {
        return this.certificates.find(cert => cert.id === id);
    }

    createCertificate(options) {
        const {
            domain,
            altDomains = [],
            country = 'FR',
            state = '',
            city = '',
            organization = '',
            organizationalUnit = '',
            email = '',
            validityDays = 90,
            linkedProject = ''
        } = options;

        assertDomainName(domain);
        assertEmail(email);
        if (!linkedProject) {
            throw new Error('Le projet lié est requis');
        }
        if (!this.checkCertbot()) {
            throw new Error("Certbot n'est pas installé. Installez certbot et python3-certbot-nginx.");
        }

        const extras = [];
        const seen = new Set([domain.toLowerCase()]);
        const rawExtras = Array.isArray(altDomains)
            ? altDomains
            : String(altDomains || '').split(/[,\s]+/);
        for (const raw of rawExtras) {
            const name = String(raw || '').trim();
            if (!name) continue;
            assertDomainName(name);
            if (seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            extras.push(name);
        }

        const id = uuidv4();
        const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
        const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

        if (this.certificates.some(cert => cert.domain === domain)) {
            throw new Error('Un certificat existe déjà pour ce domaine');
        }

        const args = [
            'certonly', '--nginx', '--non-interactive', '--agree-tos',
            '--email', email, '--keep-until-expiring',
            '-d', domain
        ];
        for (const extra of extras) args.push('-d', extra);

        try {
            logger.info(`Obtention du certificat Let's Encrypt pour ${domain}...`);
            const output = execFileSync('certbot', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const live = this.inspectCertificate(certPath);
            if (live.status === 'error') {
                throw new Error(live.error || 'Le certificat n\'a pas pu être lu après l\'obtention');
            }
            if (!fs.existsSync(keyPath)) {
                throw new Error('La clé privée n\'a pas été installée');
            }

            const certificate = {
                id,
                domain,
                altDomains: extras,
                domains: live.domains,
                provider: 'letsencrypt',
                linkedProject,
                country,
                state,
                city,
                organization,
                organizationalUnit,
                email,
                certPath,
                keyPath,
                validityDays,
                createdAt: new Date().toISOString(),
                issuedAt: live.issuedAt,
                expiresAt: live.expiresAt,
                lastRenewalAt: null,
                lastRenewalStatus: null,
                lastError: ''
            };

            this.certificates.push(certificate);
            this.saveDatabase();
            this.appendLog(id, 'Obtention', output || 'Certificat installé.');
            logger.info(`Certificat Let's Encrypt créé pour ${domain}`);
            return this.publicCertificate(certificate);
        } catch (error) {
            const detail = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`.trim();
            try { this.appendLog(id, 'Échec d\'obtention', detail); } catch { /* journal best-effort */ }
            logger.error(`Erreur lors de la création du certificat: ${detail}`);
            throw new Error(`Impossible de créer le certificat: ${detail.slice(-1500)}`);
        }
    }

    async renewCertificate(id, { force = false } = {}) {
        const cert = this.getCertificateById(id);
        if (!cert) throw new Error('Certificat non trouvé');
        if ((cert.provider || 'letsencrypt') !== 'letsencrypt') {
            throw new Error('Seuls les certificats Let\'s Encrypt peuvent être renouvelés ici');
        }
        if (!this.checkCertbot()) {
            throw new Error('Certbot n\'est pas installé');
        }
        assertDomainName(cert.domain);
        const args = ['renew', '--cert-name', cert.domain, '--non-interactive'];
        if (force) args.push('--force-renewal');
        await this.executeCertbot(cert, args, force ? 'Renouvellement forcé' : 'Renouvellement', { reload: true });
        return this.publicCertificate(cert);
    }

    async checkRenewal(id) {
        const cert = this.getCertificateById(id);
        if (!cert) throw new Error('Certificat non trouvé');
        if (!this.checkCertbot()) throw new Error('Certbot n\'est pas installé');
        assertDomainName(cert.domain);
        await this.executeCertbot(
            cert,
            ['renew', '--cert-name', cert.domain, '--dry-run', '--non-interactive'],
            'Vérification du renouvellement',
            { reload: false, checkOnly: true }
        );
        return this.publicCertificate(cert);
    }

    async executeCertbot(cert, args, label, { reload = false, checkOnly = false } = {}) {
        let output = '';
        try {
            output = execFileSync('certbot', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (error) {
            output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`.trim();
            this.appendLog(cert.id, label, output);
            cert.lastError = output.slice(-2000);
            if (checkOnly) {
                cert.lastCheckAt = new Date().toISOString();
                cert.lastCheckStatus = 'error';
            } else {
                cert.lastRenewalAt = new Date().toISOString();
                cert.lastRenewalStatus = 'error';
            }
            this.saveDatabase();
            throw new Error(cert.lastError || 'Certbot a échoué');
        }

        this.appendLog(cert.id, label, output || 'Certbot terminé.');
        if (checkOnly) {
            cert.lastCheckAt = new Date().toISOString();
            cert.lastCheckStatus = 'success';
            cert.lastError = '';
            this.saveDatabase();
            return;
        }

        const live = this.inspectCertificate(cert.certPath);
        cert.issuedAt = live.issuedAt || cert.issuedAt;
        cert.expiresAt = live.expiresAt || cert.expiresAt;
        cert.domains = live.domains;
        cert.lastRenewalAt = new Date().toISOString();
        cert.lastRenewalStatus = live.status === 'error' ? 'error' : 'success';
        cert.lastError = live.error || '';
        this.saveDatabase();

        if (reload) {
            const nginx = (await import('./nginx.js')).default;
            await nginx.reloadNginx();
        }
    }

    getRenewalServiceStatus() {
        const enabled = this.systemctl(['is-enabled', 'certbot.timer']);
        const active = this.systemctl(['is-active', 'certbot.timer']);
        if (enabled.stdout || enabled.stderr) {
            const state = enabled.stdout || '';
            if (state === 'enabled' || state === 'disabled' || state === 'static') {
                return {
                    mechanism: 'systemd',
                    unit: 'certbot.timer',
                    enabled: state === 'enabled',
                    active: active.stdout === 'active',
                    manageable: true,
                    detail: state === 'enabled'
                        ? 'Le timer certbot.timer est activé.'
                        : 'Le timer certbot.timer est installé mais désactivé.'
                };
            }
        }
        if (fs.existsSync('/etc/cron.d/certbot')) {
            return {
                mechanism: 'cron',
                unit: '/etc/cron.d/certbot',
                enabled: true,
                active: true,
                manageable: false,
                detail: 'Le renouvellement est planifié par cron. Le timer systemd n\'est pas pilotable.'
            };
        }
        return {
            mechanism: null,
            unit: null,
            enabled: false,
            active: false,
            manageable: false,
            detail: enabled.stderr || 'Aucun timer certbot ni tâche cron détecté.'
        };
    }

    setAutoRenew(enabled) {
        const current = this.getRenewalServiceStatus();
        if (!current.manageable) {
            throw new Error(current.detail || 'Le renouvellement automatique ne peut pas être modifié sur ce système.');
        }
        const result = this.systemctl([enabled ? 'enable' : 'disable', '--now', 'certbot.timer']);
        if (result.code !== 0) {
            throw new Error(result.stderr || result.stdout || 'systemctl a échoué');
        }
        return this.getRenewalServiceStatus();
    }

    systemctl(args) {
        try {
            const stdout = execFileSync('systemctl', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
            return { code: 0, stdout, stderr: '' };
        } catch (error) {
            return {
                code: error.status || 1,
                stdout: `${error.stdout || ''}`.trim(),
                stderr: `${error.stderr || error.message || ''}`.trim()
            };
        }
    }

    buildSubject(options) {
        const parts = [];
        
        if (options.country) parts.push(`C=${options.country}`);
        if (options.state) parts.push(`ST=${options.state}`);
        if (options.city) parts.push(`L=${options.city}`);
        if (options.organization) parts.push(`O=${options.organization}`);
        if (options.organizationalUnit) parts.push(`OU=${options.organizationalUnit}`);
        if (options.domain) parts.push(`CN=${options.domain}`);
        if (options.email) parts.push(`emailAddress=${options.email}`);

        return '/' + parts.join('/');
    }

    deleteCertificate(id) {
        const cert = this.getCertificateById(id);
        if (!cert) {
            throw new Error('Certificat non trouvé');
        }

        try {
            this.certificates = this.certificates.filter(c => c.id !== id);
            this.saveDatabase();

            logger.info(`Certificat SSL supprimé: ${cert.domain}`);
            return true;
        } catch (error) {
            logger.error(`Erreur lors de la suppression du certificat: ${error.message}`);
            throw new Error(`Impossible de supprimer le certificat: ${error.message}`);
        }
    }

    getCertificateDetails(id) {
        const cert = this.getCertificateById(id);
        if (!cert) {
            throw new Error('Certificat non trouvé');
        }

        try {
            let certContent = '';
            if (fs.existsSync(cert.certPath)) {
                certContent = fs.readFileSync(cert.certPath, 'utf8');
            }

            const live = this.inspectCertificate(cert.certPath);
            return {
                ...this.publicCertificate(cert),
                email: cert.email || '',
                country: cert.country,
                state: cert.state,
                city: cert.city,
                organization: cert.organization,
                organizationalUnit: cert.organizationalUnit,
                certContent,
                renewalLog: this.readRenewalLog(cert.id),
                issuedAt: live.issuedAt || cert.issuedAt || cert.createdAt,
                expiresAt: live.expiresAt || cert.expiresAt,
                status: live.status,
                statusError: live.error || cert.lastError || '',
                domains: live.domains.length ? live.domains : [cert.domain]
            };
        } catch (error) {
            logger.error(`Erreur lors de la lecture du certificat: ${error.message}`);
            throw new Error(`Impossible de lire le certificat: ${error.message}`);
        }
    }

    downloadCertificate(id, type) {
        const cert = this.getCertificateById(id);
        if (!cert) {
            throw new Error('Certificat non trouvé');
        }

        const filePath = type === 'cert' ? cert.certPath : cert.keyPath;
        
        if (!fs.existsSync(filePath)) {
            throw new Error('Fichier non trouvé');
        }

        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            logger.error(`Erreur lors de la lecture du fichier: ${error.message}`);
            throw new Error(`Impossible de lire le fichier: ${error.message}`);
        }
    }

    checkCertbot() {
        try {
            execFileSync('which', ['certbot'], { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }

    // ============================================
    // GESTION DES TEMPLATES
    // ============================================

    loadTemplates() {
        try {
            if (fs.existsSync(SSL_TEMPLATES_FILE)) {
                const data = fs.readFileSync(SSL_TEMPLATES_FILE, 'utf8');
                this.templates = JSON.parse(data);
            } else {
                this.templates = [];
                this.saveTemplates();
            }
        } catch (error) {
            logger.error(`Erreur lors du chargement des templates SSL: ${error.message}`);
            this.templates = [];
        }
    }

    saveTemplates() {
        try {
            fs.writeFileSync(SSL_TEMPLATES_FILE, JSON.stringify(this.templates, null, 2), { mode: 0o644 });
        } catch (error) {
            logger.error(`Erreur lors de la sauvegarde des templates SSL: ${error.message}`);
            throw error;
        }
    }

    getAllTemplates() {
        return this.templates;
    }

    getTemplateById(id) {
        return this.templates.find(template => template.id === id);
    }

    createTemplate(options) {
        const {
            name,
            country = 'FR',
            state = '',
            city = '',
            organization = '',
            organizationalUnit = '',
            email = '',
            validityDays = 365
        } = options;

        if (!name) {
            throw new Error('Le nom du template est requis');
        }

        // Vérifier si un template avec ce nom existe déjà
        if (this.templates.some(t => t.name === name)) {
            throw new Error('Un template avec ce nom existe déjà');
        }

        const id = uuidv4();
        const createdAt = new Date().toISOString();

        const template = {
            id,
            name,
            country,
            state,
            city,
            organization,
            organizationalUnit,
            email,
            validityDays,
            createdAt
        };

        this.templates.push(template);
        this.saveTemplates();

        logger.info(`Template SSL créé: ${name}`);
        return template;
    }

    deleteTemplate(id) {
        const template = this.getTemplateById(id);
        if (!template) {
            throw new Error('Template non trouvé');
        }

        this.templates = this.templates.filter(t => t.id !== id);
        this.saveTemplates();

        logger.info(`Template SSL supprimé: ${template.name}`);
        return true;
    }

    // ============================================
    // IMPORT / EXPORT
    // ============================================

    registerCertificate(options) {
        const {
            domain,
            certPath,
            keyPath,
            linkedProject = '',
            provider = 'imported',
            createdAt = null,
            expiresAt = null
        } = options;

        if (!domain || !certPath || !keyPath) {
            throw new Error('Domaine, chemin du certificat et chemin de la clé sont requis');
        }

        // Vérifier si un certificat pour ce domaine existe déjà
        if (this.certificates.some(c => c.domain === domain)) {
            throw new Error(`Un certificat pour ${domain} existe déjà`);
        }

        const id = uuidv4();
        const cert = {
            id,
            domain,
            provider,
            linkedProject,
            certPath,
            keyPath,
            createdAt: createdAt || new Date().toISOString(),
            expiresAt
        };

        this.certificates.push(cert);
        this.saveDatabase();

        logger.info(`Certificat SSL enregistré: ${domain}`);
        return cert;
    }
}

const sslManager = new SSLManager();
export default sslManager;
