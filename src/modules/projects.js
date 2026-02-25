/**
 * Module de gestion des projets
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH, PROJECT_STRUCTURE, TOOL_CONFIG_PATH, PROJECTS_CONFIG_FILE } from '../config/constants.js';
import sftp from './sftp.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';

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
    // Cette fonctionnalité est complexe car elle implique:
    // - Renommer l'utilisateur SFTP
    // - Renommer le dossier
    // - Mettre à jour tous les services PM2
    // - Mettre à jour la configuration SSH
    
    // Pour l'instant, on recommande de supprimer et recréer
    throw new Error('Le renommage de projet n\'est pas encore supporté. Veuillez supprimer et recréer le projet.');
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
