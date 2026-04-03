/**
 * Module de gestion des projets
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH, PROJECT_STRUCTURE, TOOL_CONFIG_PATH, PROJECTS_CONFIG_FILE } from '../config/constants.js';
import sftp from './sftp.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';
import databases from './databases.js';

/**
 * Initialise les dossiers de configuration de l'outil
 */
export function initConfigDir() {
    if (!fs.existsSync(TOOL_CONFIG_PATH)) {
        fs.mkdirSync(TOOL_CONFIG_PATH, { recursive: true });
        logger.debug(`Dossier de configuration créé: ${TOOL_CONFIG_PATH}`);
    }

    if (!fs.existsSync(PROJECTS_CONFIG_FILE)) {
        fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify({ projects: [] }, null, 2));
        logger.debug(`Fichier de configuration créé: ${PROJECTS_CONFIG_FILE}`);
    }
}

/**
 * Charge la liste des projets depuis le fichier de configuration
 * @returns {Array} - Liste des projets
 */
export function loadProjects() {
    try {
        initConfigDir();
        const data = fs.readFileSync(PROJECTS_CONFIG_FILE, 'utf8');
        const config = JSON.parse(data);
        return config.projects || [];
    } catch (error) {
        logger.error(`Erreur lors du chargement des projets: ${error.message}`);
        return [];
    }
}

/**
 * Sauvegarde la liste des projets
 * @param {Array} projects - Liste des projets
 */
export function saveProjects(projects) {
    try {
        initConfigDir();
        const config = { projects, updatedAt: new Date().toISOString() };
        fs.writeFileSync(PROJECTS_CONFIG_FILE, JSON.stringify(config, null, 2));
        logger.debug('Configuration des projets sauvegardée');
    } catch (error) {
        throw new Error(`Erreur lors de la sauvegarde: ${error.message}`);
    }
}

/**
 * Récupère un projet par son nom
 * @param {string} projectName - Nom du projet
 * @returns {object|null}
 */
export function getProject(projectName) {
    const projects = loadProjects();
    return projects.find(p => p.name === projectName) || null;
}

/**
 * Vérifie si un projet existe
 * @param {string} projectName - Nom du projet
 * @returns {boolean}
 */
export function projectExists(projectName) {
    return getProject(projectName) !== null;
}

/**
 * Charge la configuration d'un projet (project.json dans le dossier du projet)
 * @param {string} projectName - Nom du projet
 * @returns {object}
 */
export function loadProjectConfig(projectName) {
    const configPath = path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.config);
    
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.warn(`Erreur lors du chargement de la config du projet: ${error.message}`);
    }

    // Configuration par défaut
    return {
        name: projectName,
        services: [],
        createdAt: new Date().toISOString()
    };
}

/**
 * Sauvegarde la configuration d'un projet
 * @param {string} projectName - Nom du projet
 * @param {object} config - Configuration à sauvegarder
 */
export function saveProjectConfig(projectName, config) {
    const configPath = path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.config);
    
    try {
        config.updatedAt = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        logger.debug(`Configuration du projet ${projectName} sauvegardée`);
    } catch (error) {
        throw new Error(`Erreur lors de la sauvegarde de la config: ${error.message}`);
    }
}

/**
 * Crée un nouveau projet
 * @param {string} projectName - Nom du projet
 * @param {string} sftpPassword - Mot de passe SFTP
 * @returns {Promise<object>}
 */
export async function createProject(projectName, sftpPassword) {
    // Valider le nom du projet
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(projectName)) {
        throw new Error('Le nom du projet doit commencer par une lettre et ne contenir que des lettres, chiffres, tirets et underscores');
    }

    // Vérifier si le projet existe déjà
    if (projectExists(projectName)) {
        throw new Error(`Le projet ${projectName} existe déjà`);
    }

    const projectPath = path.join(BASE_PATH, projectName);

    // Vérifier si le dossier existe déjà
    if (fs.existsSync(projectPath)) {
        throw new Error(`Le dossier ${projectPath} existe déjà`);
    }

    logger.info(`Création du projet ${projectName}...`);

    // Créer la structure des dossiers
    const sitesPath = path.join(projectPath, PROJECT_STRUCTURE.sites);
    const scriptsPath = path.join(projectPath, PROJECT_STRUCTURE.scripts);

    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(sitesPath, { recursive: true });
    fs.mkdirSync(scriptsPath, { recursive: true });

    logger.success(`Dossiers créés: ${projectPath}`);

    // Créer l'utilisateur SFTP
    const sftpUsername = await sftp.createSftpUser(projectName, sftpPassword);

    // Créer la configuration du projet
    const projectConfig = {
        name: projectName,
        path: projectPath,
        sftpUser: sftpUsername,
        services: [],
        createdAt: new Date().toISOString()
    };

    saveProjectConfig(projectName, projectConfig);

    // Ajouter le projet à la liste globale
    const projects = loadProjects();
    projects.push({
        name: projectName,
        path: projectPath,
        sftpUser: sftpUsername,
        createdAt: projectConfig.createdAt
    });
    saveProjects(projects);

    // Mettre à jour la configuration SSH
    await sftp.updateSSHConfig(projects);

    logger.success(`Projet ${projectName} créé avec succès !`);

    return projectConfig;
}

/**
 * Supprime un projet
 * @param {string} projectName - Nom du projet
 * @param {boolean} deleteFiles - Supprimer les fichiers du projet
 * @returns {Promise<void>}
 */
export async function deleteProject(projectName, deleteFiles = false) {
    const project = getProject(projectName);
    
    if (!project) {
        throw new Error(`Le projet ${projectName} n'existe pas`);
    }

    logger.info(`Suppression du projet ${projectName}...`);

    // Arrêter tous les services PM2 du projet
    try {
        const projectConfig = loadProjectConfig(projectName);
        for (const service of projectConfig.services || []) {
            const processName = `${projectName}-${service.name}`;
            try {
                await shell.pm2Command(`delete ${processName}`);
            } catch {
                // Ignorer si le processus n'existe pas
            }
        }
    } catch (error) {
        logger.warn(`Erreur lors de l'arrêt des services: ${error.message}`);
    }

    // Supprimer l'utilisateur SFTP
    await sftp.deleteSftpUser(projectName);

    // Supprimer le projet de la liste
    let projects = loadProjects();
    projects = projects.filter(p => p.name !== projectName);
    saveProjects(projects);

    // Mettre à jour la configuration SSH
    await sftp.updateSSHConfig(projects);

    // Supprimer les fichiers si demandé
    if (deleteFiles) {
        const projectPath = path.join(BASE_PATH, projectName);
        if (fs.existsSync(projectPath)) {
            await shell.execCommand(`rm -rf "${projectPath}"`);
            logger.success(`Fichiers du projet supprimés: ${projectPath}`);
        }
    }

    logger.success(`Projet ${projectName} supprimé`);
}

/**
 * Liste tous les projets avec leur statut
 * @returns {Promise<Array>}
 */
export async function listProjectsWithStatus() {
    const projects = loadProjects();
    const result = [];

    for (const project of projects) {
        const projectConfig = loadProjectConfig(project.name);
        const sftpInfo = sftp.getSftpUserInfo(project.name);
        
        let runningServices = 0;
        let totalServices = projectConfig.services?.length || 0;

        for (const service of projectConfig.services || []) {
            const processName = `${project.name}-${service.name}`;
            const status = await shell.getPm2ProcessStatus(processName);
            if (status && status.pm2_env?.status === 'online') {
                runningServices++;
            }
        }

        result.push({
            ...project,
            sftpActive: sftpInfo !== null,
            totalServices,
            runningServices,
            services: projectConfig.services || []
        });
    }

    return result;
}

/**
 * Renomme un projet
 * @param {string} oldName - Ancien nom
 * @param {string} newName - Nouveau nom
 * @returns {Promise<void>}
 */
export async function renameProject(oldName, newName) {
    // Valider le nouveau nom
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newName)) {
        throw new Error('Le nom du projet doit commencer par une lettre et ne contenir que des lettres, chiffres, tirets et underscores');
    }

    // Vérifier que l'ancien projet existe
    const oldProject = getProject(oldName);
    if (!oldProject) {
        throw new Error(`Le projet ${oldName} n'existe pas`);
    }

    // Vérifier que le nouveau nom n'existe pas déjà
    if (projectExists(newName)) {
        throw new Error(`Le projet ${newName} existe déjà`);
    }

    const oldPath = path.join(BASE_PATH, oldName);
    const newPath = path.join(BASE_PATH, newName);

    // Vérifier que le nouveau dossier n'existe pas
    if (fs.existsSync(newPath)) {
        throw new Error(`Le dossier ${newPath} existe déjà`);
    }

    logger.info(`Renommage du projet ${oldName} vers ${newName}...`);

    // 1. Arrêter tous les services PM2 du projet
    logger.info('Arrêt des services PM2...');
    const projectConfig = loadProjectConfig(oldName);
    const stoppedServices = [];
    
    for (const service of projectConfig.services || []) {
        const oldProcessName = `${oldName}-${service.name}`;
        try {
            await shell.pm2Command(`delete ${oldProcessName}`);
            stoppedServices.push(service);
            logger.debug(`Service ${oldProcessName} arrêté`);
        } catch (error) {
            logger.warn(`Impossible d'arrêter ${oldProcessName}: ${error.message}`);
        }
    }

    // 2. Renommer l'utilisateur SFTP
    logger.info('Renommage de l\'utilisateur SFTP...');
    try {
        await sftp.renameSftpUser(oldName, newName);
    } catch (error) {
        throw new Error(`Erreur lors du renommage de l'utilisateur SFTP: ${error.message}`);
    }

    // 3. Renommer le dossier du projet
    logger.info('Renommage du dossier...');
    try {
        fs.renameSync(oldPath, newPath);
        logger.success(`Dossier renommé: ${oldPath} → ${newPath}`);
    } catch (error) {
        // Tenter de restaurer l'utilisateur SFTP en cas d'échec
        try {
            await sftp.renameSftpUser(newName, oldName);
        } catch {}
        throw new Error(`Erreur lors du renommage du dossier: ${error.message}`);
    }

    // 4. Mettre à jour la configuration du projet
    logger.info('Mise à jour de la configuration...');
    projectConfig.name = newName;
    projectConfig.path = newPath;
    projectConfig.sftpUser = `${sftp.SFTP_USER_PREFIX}${newName}`;
    
    // Mettre à jour les noms PM2 des services
    for (const service of projectConfig.services || []) {
        service.pm2Name = `${newName}-${service.name}`;
        
        // Mettre à jour les chemins si nécessaire
        if (service.directory && service.directory.includes(oldPath)) {
            service.directory = service.directory.replace(oldPath, newPath);
        }
    }

    // Sauvegarder la nouvelle configuration
    saveProjectConfig(newName, projectConfig);

    // Supprimer l'ancienne configuration
    const oldConfigPath = path.join(oldPath, PROJECT_STRUCTURE.config);
    if (fs.existsSync(oldConfigPath)) {
        try {
            fs.unlinkSync(oldConfigPath);
        } catch (error) {
            logger.warn(`Impossible de supprimer l'ancienne config: ${error.message}`);
        }
    }

    // 5. Mettre à jour la liste globale des projets
    logger.info('Mise à jour de la liste des projets...');
    let projects = loadProjects();
    projects = projects.map(p => {
        if (p.name === oldName) {
            return {
                ...p,
                name: newName,
                path: newPath,
                sftpUser: `sftp_${newName}`
            };
        }
        return p;
    });
    saveProjects(projects);

    // 6. Mettre à jour les bases de données associées
    logger.info('Mise à jour des bases de données associées...');
    databases.updateProjectNameInDatabases(oldName, newName);

    // 7. Mettre à jour la configuration SSH
    logger.info('Mise à jour de la configuration SSH...');
    await sftp.updateSSHConfig(projects);

    // 8. Redémarrer les services qui étaient actifs
    logger.info('Redémarrage des services...');
    for (const service of stoppedServices) {
        const newProcessName = `${newName}-${service.name}`;
        try {
            // Les services seront redémarrés manuellement par l'utilisateur si nécessaire
            logger.debug(`Service ${service.name} prêt à être redémarré sous ${newProcessName}`);
        } catch (error) {
            logger.warn(`Impossible de redémarrer ${newProcessName}: ${error.message}`);
        }
    }

    logger.success(`Projet renommé avec succès: ${oldName} → ${newName}`);
    logger.info(`Note: Les services doivent être redémarrés manuellement`);
}

export default {
    initConfigDir,
    loadProjects,
    saveProjects,
    getProject,
    projectExists,
    loadProjectConfig,
    saveProjectConfig,
    createProject,
    deleteProject,
    listProjectsWithStatus,
    renameProject
};
