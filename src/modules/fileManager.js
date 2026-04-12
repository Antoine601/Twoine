/**
 * Module de gestion des fichiers via le système de fichiers
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);

/**
 * Liste les fichiers et dossiers d'un répertoire
 */
async function listFiles(projectPath, relativePath = '') {
    const fullPath = path.join(projectPath, relativePath);
    
    // Vérifier que le chemin est bien dans le projet
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error('Répertoire non trouvé');
    }

    const items = await readdir(fullPath);
    const files = [];

    for (const item of items) {
        try {
            const itemPath = path.join(fullPath, item);
            const stats = await stat(itemPath);
            
            files.push({
                name: item,
                path: path.join(relativePath, item).replace(/\\/g, '/'),
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime,
                permissions: stats.mode
            });
        } catch (err) {
            // Ignorer les fichiers inaccessibles
        }
    }

    return files.sort((a, b) => {
        // Dossiers en premier
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}

/**
 * Crée un nouveau dossier
 */
async function createDirectory(projectPath, relativePath, dirName) {
    const fullPath = path.join(projectPath, relativePath, dirName);
    
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (fs.existsSync(fullPath)) {
        throw new Error('Un dossier avec ce nom existe déjà');
    }

    await mkdir(fullPath, { recursive: true });
    return { success: true, path: path.join(relativePath, dirName).replace(/\\/g, '/') };
}

/**
 * Supprime un fichier ou dossier
 */
async function deleteItem(projectPath, relativePath) {
    const fullPath = path.join(projectPath, relativePath);
    
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error('Fichier ou dossier non trouvé');
    }

    const stats = await stat(fullPath);
    
    if (stats.isDirectory()) {
        // Supprimer récursivement
        await fs.promises.rm(fullPath, { recursive: true, force: true });
    } else {
        await unlink(fullPath);
    }

    return { success: true };
}

/**
 * Renomme un fichier ou dossier
 */
async function renameItem(projectPath, oldRelativePath, newName) {
    const oldFullPath = path.join(projectPath, oldRelativePath);
    const directory = path.dirname(oldFullPath);
    const newFullPath = path.join(directory, newName);
    
    if (!oldFullPath.startsWith(projectPath) || !newFullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(oldFullPath)) {
        throw new Error('Fichier ou dossier non trouvé');
    }

    if (fs.existsSync(newFullPath)) {
        throw new Error('Un fichier ou dossier avec ce nom existe déjà');
    }

    await rename(oldFullPath, newFullPath);
    
    const newRelativePath = path.relative(projectPath, newFullPath).replace(/\\/g, '/');
    return { success: true, newPath: newRelativePath };
}

/**
 * Lit le contenu d'un fichier
 */
function readFile(projectPath, relativePath) {
    const fullPath = path.join(projectPath, relativePath);
    
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error('Fichier non trouvé');
    }

    return fs.createReadStream(fullPath);
}

/**
 * Écrit un fichier
 */
async function writeFile(projectPath, relativePath, fileStream) {
    const fullPath = path.join(projectPath, relativePath);
    
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    // Créer le dossier parent si nécessaire
    const directory = path.dirname(fullPath);
    if (!fs.existsSync(directory)) {
        await mkdir(directory, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(fullPath);
        fileStream.pipe(writeStream);
        
        writeStream.on('finish', () => resolve({ success: true }));
        writeStream.on('error', reject);
    });
}

/**
 * Obtient les informations d'un fichier
 */
async function getFileInfo(projectPath, relativePath) {
    const fullPath = path.join(projectPath, relativePath);
    
    if (!fullPath.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(fullPath)) {
        throw new Error('Fichier non trouvé');
    }

    const stats = await stat(fullPath);
    
    return {
        name: path.basename(fullPath),
        path: relativePath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        permissions: stats.mode
    };
}

/**
 * Copie un fichier ou dossier
 */
async function copyItem(projectPath, sourcePath, destPath) {
    const fullSource = path.join(projectPath, sourcePath);
    const fullDest = path.join(projectPath, destPath);

    if (!fullSource.startsWith(projectPath) || !fullDest.startsWith(projectPath)) {
        throw new Error('Accès refusé : chemin invalide');
    }

    if (!fs.existsSync(fullSource)) {
        throw new Error('Source non trouvée');
    }

    if (fs.existsSync(fullDest)) {
        throw new Error('La destination existe déjà');
    }

    const destDir = path.dirname(fullDest);
    if (!fs.existsSync(destDir)) {
        await mkdir(destDir, { recursive: true });
    }

    await fs.promises.cp(fullSource, fullDest, { recursive: true });
    return { success: true };
}

export default {
    listFiles,
    createDirectory,
    deleteItem,
    copyItem,
    renameItem,
    readFile,
    writeFile,
    getFileInfo
};
