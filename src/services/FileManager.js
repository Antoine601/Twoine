/**
 * TWOINE - File Manager Service
 * Gestion sécurisée des fichiers pour l'explorateur web intégré
 * Implémente les opérations: list, read, write, upload, delete, rename
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');

const execAsync = promisify(exec);

// Configuration
const SITES_DIR = process.env.SITES_DIR || '/var/www/sites';
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800', 10); // 50MB
const MAX_TEXT_FILE_SIZE = parseInt(process.env.MAX_TEXT_FILE_SIZE || '5242880', 10); // 5MB pour édition

// Extensions de fichiers texte éditables
const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
    '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg',
    '.yml', '.yaml', '.toml', '.ini', '.conf', '.cfg', '.env', '.env.example',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.py', '.rb', '.php', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
    '.sql', '.graphql', '.prisma', '.dockerfile', '.gitignore', '.npmrc',
    '.eslintrc', '.prettierrc', '.editorconfig', 'Makefile', 'Procfile',
]);

// Extensions dangereuses interdites
const DANGEROUS_EXTENSIONS = new Set([
    '.exe', '.dll', '.so', '.dylib', '.bin', '.com', '.bat', '.cmd', '.ps1',
    '.msi', '.app', '.dmg', '.pkg', '.deb', '.rpm',
]);

class FileManager {
    constructor(options = {}) {
        this.sitesDir = options.sitesDir || SITES_DIR;
        this.maxFileSize = options.maxFileSize || MAX_FILE_SIZE;
        this.maxTextFileSize = options.maxTextFileSize || MAX_TEXT_FILE_SIZE;
        this.dryRun = options.dryRun || false;
    }

    // =========================================================================
    // SÉCURITÉ - Validation des chemins
    // =========================================================================

    /**
     * Valide et normalise un chemin pour un site donné
     * CRITIQUE: Empêche les attaques de traversée de répertoire
     * @param {string} siteName - Nom du site
     * @param {string} relativePath - Chemin relatif demandé
     * @returns {Object} - { valid, absolutePath, relativePath, error }
     */
    validatePath(siteName, relativePath = '/') {
        // Valider le nom du site
        if (!this.validateSiteName(siteName)) {
            return { valid: false, error: 'Invalid site name' };
        }

        // Chemin racine du site
        const siteRoot = path.join(this.sitesDir, siteName);

        // Normaliser le chemin relatif
        let cleanPath = relativePath || '/';
        
        // Supprimer les caractères dangereux
        cleanPath = cleanPath.replace(/\0/g, ''); // Null bytes
        
        // Normaliser les séparateurs
        cleanPath = cleanPath.replace(/\\/g, '/');
        
        // Résoudre le chemin absolu
        const absolutePath = path.resolve(siteRoot, cleanPath.replace(/^\//, ''));
        
        // CRITIQUE: Vérifier que le chemin reste dans le répertoire du site
        const normalizedSiteRoot = path.normalize(siteRoot);
        const normalizedAbsolutePath = path.normalize(absolutePath);
        
        if (!normalizedAbsolutePath.startsWith(normalizedSiteRoot)) {
            return {
                valid: false,
                error: 'Path traversal detected: Access denied',
            };
        }

        // Calculer le chemin relatif propre
        const safeRelativePath = '/' + path.relative(siteRoot, absolutePath).replace(/\\/g, '/');

        return {
            valid: true,
            absolutePath: normalizedAbsolutePath,
            relativePath: safeRelativePath,
            siteRoot: normalizedSiteRoot,
        };
    }

    /**
     * Valide le nom du site
     * @param {string} name 
     * @returns {boolean}
     */
    validateSiteName(name) {
        const pattern = /^[a-z][a-z0-9_-]{2,29}$/;
        return pattern.test(name);
    }

    /**
     * Vérifie si un fichier est un lien symbolique vers l'extérieur
     * @param {string} filePath 
     * @param {string} siteRoot 
     * @returns {Promise<boolean>}
     */
    async isSymlinkOutside(filePath, siteRoot) {
        try {
            const stats = await fs.lstat(filePath);
            if (stats.isSymbolicLink()) {
                const target = await fs.realpath(filePath);
                return !target.startsWith(siteRoot);
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Vérifie si un nom de fichier est valide
     * @param {string} filename 
     * @returns {Object}
     */
    validateFilename(filename) {
        if (!filename || typeof filename !== 'string') {
            return { valid: false, error: 'Filename is required' };
        }

        // Caractères interdits
        const invalidChars = /[<>:"|?*\x00-\x1f]/;
        if (invalidChars.test(filename)) {
            return { valid: false, error: 'Filename contains invalid characters' };
        }

        // Noms réservés Windows
        const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
        if (reserved.test(filename.split('.')[0])) {
            return { valid: false, error: 'Filename is reserved' };
        }

        // Longueur
        if (filename.length > 255) {
            return { valid: false, error: 'Filename too long' };
        }

        // Pas de .. ou /
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return { valid: false, error: 'Invalid filename format' };
        }

        // Extension dangereuse
        const ext = path.extname(filename).toLowerCase();
        if (DANGEROUS_EXTENSIONS.has(ext)) {
            return { valid: false, error: 'File type not allowed' };
        }

        return { valid: true };
    }

    // =========================================================================
    // OPÉRATIONS DE FICHIERS
    // =========================================================================

    /**
     * Liste le contenu d'un répertoire
     * @param {string} siteName 
     * @param {string} relativePath 
     * @returns {Promise<Object>}
     */
    async listDirectory(siteName, relativePath = '/') {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath, siteRoot } = validation;

        // Vérifier que le répertoire existe
        try {
            const stats = await fs.stat(absolutePath);
            if (!stats.isDirectory()) {
                throw new Error('Path is not a directory');
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Directory not found');
            }
            throw error;
        }

        // Lire le contenu
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            const entryPath = path.join(absolutePath, entry.name);
            
            // Vérifier les liens symboliques dangereux
            if (await this.isSymlinkOutside(entryPath, siteRoot)) {
                continue; // Ignorer les symlinks vers l'extérieur
            }

            try {
                const stats = await fs.stat(entryPath);
                const isDirectory = stats.isDirectory();
                const ext = isDirectory ? null : path.extname(entry.name).toLowerCase();

                items.push({
                    name: entry.name,
                    path: path.join(safePath, entry.name).replace(/\\/g, '/'),
                    type: isDirectory ? 'directory' : 'file',
                    size: isDirectory ? null : stats.size,
                    modified: stats.mtime.toISOString(),
                    created: stats.birthtime.toISOString(),
                    extension: ext,
                    isEditable: ext ? TEXT_EXTENSIONS.has(ext) : false,
                    permissions: this.formatPermissions(stats.mode),
                });
            } catch {
                // Ignorer les fichiers inaccessibles
            }
        }

        // Trier: dossiers d'abord, puis par nom
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        return {
            path: safePath,
            parentPath: safePath === '/' ? null : path.dirname(safePath).replace(/\\/g, '/'),
            items,
            totalItems: items.length,
        };
    }

    /**
     * Lit le contenu d'un fichier texte
     * @param {string} siteName 
     * @param {string} relativePath 
     * @returns {Promise<Object>}
     */
    async readFile(siteName, relativePath) {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath, siteRoot } = validation;

        // Vérifier que le fichier existe
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
            throw new Error('Cannot read a directory');
        }

        // Vérifier les symlinks
        if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
            throw new Error('Access denied: symlink outside site');
        }

        // Vérifier la taille
        if (stats.size > this.maxTextFileSize) {
            throw new Error(`File too large for editing (max: ${this.maxTextFileSize} bytes)`);
        }

        // Vérifier si c'est un fichier texte
        const ext = path.extname(absolutePath).toLowerCase();
        const isText = TEXT_EXTENSIONS.has(ext) || ext === '' || stats.size === 0;

        if (!isText) {
            throw new Error('File is not a text file');
        }

        const content = await fs.readFile(absolutePath, 'utf8');

        return {
            path: safePath,
            name: path.basename(absolutePath),
            content,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            extension: ext,
            encoding: 'utf8',
        };
    }

    /**
     * Écrit du contenu dans un fichier
     * @param {string} siteName 
     * @param {string} relativePath 
     * @param {string} content 
     * @param {Object} options 
     * @returns {Promise<Object>}
     */
    async writeFile(siteName, relativePath, content, options = {}) {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath, siteRoot } = validation;
        const filename = path.basename(absolutePath);

        // Valider le nom de fichier
        const filenameValidation = this.validateFilename(filename);
        if (!filenameValidation.valid) {
            throw new Error(filenameValidation.error);
        }

        // Vérifier si c'est un fichier existant
        let isNewFile = true;
        try {
            const stats = await fs.stat(absolutePath);
            if (stats.isDirectory()) {
                throw new Error('Cannot write to a directory');
            }
            isNewFile = false;

            // Vérifier les symlinks
            if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
                throw new Error('Access denied: symlink outside site');
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // Vérifier la taille du contenu
        const contentSize = Buffer.byteLength(content, 'utf8');
        if (contentSize > this.maxTextFileSize) {
            throw new Error(`Content too large (max: ${this.maxTextFileSize} bytes)`);
        }

        // Créer le répertoire parent si nécessaire
        const parentDir = path.dirname(absolutePath);
        await fs.mkdir(parentDir, { recursive: true });

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would write to: ${absolutePath}`);
            return { path: safePath, size: contentSize, dryRun: true };
        }

        // Écrire le fichier
        await fs.writeFile(absolutePath, content, 'utf8');

        // Définir les permissions
        await this.setFileOwnership(absolutePath, siteName);

        const stats = await fs.stat(absolutePath);

        return {
            path: safePath,
            name: filename,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            isNewFile,
        };
    }

    /**
     * Supprime un fichier ou répertoire
     * @param {string} siteName 
     * @param {string} relativePath 
     * @param {boolean} recursive - Pour les répertoires
     * @returns {Promise<Object>}
     */
    async deleteItem(siteName, relativePath, recursive = false) {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath, siteRoot } = validation;

        // Empêcher la suppression de la racine
        if (absolutePath === siteRoot) {
            throw new Error('Cannot delete site root directory');
        }

        // Vérifier que le fichier/dossier existe
        const stats = await fs.stat(absolutePath);

        // Vérifier les symlinks
        if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
            throw new Error('Access denied: symlink outside site');
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete: ${absolutePath}`);
            return { path: safePath, deleted: true, dryRun: true };
        }

        if (stats.isDirectory()) {
            if (!recursive) {
                // Vérifier si le dossier est vide
                const entries = await fs.readdir(absolutePath);
                if (entries.length > 0) {
                    throw new Error('Directory is not empty. Use recursive=true to delete.');
                }
            }
            await fs.rm(absolutePath, { recursive: true, force: true });
        } else {
            await fs.unlink(absolutePath);
        }

        return {
            path: safePath,
            deleted: true,
            type: stats.isDirectory() ? 'directory' : 'file',
        };
    }

    /**
     * Renomme un fichier ou répertoire
     * @param {string} siteName 
     * @param {string} oldPath 
     * @param {string} newName 
     * @returns {Promise<Object>}
     */
    async renameItem(siteName, oldPath, newName) {
        const validation = this.validatePath(siteName, oldPath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Valider le nouveau nom
        const filenameValidation = this.validateFilename(newName);
        if (!filenameValidation.valid) {
            throw new Error(filenameValidation.error);
        }

        const { absolutePath, siteRoot } = validation;
        const parentDir = path.dirname(absolutePath);
        const newAbsolutePath = path.join(parentDir, newName);

        // Vérifier que le nouveau chemin reste dans le site
        const newValidation = this.validatePath(siteName, path.join(path.dirname(oldPath), newName));
        if (!newValidation.valid) {
            throw new Error('Invalid destination path');
        }

        // Vérifier que la source existe
        await fs.stat(absolutePath);

        // Vérifier les symlinks
        if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
            throw new Error('Access denied: symlink outside site');
        }

        // Vérifier que la destination n'existe pas
        try {
            await fs.stat(newAbsolutePath);
            throw new Error('Destination already exists');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would rename: ${absolutePath} -> ${newAbsolutePath}`);
            return { oldPath, newPath: newValidation.relativePath, dryRun: true };
        }

        await fs.rename(absolutePath, newAbsolutePath);

        return {
            oldPath: validation.relativePath,
            newPath: newValidation.relativePath,
            newName,
        };
    }

    /**
     * Crée un nouveau répertoire
     * @param {string} siteName 
     * @param {string} relativePath 
     * @returns {Promise<Object>}
     */
    async createDirectory(siteName, relativePath) {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath } = validation;
        const dirname = path.basename(absolutePath);

        // Valider le nom du dossier
        const nameValidation = this.validateFilename(dirname);
        if (!nameValidation.valid) {
            throw new Error(nameValidation.error);
        }

        // Vérifier que ça n'existe pas déjà
        try {
            await fs.stat(absolutePath);
            throw new Error('Directory already exists');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create directory: ${absolutePath}`);
            return { path: safePath, created: true, dryRun: true };
        }

        await fs.mkdir(absolutePath, { recursive: true });
        await this.setFileOwnership(absolutePath, siteName);

        return {
            path: safePath,
            name: dirname,
            created: true,
        };
    }

    /**
     * Upload un fichier
     * @param {string} siteName 
     * @param {string} targetDir 
     * @param {Object} file - { originalname, buffer, size }
     * @returns {Promise<Object>}
     */
    async uploadFile(siteName, targetDir, file) {
        const validation = this.validatePath(siteName, targetDir);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Valider le nom de fichier
        const filenameValidation = this.validateFilename(file.originalname);
        if (!filenameValidation.valid) {
            throw new Error(filenameValidation.error);
        }

        // Vérifier la taille
        if (file.size > this.maxFileSize) {
            throw new Error(`File too large (max: ${this.maxFileSize} bytes)`);
        }

        const { absolutePath: targetDirPath } = validation;
        const targetFilePath = path.join(targetDirPath, file.originalname);

        // Vérifier que le chemin de destination est valide
        const fileValidation = this.validatePath(siteName, path.join(targetDir, file.originalname));
        if (!fileValidation.valid) {
            throw new Error('Invalid target path');
        }

        // Vérifier que le répertoire cible existe
        try {
            const stats = await fs.stat(targetDirPath);
            if (!stats.isDirectory()) {
                throw new Error('Target is not a directory');
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Créer le répertoire
                await fs.mkdir(targetDirPath, { recursive: true });
            } else {
                throw error;
            }
        }

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would upload to: ${targetFilePath}`);
            return { path: fileValidation.relativePath, dryRun: true };
        }

        // Écrire le fichier
        await fs.writeFile(targetFilePath, file.buffer);
        await this.setFileOwnership(targetFilePath, siteName);

        const stats = await fs.stat(targetFilePath);

        return {
            path: fileValidation.relativePath,
            name: file.originalname,
            size: stats.size,
            modified: stats.mtime.toISOString(),
        };
    }

    /**
     * Télécharge un fichier (retourne le chemin absolu pour streaming)
     * @param {string} siteName 
     * @param {string} relativePath 
     * @returns {Promise<Object>}
     */
    async getFileForDownload(siteName, relativePath) {
        const validation = this.validatePath(siteName, relativePath);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const { absolutePath, relativePath: safePath, siteRoot } = validation;

        // Vérifier que le fichier existe
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
            throw new Error('Cannot download a directory');
        }

        // Vérifier les symlinks
        if (await this.isSymlinkOutside(absolutePath, siteRoot)) {
            throw new Error('Access denied: symlink outside site');
        }

        return {
            absolutePath,
            path: safePath,
            name: path.basename(absolutePath),
            size: stats.size,
            mimeType: this.getMimeType(absolutePath),
        };
    }

    // =========================================================================
    // UTILITAIRES
    // =========================================================================

    /**
     * Définit la propriété du fichier pour le site
     * @param {string} filePath 
     * @param {string} siteName 
     */
    async setFileOwnership(filePath, siteName) {
        const username = `site_${siteName}`;
        try {
            await execAsync(`sudo chown ${username}:sftpusers "${filePath}"`);
        } catch (error) {
            console.warn(`Failed to set ownership: ${error.message}`);
        }
    }

    /**
     * Formate les permissions en notation rwx
     * @param {number} mode 
     * @returns {string}
     */
    formatPermissions(mode) {
        const perms = [
            (mode & 0o400) ? 'r' : '-',
            (mode & 0o200) ? 'w' : '-',
            (mode & 0o100) ? 'x' : '-',
            (mode & 0o040) ? 'r' : '-',
            (mode & 0o020) ? 'w' : '-',
            (mode & 0o010) ? 'x' : '-',
            (mode & 0o004) ? 'r' : '-',
            (mode & 0o002) ? 'w' : '-',
            (mode & 0o001) ? 'x' : '-',
        ];
        return perms.join('');
    }

    /**
     * Obtient le type MIME d'un fichier
     * @param {string} filePath 
     * @returns {string}
     */
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Obtient les statistiques d'utilisation disque d'un site
     * @param {string} siteName 
     * @returns {Promise<Object>}
     */
    async getDiskUsage(siteName) {
        const validation = this.validatePath(siteName, '/');
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        try {
            const { stdout } = await execAsync(`du -sb "${validation.siteRoot}"`);
            const [sizeStr] = stdout.trim().split('\t');
            const sizeBytes = parseInt(sizeStr, 10);

            const { stdout: countOutput } = await execAsync(
                `find "${validation.siteRoot}" -type f | wc -l`
            );
            const fileCount = parseInt(countOutput.trim(), 10);

            return {
                sizeBytes,
                sizeFormatted: this.formatBytes(sizeBytes),
                fileCount,
            };
        } catch (error) {
            throw new Error(`Failed to get disk usage: ${error.message}`);
        }
    }

    /**
     * Formate une taille en bytes en format lisible
     * @param {number} bytes 
     * @returns {string}
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Export singleton et classe
const defaultManager = new FileManager();

module.exports = {
    FileManager,
    fileManager: defaultManager,
    TEXT_EXTENSIONS,
    DANGEROUS_EXTENSIONS,
};
