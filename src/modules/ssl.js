/**
 * Module de gestion des certificats SSL Let's Encrypt
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

const SSL_DIR = '/etc/ssl/twoine';
const SSL_DB_FILE = path.join(SSL_DIR, 'certificates.json');
const SSL_TEMPLATES_FILE = path.join(SSL_DIR, 'templates.json');

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
        return this.certificates.map(cert => ({
            id: cert.id,
            domain: cert.domain,
            provider: cert.provider || 'letsencrypt',
            linkedProject: cert.linkedProject || '',
            organization: cert.organization,
            country: cert.country,
            certPath: cert.certPath,
            keyPath: cert.keyPath,
            createdAt: cert.createdAt,
            expiresAt: cert.expiresAt
        }));
    }

    getCertificateById(id) {
        return this.certificates.find(cert => cert.id === id);
    }

    createCertificate(options) {
        const {
            domain,
            country = 'FR',
            state = '',
            city = '',
            organization = '',
            organizationalUnit = '',
            email = '',
            validityDays = 90,
            linkedProject = ''
        } = options;

        if (!domain) {
            throw new Error('Le domaine est requis');
        }
        if (domain.includes('*')) {
            throw new Error("Les certificats wildcard nécessitent un challenge DNS et ne sont pas supportés par cette méthode.");
        }
        if (!email) {
            throw new Error("L'email est requis pour Let's Encrypt");
        }
        if (!linkedProject) {
            throw new Error('Le projet lié est requis');
        }
        if (!this.checkCertbot()) {
            throw new Error("Certbot n'est pas installé. Installez certbot et python3-certbot-nginx.");
        }

        const id = uuidv4();
        const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
        const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

        if (this.certificates.some(cert => cert.domain === domain)) {
            throw new Error('Un certificat existe déjà pour ce domaine');
        }

        try {
            const command = `certbot certonly --nginx --non-interactive --agree-tos --email "${email}" -d "${domain}" --keep-until-expiring`;
            
            logger.info(`Génération du certificat Let's Encrypt pour ${domain}...`);
            execSync(command, { stdio: 'pipe' });

            const createdAt = new Date().toISOString();
            const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

            const certificate = {
                id,
                domain,
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
                createdAt,
                expiresAt
            };

            this.certificates.push(certificate);
            this.saveDatabase();

            logger.info(`Certificat Let's Encrypt créé avec succès pour ${domain}`);
            return certificate;
        } catch (error) {
            logger.error(`Erreur lors de la création du certificat: ${error.message}`);
            throw new Error(`Impossible de créer le certificat: ${error.message}`);
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

            return {
                ...cert,
                certContent
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
            execSync('command -v certbot >/dev/null 2>&1', { stdio: 'pipe', shell: '/bin/bash' });
            return true;
        } catch (error) {
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
}

const sslManager = new SSLManager();
export default sslManager;
