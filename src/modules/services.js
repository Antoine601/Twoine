/**
 * Module de gestion des services
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH, PROJECT_STRUCTURE } from '../config/constants.js';
import projects from './projects.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';

/**
 * Ajoute un service à un projet
 * @param {string} projectName - Nom du projet
 * @param {object} serviceConfig - Configuration du service
 * @returns {object} - Service créé
 */
export function addService(projectName, serviceConfig) {
    const { name, directory, command, description, setupCommands, runtime } = serviceConfig;

    // Valider le nom du service
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
        throw new Error('Le nom du service doit commencer par une lettre et ne contenir que des lettres, chiffres, tirets et underscores');
    }

    // Valider le runtime
    const validRuntimes = ['nodejs', 'python', 'php', 'html'];
    const selectedRuntime = runtime || 'nodejs';
    if (!validRuntimes.includes(selectedRuntime)) {
        throw new Error(`Runtime invalide. Choisissez parmi: ${validRuntimes.join(', ')}`);
    }

    // Charger la configuration du projet
    const projectConfig = projects.loadProjectConfig(projectName);

    // Vérifier si le service existe déjà
    if (projectConfig.services.some(s => s.name === name)) {
        throw new Error(`Le service ${name} existe déjà dans ce projet`);
    }

    // Construire le chemin complet du service
    const servicePath = directory.startsWith('/')
        ? directory
        : path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.sites, directory);

    // Vérifier si le dossier du service existe
    if (!fs.existsSync(servicePath)) {
        // Créer le dossier s'il n'existe pas
        fs.mkdirSync(servicePath, { recursive: true });
        logger.info(`Dossier du service créé: ${servicePath}`);
    }

    // Déterminer la commande par défaut selon le runtime
    let defaultCommand = 'npm start';
    if (selectedRuntime === 'python') {
        defaultCommand = 'python3 app.py';
    } else if (selectedRuntime === 'php') {
        defaultCommand = 'php -S 0.0.0.0:8000';
    } else if (selectedRuntime === 'html') {
        defaultCommand = 'python3 -m http.server 8000';
    }

    // Créer le service
    const service = {
        name,
        directory: servicePath,
        runtime: selectedRuntime,
        setupCommands: setupCommands || [],
        command: command || defaultCommand,
        description: description || '',
        pm2Name: `${projectName}-${name}`,
        createdAt: new Date().toISOString()
    };

    // Ajouter le service à la configuration
    projectConfig.services.push(service);
    projects.saveProjectConfig(projectName, projectConfig);

    logger.success(`Service ${name} (${selectedRuntime}) ajouté au projet ${projectName}`);
    return service;
}

/**
 * Supprime un service d'un projet
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<void>}
 */
export async function removeService(projectName, serviceName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    const serviceIndex = projectConfig.services.findIndex(s => s.name === serviceName);

    if (serviceIndex === -1) {
        throw new Error(`Le service ${serviceName} n'existe pas dans ce projet`);
    }

    const service = projectConfig.services[serviceIndex];

    // Arrêter le service s'il est en cours
    try {
        await stopService(projectName, serviceName);
    } catch {
        // Ignorer si le service n'est pas en cours
    }

    // Supprimer de PM2
    try {
        await shell.pm2Command(`delete ${service.pm2Name}`);
    } catch {
        // Ignorer si le processus n'existe pas
    }

    // Retirer de la configuration
    projectConfig.services.splice(serviceIndex, 1);
    projects.saveProjectConfig(projectName, projectConfig);

    logger.success(`Service ${serviceName} supprimé du projet ${projectName}`);
}

/**
 * Met à jour un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @param {object} updates - Mises à jour à appliquer
 * @returns {object}
 */
export function updateService(projectName, serviceName, updates) {
    const projectConfig = projects.loadProjectConfig(projectName);
    const serviceIndex = projectConfig.services.findIndex(s => s.name === serviceName);

    if (serviceIndex === -1) {
        throw new Error(`Le service ${serviceName} n'existe pas dans ce projet`);
    }

    // Appliquer les mises à jour
    const service = projectConfig.services[serviceIndex];
    
    if (updates.directory) {
        service.directory = updates.directory.startsWith('/')
            ? updates.directory
            : path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.sites, updates.directory);
    }
    
    if (updates.command) {
        service.command = updates.command;
    }

    if (updates.setupCommands !== undefined) {
        service.setupCommands = updates.setupCommands;
    }
    
    if (updates.description !== undefined) {
        service.description = updates.description;
    }

    if (updates.runtime !== undefined) {
        const validRuntimes = ['nodejs', 'python', 'php', 'html'];
        if (!validRuntimes.includes(updates.runtime)) {
            throw new Error(`Runtime invalide. Choisissez parmi: ${validRuntimes.join(', ')}`);
        }
        service.runtime = updates.runtime;
    }

    service.updatedAt = new Date().toISOString();

    projects.saveProjectConfig(projectName, projectConfig);
    logger.success(`Service ${serviceName} mis à jour`);

    return service;
}

/**
 * Récupère un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {object|null}
 */
export function getService(projectName, serviceName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    return projectConfig.services.find(s => s.name === serviceName) || null;
}

/**
 * Liste tous les services d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {Array}
 */
export function listServices(projectName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    return projectConfig.services || [];
}

/**
 * Exécute les commandes de setup d'un service
 * @param {object} service - Service
 * @returns {Promise<void>}
 */
async function runSetupCommands(service) {
    const setupCommands = service.setupCommands || [];
    
    if (setupCommands.length === 0) {
        return;
    }

    logger.info(`Exécution des commandes de setup pour ${service.name}...`);

    for (const cmd of setupCommands) {
        logger.info(`  → ${cmd}`);
        try {
            await shell.execCommand(cmd, { cwd: service.directory });
            logger.success(`  ✓ ${cmd}`);
        } catch (error) {
            throw new Error(`Erreur lors de l'exécution de "${cmd}": ${error.message}`);
        }
    }
}

/**
 * Démarre un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @param {boolean} runSetup - Exécuter les commandes de setup (défaut: true)
 * @returns {Promise<void>}
 */
export async function startService(projectName, serviceName, runSetup = true) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    // Vérifier si le dossier existe
    if (!fs.existsSync(service.directory)) {
        throw new Error(`Le dossier du service n'existe pas: ${service.directory}`);
    }

    // Exécuter les commandes de setup si demandé
    if (runSetup) {
        await runSetupCommands(service);
    }

    logger.info(`Démarrage du service ${serviceName}...`);

    // Démarrer avec PM2
    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;
    
    try {
        // Vérifier si le processus existe déjà
        const status = await shell.getPm2ProcessStatus(pm2Name);
        
        if (status) {
            // Redémarrer si existe
            await shell.pm2Command(`restart ${pm2Name}`);
        } else {
            // Créer un nouveau processus
            await shell.pm2Command(`start "${service.command}" --name "${pm2Name}" --cwd "${service.directory}"`);
        }

        // Sauvegarder la configuration PM2
        await shell.pm2Command('save');
        
        logger.success(`Service ${serviceName} démarré (${pm2Name})`);
    } catch (error) {
        throw new Error(`Erreur lors du démarrage: ${error.message}`);
    }
}

/**
 * Arrête un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<void>}
 */
export async function stopService(projectName, serviceName) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;

    logger.info(`Arrêt du service ${serviceName}...`);

    try {
        await shell.pm2Command(`stop ${pm2Name}`);
        await shell.pm2Command('save');
        logger.success(`Service ${serviceName} arrêté`);
    } catch (error) {
        throw new Error(`Erreur lors de l'arrêt: ${error.message}`);
    }
}

/**
 * Redémarre un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<void>}
 */
export async function restartService(projectName, serviceName) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;

    logger.info(`Redémarrage du service ${serviceName}...`);

    try {
        await shell.pm2Command(`restart ${pm2Name}`);
        await shell.pm2Command('save');
        logger.success(`Service ${serviceName} redémarré`);
    } catch (error) {
        throw new Error(`Erreur lors du redémarrage: ${error.message}`);
    }
}

/**
 * Récupère le statut d'un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<object>}
 */
export async function getServiceStatus(projectName, serviceName) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;
    const pm2Status = await shell.getPm2ProcessStatus(pm2Name);

    if (!pm2Status) {
        return {
            name: serviceName,
            pm2Name,
            status: 'stopped',
            pid: null,
            uptime: null,
            restarts: 0,
            memory: null,
            cpu: null
        };
    }

    return {
        name: serviceName,
        pm2Name,
        status: pm2Status.pm2_env?.status || 'unknown',
        pid: pm2Status.pid || null,
        uptime: pm2Status.pm2_env?.pm_uptime || null,
        restarts: pm2Status.pm2_env?.restart_time || 0,
        memory: pm2Status.monit?.memory || null,
        cpu: pm2Status.monit?.cpu || null
    };
}

/**
 * Récupère le statut de tous les services d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {Promise<Array>}
 */
export async function getAllServicesStatus(projectName) {
    const services = listServices(projectName);
    const result = [];

    for (const service of services) {
        const status = await getServiceStatus(projectName, service.name);
        result.push({
            ...service,
            ...status
        });
    }

    return result;
}

/**
 * Récupère les logs d'un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @param {number} lines - Nombre de lignes
 * @returns {Promise<string>}
 */
export async function getServiceLogs(projectName, serviceName, lines = 50) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;
    
    try {
        return await shell.getPm2Logs(pm2Name, lines);
    } catch (error) {
        throw new Error(`Erreur lors de la récupération des logs: ${error.message}`);
    }
}

/**
 * Réinitialise les logs d'un service
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<void>}
 */
export async function resetServiceLogs(projectName, serviceName) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    const pm2Name = service.pm2Name || `${projectName}-${serviceName}`;
    
    try {
        await shell.pm2Command(`flush ${pm2Name}`);
        logger.success(`Logs du service ${serviceName} réinitialisés`);
    } catch (error) {
        throw new Error(`Erreur lors de la réinitialisation des logs: ${error.message}`);
    }
}

/**
 * Exécute uniquement le setup d'un service (sans le démarrer)
 * @param {string} projectName - Nom du projet
 * @param {string} serviceName - Nom du service
 * @returns {Promise<void>}
 */
export async function runSetupOnly(projectName, serviceName) {
    const service = getService(projectName, serviceName);
    
    if (!service) {
        throw new Error(`Le service ${serviceName} n'existe pas`);
    }

    // Vérifier si le dossier existe
    if (!fs.existsSync(service.directory)) {
        throw new Error(`Le dossier du service n'existe pas: ${service.directory}`);
    }

    logger.info(`Exécution du setup pour ${serviceName}...`);
    await runSetupCommands(service);
    logger.success(`Setup du service ${serviceName} terminé`);
}

/**
 * Démarre tous les services d'un projet
 * @param {string} projectName - Nom du projet
 * @param {boolean} runSetup - Exécuter les commandes de setup (défaut: true)
 * @returns {Promise<void>}
 */
export async function startAllServices(projectName, runSetup = true) {
    const services = listServices(projectName);
    
    if (services.length === 0) {
        throw new Error('Aucun service configuré pour ce projet');
    }

    logger.info(`Démarrage de tous les services de ${projectName}...`);

    for (const service of services) {
        try {
            await startService(projectName, service.name, runSetup);
        } catch (error) {
            logger.error(`Erreur pour ${service.name}: ${error.message}`);
        }
    }

    logger.success('Tous les services ont été traités');
}

/**
 * Arrête tous les services d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {Promise<void>}
 */
export async function stopAllServices(projectName) {
    const services = listServices(projectName);
    
    if (services.length === 0) {
        return;
    }

    logger.info(`Arrêt de tous les services de ${projectName}...`);

    for (const service of services) {
        try {
            await stopService(projectName, service.name);
        } catch (error) {
            logger.error(`Erreur pour ${service.name}: ${error.message}`);
        }
    }

    logger.success('Tous les services ont été arrêtés');
}

export default {
    addService,
    removeService,
    updateService,
    getService,
    listServices,
    startService,
    stopService,
    restartService,
    getServiceStatus,
    getAllServicesStatus,
    getServiceLogs,
    resetServiceLogs,
    runSetupOnly,
    startAllServices,
    stopAllServices
};
