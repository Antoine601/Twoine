/**
 * API REST pour la gestion des projets
 */

import { Router } from 'express';
import projects from '../modules/projects.js';
import services from '../modules/services.js';
import scriptsModule from '../modules/scripts.js';
import sftp from '../modules/sftp.js';
import shell from '../utils/shell.js';
import logger from '../utils/logger.js';
import users from '../modules/users.js';
import fileManager from '../modules/fileManager.js';
import databases from '../modules/databases.js';
import aiModels from '../modules/aiModels.js';
import apiKeys from '../modules/apiKeys.js';
import multer from 'multer';
import path from 'path';
import https from 'https';
import http from 'http';
import fs from 'fs';
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import pg from 'pg';

const { Pool } = pg;

const router = Router();
const upload = multer({ dest: '/tmp/uploads/' });

// ============================================
// PROJETS
// ============================================

/**
 * GET /api/projects - Liste tous les projets avec statut
 */
router.get('/projects', async (req, res) => {
    try {
        const projectsWithStatus = await projects.listProjectsWithStatus();
        res.json({ success: true, data: projectsWithStatus });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:name - Détails d'un projet
 */
router.get('/projects/:name', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }
        const config = projects.loadProjectConfig(req.params.name);
        const servicesStatus = await services.getAllServicesStatus(req.params.name);
        const scriptPaths = scriptsModule.getScriptsPaths(req.params.name);

        res.json({
            success: true,
            data: {
                ...project,
                config,
                services: servicesStatus,
                scripts: scriptPaths
            }
        });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects - Créer un projet
 */
router.post('/projects', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            return res.status(400).json({ success: false, error: 'Nom et mot de passe requis' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Le mot de passe doit contenir au moins 8 caractères' });
        }

        const result = await projects.createProject(name, password);
        scriptsModule.generateScripts(name);

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/projects/:name - Supprimer un projet
 */
router.delete('/projects/:name', async (req, res) => {
    try {
        const deleteFiles = req.query.deleteFiles === 'true';
        await projects.deleteProject(req.params.name, deleteFiles);
        res.json({ success: true, message: `Projet ${req.params.name} supprimé` });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/projects/:name/rename - Renommer un projet
 */
router.put('/projects/:name/rename', async (req, res) => {
    try {
        const { newName } = req.body;
        if (!newName) {
            return res.status(400).json({ success: false, error: 'Le nouveau nom est requis' });
        }

        await projects.renameProject(req.params.name, newName);
        res.json({ 
            success: true, 
            message: `Projet renommé: ${req.params.name} → ${newName}`,
            data: { oldName: req.params.name, newName }
        });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// SERVICES
// ============================================

/**
 * GET /api/projects/:name/services - Liste les services d'un projet
 */
router.get('/projects/:name/services', async (req, res) => {
    try {
        const servicesStatus = await services.getAllServicesStatus(req.params.name);
        res.json({ success: true, data: servicesStatus });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services - Ajouter un service
 */
router.post('/projects/:name/services', (req, res) => {
    try {
        const { name, directory, command, description, setupCommands, runtime } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Nom du service requis' });
        }

        const service = services.addService(req.params.name, {
            name,
            directory: directory || name,
            command,
            description: description || '',
            setupCommands: setupCommands || [],
            runtime: runtime || 'nodejs'
        });

        scriptsModule.generateScripts(req.params.name);
        res.json({ success: true, data: service });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/projects/:name/services/:serviceName - Modifier un service
 */
router.put('/projects/:name/services/:serviceName', (req, res) => {
    try {
        const { directory, command, description, setupCommands, runtime } = req.body;
        const updated = services.updateService(req.params.name, req.params.serviceName, {
            directory,
            command,
            description,
            setupCommands,
            runtime
        });

        scriptsModule.generateScripts(req.params.name);
        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/projects/:name/services/:serviceName - Supprimer un service
 */
router.delete('/projects/:name/services/:serviceName', async (req, res) => {
    try {
        await services.removeService(req.params.name, req.params.serviceName);
        scriptsModule.generateScripts(req.params.name);
        res.json({ success: true, message: 'Service supprimé' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// ACTIONS SUR LES SERVICES
// ============================================

/**
 * POST /api/projects/:name/services/:serviceName/start
 */
router.post('/projects/:name/services/:serviceName/start', async (req, res) => {
    try {
        const runSetup = req.body.runSetup !== false;
        await services.startService(req.params.name, req.params.serviceName, runSetup);
        res.json({ success: true, message: 'Service démarré' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/:serviceName/stop
 */
router.post('/projects/:name/services/:serviceName/stop', async (req, res) => {
    try {
        await services.stopService(req.params.name, req.params.serviceName);
        res.json({ success: true, message: 'Service arrêté' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/:serviceName/restart
 */
router.post('/projects/:name/services/:serviceName/restart', async (req, res) => {
    try {
        await services.restartService(req.params.name, req.params.serviceName);
        res.json({ success: true, message: 'Service redémarré' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:name/services/:serviceName/logs
 */
router.get('/projects/:name/services/:serviceName/logs', async (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 100;
        const logs = await services.getServiceLogs(req.params.name, req.params.serviceName, lines);
        res.json({ success: true, data: logs });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/:serviceName/reset-logs - Reset les logs
 */
router.post('/projects/:name/services/:serviceName/reset-logs', async (req, res) => {
    try {
        await services.resetServiceLogs(req.params.name, req.params.serviceName);
        res.json({ success: true, message: 'Logs réinitialisés' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/:serviceName/setup - Lancer uniquement le setup
 */
router.post('/projects/:name/services/:serviceName/setup', async (req, res) => {
    try {
        await services.runSetupOnly(req.params.name, req.params.serviceName);
        res.json({ success: true, message: 'Setup exécuté' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/:serviceName/start-only - Lancer uniquement le service (sans setup)
 */
router.post('/projects/:name/services/:serviceName/start-only', async (req, res) => {
    try {
        await services.startService(req.params.name, req.params.serviceName, false);
        res.json({ success: true, message: 'Service démarré (sans setup)' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/start-all
 */
router.post('/projects/:name/services-start-all', async (req, res) => {
    try {
        const runSetup = req.body.runSetup !== false;
        await services.startAllServices(req.params.name, runSetup);
        res.json({ success: true, message: 'Tous les services démarrés' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/services/stop-all
 */
router.post('/projects/:name/services-stop-all', async (req, res) => {
    try {
        await services.stopAllServices(req.params.name);
        res.json({ success: true, message: 'Tous les services arrêtés' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// SFTP
// ============================================

/**
 * POST /api/projects/:name/sftp/change-password
 */
router.post('/projects/:name/sftp/change-password', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });
        }
        await sftp.changeSftpPassword(req.params.name, password);
        res.json({ success: true, message: 'Mot de passe changé' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// SCRIPTS
// ============================================

/**
 * POST /api/projects/:name/regenerate-scripts
 */
router.post('/projects/:name/regenerate-scripts', (req, res) => {
    try {
        scriptsModule.generateScripts(req.params.name);
        res.json({ success: true, message: 'Scripts régénérés' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/regenerate-all-scripts
 */
router.post('/regenerate-all-scripts', (req, res) => {
    try {
        scriptsModule.regenerateAllScripts();
        res.json({ success: true, message: 'Tous les scripts régénérés' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// PM2 GLOBAL
// ============================================

/**
 * GET /api/pm2/status
 */
router.get('/pm2/status', async (req, res) => {
    try {
        const { stdout } = await shell.execCommand('pm2 jlist');
        const processes = JSON.parse(stdout);
        res.json({ success: true, data: processes });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ============================================
// AUTHENTIFICATION
// ============================================

/**
 * POST /api/auth/login - Authentification
 */
router.post('/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Identifiants requis' });
        }

        const result = users.authenticate(username, password);
        if (!result.success) {
            return res.status(401).json(result);
        }

        res.json(result);
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/auth/verify-password - Vérifier le mot de passe de l'utilisateur connecté
 */
router.post('/auth/verify-password', (req, res) => {
    try {
        const { password } = req.body;
        const currentUser = req.session?.user;

        if (!currentUser) {
            return res.status(401).json({ success: false, error: 'Non authentifié' });
        }

        if (!password) {
            return res.status(400).json({ success: false, error: 'Mot de passe requis' });
        }

        const result = users.authenticate(currentUser.username, password);
        if (!result.success) {
            return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
        }

        res.json({ success: true });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GESTION DES UTILISATEURS
// ============================================

/**
 * GET /api/users - Liste tous les utilisateurs
 */
router.get('/users', (req, res) => {
    try {
        const usersList = users.listUsers();
        res.json({ success: true, data: usersList });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/users/:userId - Détails d'un utilisateur
 */
router.get('/users/:userId', (req, res) => {
    try {
        const user = users.getUserById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/users - Créer un utilisateur
 */
router.post('/users', (req, res) => {
    try {
        const { username, password, role, mustChangePassword, firstName, lastName } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Nom d\'utilisateur et mot de passe requis' });
        }

        const user = users.createUser(username, password, role || 'user', !!mustChangePassword, firstName || '', lastName || '');
        res.json({ success: true, data: user });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/users/:userId - Supprimer un utilisateur
 */
router.delete('/users/:userId', (req, res) => {
    try {
        users.deleteUser(req.params.userId);
        res.json({ success: true, message: 'Utilisateur supprimé' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/users/:userId - Mettre à jour un utilisateur
 */
router.put('/users/:userId', (req, res) => {
    try {
        const { firstName, lastName, username, mustChangePassword } = req.body;
        const updated = users.updateUser(req.params.userId, { firstName, lastName, username, mustChangePassword });
        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/users/:userId/password - Changer le mot de passe
 */
router.put('/users/:userId/password', (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, error: 'Mot de passe requis' });
        }

        users.changePassword(req.params.userId, password);
        res.json({ success: true, message: 'Mot de passe changé' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/users/:userId/role - Changer le rôle
 */
router.put('/users/:userId/role', (req, res) => {
    try {
        const { role } = req.body;
        if (!role) {
            return res.status(400).json({ success: false, error: 'Rôle requis' });
        }

        users.changeUserRole(req.params.userId, role);
        res.json({ success: true, message: 'Rôle modifié' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/users/:userId/projects/:projectName - Associer un projet
 */
router.post('/users/:userId/projects/:projectName', (req, res) => {
    try {
        users.assignProjectToUser(req.params.userId, req.params.projectName);
        res.json({ success: true, message: 'Projet associé' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/users/:userId/projects/:projectName - Retirer un projet
 */
router.delete('/users/:userId/projects/:projectName', (req, res) => {
    try {
        users.removeProjectFromUser(req.params.userId, req.params.projectName);
        res.json({ success: true, message: 'Projet retiré' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/users/:userId/projects - Projets d'un utilisateur
 */
router.get('/users/:userId/projects', (req, res) => {
    try {
        const projectsList = users.getUserProjects(req.params.userId);
        res.json({ success: true, data: projectsList });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// GESTION DES FICHIERS SFTP
// ============================================

/**
 * GET /api/projects/:name/files - Liste les fichiers d'un projet
 */
router.get('/projects/:name/files', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const relativePath = req.query.path || '';
        const projectPath = `/var/www/${req.params.name}/sites`;
        const files = await fileManager.listFiles(projectPath, relativePath);
        
        res.json({ success: true, data: files, currentPath: relativePath });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/files/mkdir - Créer un dossier
 */
router.post('/projects/:name/files/mkdir', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { path: relativePath, name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Nom du dossier requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const result = await fileManager.createDirectory(projectPath, relativePath || '', name);
        
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/projects/:name/files - Supprimer un fichier ou dossier
 */
router.delete('/projects/:name/files', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { path: relativePath } = req.query;
        if (!relativePath) {
            return res.status(400).json({ success: false, error: 'Chemin requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const fullTargetPath = `${projectPath}/${relativePath}`.replace(/\/+/g, '/');

        // Sécurité : vérifier que le chemin reste dans le dossier du projet
        if (!fullTargetPath.startsWith(projectPath + '/') || fullTargetPath === projectPath) {
            return res.status(400).json({ success: false, error: 'Chemin invalide' });
        }

        // Arrêter les services PM2 dont le répertoire est dans le chemin à supprimer
        try {
            const projectConfig = projects.loadProjectConfig(req.params.name);
            for (const service of projectConfig.services || []) {
                if (service.directory && service.directory.startsWith(fullTargetPath)) {
                    const pm2Name = service.pm2Name || `${req.params.name}-${service.name}`;
                    try {
                        await shell.pm2Command(`stop ${pm2Name}`);
                        await shell.pm2Command(`delete ${pm2Name}`);
                        logger.info(`Service PM2 arrêté avant suppression: ${pm2Name}`);
                    } catch {
                        // Ignorer si le processus n'existe pas
                    }
                }
            }
        } catch (error) {
            logger.warn(`Impossible de vérifier les services PM2: ${error.message}`);
        }

        await shell.execCommand(`rm -rf "${fullTargetPath}"`);
        
        res.json({ success: true, data: { success: true } });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/files/copy - Copier un fichier ou dossier
 */
router.post('/projects/:name/files/copy', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { sourcePath, destPath } = req.body;
        if (!sourcePath || !destPath) {
            return res.status(400).json({ success: false, error: 'Chemin source et destination requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const result = await fileManager.copyItem(projectPath, sourcePath, destPath);

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/projects/:name/files/rename - Renommer un fichier ou dossier
 */
router.put('/projects/:name/files/rename', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { path: oldPath, newName } = req.body;
        if (!oldPath || !newName) {
            return res.status(400).json({ success: false, error: 'Chemin et nouveau nom requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const result = await fileManager.renameItem(projectPath, oldPath, newName);
        
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:name/files/download - Télécharger un fichier
 */
router.get('/projects/:name/files/download', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { path: relativePath } = req.query;
        if (!relativePath) {
            return res.status(400).json({ success: false, error: 'Chemin requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const fileStream = fileManager.readFile(projectPath, relativePath);
        const fileName = path.basename(relativePath);
        
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        fileStream.pipe(res);
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/projects/:name/files/upload - Upload un ou plusieurs fichiers
 */
router.post('/projects/:name/files/upload', upload.array('files', 100), async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucun fichier fourni' });
        }

        const relativePath = req.body.path || '';
        const projectPath = `/var/www/${req.params.name}/sites`;
        const fs = await import('fs');
        
        const uploadedFiles = [];
        const errors = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            try {
                // Récupérer le chemin relatif du fichier (pour les dossiers)
                const fileRelativePath = req.body[`relativePath_${i}`] || file.originalname;
                const targetPath = path.join(relativePath, fileRelativePath);
                
                const fileStream = fs.createReadStream(file.path);
                await fileManager.writeFile(projectPath, targetPath, fileStream);
                
                // Supprimer le fichier temporaire
                fs.unlinkSync(file.path);
                
                uploadedFiles.push(targetPath);
            } catch (error) {
                errors.push({ file: file.originalname, error: error.message });
                // Supprimer le fichier temporaire en cas d'erreur
                try { fs.unlinkSync(file.path); } catch {}
            }
        }
        
        if (errors.length > 0 && uploadedFiles.length === 0) {
            return res.status(400).json({ success: false, error: 'Échec de tous les uploads', details: errors });
        }
        
        res.json({ 
            success: true, 
            message: `${uploadedFiles.length} fichier(s) uploadé(s)`,
            uploaded: uploadedFiles,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/projects/:name/files/info - Informations sur un fichier
 */
router.get('/projects/:name/files/info', async (req, res) => {
    try {
        const project = projects.getProject(req.params.name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Projet non trouvé' });
        }

        const { path: relativePath } = req.query;
        if (!relativePath) {
            return res.status(400).json({ success: false, error: 'Chemin requis' });
        }

        const projectPath = `/var/www/${req.params.name}/sites`;
        const info = await fileManager.getFileInfo(projectPath, relativePath);
        
        res.json({ success: true, data: info });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// BASES DE DONNÉES
// ============================================

/**
 * GET /api/databases - Liste toutes les bases de données
 */
router.get('/databases', async (req, res) => {
    try {
        const { projectName } = req.query;
        const allDatabases = databases.getAllDatabases(projectName || null);
        res.json({ success: true, data: allDatabases });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id - Détails d'une base de données
 */
router.get('/databases/:id', async (req, res) => {
    try {
        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }
        res.json({ success: true, data: database });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/mysql - Créer une base de données MySQL
 */
router.post('/databases/mysql', async (req, res) => {
    try {
        const { name, host, port, username, password, projectName } = req.body;
        if (!name || !host || !username || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }

        const database = await databases.createMySQLDatabase({
            name, host, port, username, password, projectName
        });

        res.json({ success: true, data: database });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/mongodb - Créer une base de données MongoDB
 */
router.post('/databases/mongodb', async (req, res) => {
    try {
        const { name, host, port, username, password, authDatabase, projectName } = req.body;
        if (!name || !host) {
            return res.status(400).json({ success: false, error: 'Le nom et l\'hôte sont requis' });
        }

        const database = await databases.createMongoDatabase({
            name, host, port, username, password, authDatabase, projectName
        });

        res.json({ success: true, data: database });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/postgresql - Créer une base de données PostgreSQL
 */
router.post('/databases/postgresql', async (req, res) => {
    try {
        const { name, host, port, username, password, projectName, autoCreate } = req.body;
        if (!name || !host || !username || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }

        // Si autoCreate est activé et que c'est localhost, créer l'utilisateur et la base
        if (autoCreate && (host === 'localhost' || host === '127.0.0.1')) {
            try {
                await databases.autoCreatePostgreSQLDatabase(name, username, password);
                logger.info(`Utilisateur et base PostgreSQL créés automatiquement: ${name}`);
            } catch (error) {
                logger.warn(`Impossible de créer automatiquement la base: ${error.message}`);
                // Continue quand même pour enregistrer la configuration
            }
        }

        const database = await databases.createPostgreSQLDatabase({
            name, host, port, username, password, projectName
        });

        res.json({ success: true, data: database });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/databases/:id - Mettre à jour une base de données
 */
router.put('/databases/:id', async (req, res) => {
    try {
        const updates = req.body;
        const updated = databases.updateDatabase(req.params.id, updates);
        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/databases/:id - Supprimer une base de données
 */
router.delete('/databases/:id', async (req, res) => {
    try {
        await databases.deleteDatabase(req.params.id);
        res.json({ success: true, message: 'Base de données supprimée' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/:id/assign - Assigner une BDD à un projet
 */
router.post('/databases/:id/assign', async (req, res) => {
    try {
        const { projectName } = req.body;
        if (!projectName) {
            return res.status(400).json({ success: false, error: 'Nom du projet requis' });
        }

        const updated = databases.assignDatabaseToProject(req.params.id, projectName);
        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/:id/unassign - Retirer l'assignation d'une BDD
 */
router.post('/databases/:id/unassign', async (req, res) => {
    try {
        const updated = databases.unassignDatabaseFromProject(req.params.id);
        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id/connection-string - Obtenir la chaîne de connexion
 */
router.get('/databases/:id/connection-string', async (req, res) => {
    try {
        const connectionString = databases.getConnectionString(req.params.id);
        res.json({ success: true, data: { connectionString } });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/test-mysql - Tester une connexion MySQL
 */
router.post('/databases/test-mysql', async (req, res) => {
    try {
        const result = await databases.testMySQLConnection(req.body);
        res.json({ success: result, message: result ? 'Connexion réussie' : 'Connexion échouée' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/test-mongodb - Tester une connexion MongoDB
 */
router.post('/databases/test-mongodb', async (req, res) => {
    try {
        const result = await databases.testMongoConnection(req.body);
        res.json({ success: result, message: result ? 'Connexion réussie' : 'Connexion échouée' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/test-postgresql - Tester une connexion PostgreSQL
 */
router.post('/databases/test-postgresql', async (req, res) => {
    try {
        const result = await databases.testPostgreSQLConnection(req.body);
        res.json({ success: result, message: result ? 'Connexion réussie' : 'Connexion échouée' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// ÉDITEUR DE BASE DE DONNÉES
// ============================================

/**
 * POST /api/databases/:id/query - Exécuter une requête SQL (MySQL ou PostgreSQL)
 */
router.post('/databases/:id/query', async (req, res) => {
    try {
        const { query, params } = req.body;
        if (!query) {
            return res.status(400).json({ success: false, error: 'Requête SQL requise' });
        }

        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }

        let result;
        if (database.type === 'mysql') {
            result = await databases.executeMySQLQuery(req.params.id, query);
        } else if (database.type === 'postgresql') {
            result = await databases.executePostgreSQLQuery(req.params.id, query, params || []);
        } else {
            return res.status(400).json({ success: false, error: 'Type de base de données non supporté pour cette opération' });
        }

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id/tables - Liste les tables (MySQL ou PostgreSQL)
 */
router.get('/databases/:id/tables', async (req, res) => {
    try {
        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }

        let tables;
        if (database.type === 'mysql') {
            tables = await databases.getMySQLTables(req.params.id);
        } else if (database.type === 'postgresql') {
            tables = await databases.getPostgreSQLTables(req.params.id);
        } else {
            return res.status(400).json({ success: false, error: 'Type de base de données non supporté pour cette opération' });
        }

        res.json({ success: true, data: tables });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id/tables/:tableName/structure - Structure d'une table (MySQL ou PostgreSQL)
 */
router.get('/databases/:id/tables/:tableName/structure', async (req, res) => {
    try {
        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }

        let structure;
        if (database.type === 'mysql') {
            structure = await databases.getMySQLTableStructure(req.params.id, req.params.tableName);
        } else if (database.type === 'postgresql') {
            structure = await databases.getPostgreSQLTableStructure(req.params.id, req.params.tableName);
        } else {
            return res.status(400).json({ success: false, error: 'Type de base de données non supporté pour cette opération' });
        }

        res.json({ success: true, data: structure });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id/tables/:tableName/data - Données d'une table (MySQL ou PostgreSQL)
 */
router.get('/databases/:id/tables/:tableName/data', async (req, res) => {
    try {
        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        let data;
        if (database.type === 'mysql') {
            data = await databases.getMySQLTableData(req.params.id, req.params.tableName, limit, offset);
        } else if (database.type === 'postgresql') {
            data = await databases.getPostgreSQLTableData(req.params.id, req.params.tableName, limit, offset);
        } else {
            return res.status(400).json({ success: false, error: 'Type de base de données non supporté pour cette opération' });
        }

        res.json({ success: true, data });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/databases/:id/collections - Liste les collections MongoDB
 */
router.get('/databases/:id/collections', async (req, res) => {
    try {
        const collections = await databases.getMongoCollections(req.params.id);
        res.json({ success: true, data: collections });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/:id/collections/:collectionName/query - Requête MongoDB
 */
router.post('/databases/:id/collections/:collectionName/query', async (req, res) => {
    try {
        const { operation, query, options } = req.body;
        if (!operation) {
            return res.status(400).json({ success: false, error: 'Opération requise' });
        }

        const result = await databases.executeMongoOperation(
            req.params.id,
            req.params.collectionName,
            operation,
            query || {},
            options || {}
        );
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/databases/:id/import-bson - Importer un fichier BSON dans MongoDB
 */
router.post('/databases/:id/import-bson', upload.single('bsonFile'), async (req, res) => {
    try {
        const database = databases.getDatabaseById(req.params.id);
        if (!database) {
            return res.status(404).json({ success: false, error: 'Base de données non trouvée' });
        }

        if (database.type !== 'mongodb') {
            return res.status(400).json({ success: false, error: 'Cette fonctionnalité est uniquement disponible pour MongoDB' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Aucun fichier BSON fourni' });
        }

        const { collection } = req.body;
        if (!collection) {
            return res.status(400).json({ success: false, error: 'Nom de la collection requis' });
        }

        const fs = await import('fs');
        const bsonBuffer = fs.readFileSync(req.file.path);
        
        const result = await databases.importBSONToMongo(req.params.id, collection, bsonBuffer);
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);
        
        res.json({ 
            success: true, 
            message: `${result.insertedCount} document(s) importé(s) avec succès`,
            data: result 
        });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        // Nettoyer le fichier temporaire en cas d'erreur
        if (req.file) {
            try {
                const fs = await import('fs');
                fs.unlinkSync(req.file.path);
            } catch {}
        }
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// MODÈLES IA (ADMIN UNIQUEMENT)
// ============================================

/**
 * GET /api/admin/ai-models - Liste les modèles IA installés
 */
router.get('/admin/ai-models', async (req, res) => {
    try {
        const models = await aiModels.listInstalledModels();
        res.json({ success: true, data: models });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/ai-models/available - Liste les modèles disponibles
 */
router.get('/admin/ai-models/available', async (req, res) => {
    try {
        const models = await aiModels.getAvailableModels();
        res.json({ success: true, data: models });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/ai-models/status - Vérifie le statut d'Ollama
 */
router.get('/admin/ai-models/status', async (req, res) => {
    try {
        const isRunning = await aiModels.checkOllamaStatus();
        res.json({ success: true, data: { running: isRunning } });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/ai-models/:modelName - Détails d'un modèle
 */
router.get('/admin/ai-models/:modelName', async (req, res) => {
    try {
        const details = await aiModels.getModelDetails(req.params.modelName);
        res.json({ success: true, data: details });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/ai-models/install - Installer un modèle
 */
router.post('/admin/ai-models/install', async (req, res) => {
    try {
        const { modelName } = req.body;
        if (!modelName) {
            return res.status(400).json({ success: false, error: 'Nom du modèle requis' });
        }

        const result = await aiModels.installModel(modelName);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/ai-models/chat - Chat avec un modèle (admin uniquement)
 */
router.post('/admin/ai-models/chat', async (req, res) => {
    try {
        const { model, messages, stream } = req.body;
        
        if (!model || !messages) {
            return res.status(400).json({ success: false, error: 'Modèle et messages requis' });
        }

        const ollamaRequest = { model, messages, stream: stream || false };

        const ollamaOptions = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const proxyReq = http.request(ollamaOptions, (proxyRes) => {
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (error) => {
            logger.error(`Erreur proxy Ollama: ${error.message}`);
            res.status(500).json({ success: false, error: 'Erreur de communication avec Ollama' });
        });

        proxyReq.write(JSON.stringify(ollamaRequest));
        proxyReq.end();

    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/admin/ai-models/:modelName - Supprimer un modèle
 */
router.delete('/admin/ai-models/:modelName', async (req, res) => {
    try {
        const result = await aiModels.deleteModel(req.params.modelName);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// CLÉS API
// ============================================

/**
 * GET /api/api-keys - Liste les clés API
 * Admin: toutes les clés
 * User: seulement les clés de leurs projets
 */
router.get('/api-keys', async (req, res) => {
    try {
        const { projectName } = req.query;
        const keys = apiKeys.getAllApiKeys(projectName || null);
        
        // Masquer la valeur complète de la clé (sauf les 8 derniers caractères)
        const sanitizedKeys = keys.map(key => ({
            ...key,
            key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 8)}`
        }));
        
        res.json({ success: true, data: sanitizedKeys });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/api-keys/:id - Détails d'une clé API
 */
router.get('/api-keys/:id', async (req, res) => {
    try {
        const key = apiKeys.getApiKeyById(req.params.id);
        if (!key) {
            return res.status(404).json({ success: false, error: 'Clé API non trouvée' });
        }

        // Masquer la valeur complète de la clé
        const sanitizedKey = {
            ...key,
            key: `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 8)}`
        };

        res.json({ success: true, data: sanitizedKey });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/api-keys - Créer une clé API
 */
router.post('/api-keys', async (req, res) => {
    try {
        const { name, modelName, projects, requestsPerMinute, createdBy } = req.body;
        
        if (!name || !modelName) {
            return res.status(400).json({ success: false, error: 'Nom et modèle requis' });
        }

        const key = apiKeys.createApiKey({
            name,
            modelName,
            projects: projects || [],
            requestsPerMinute: requestsPerMinute || 10,
            createdBy: createdBy || 'admin'
        });

        res.json({ success: true, data: key });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/api-keys/:id - Mettre à jour une clé API
 */
router.put('/api-keys/:id', async (req, res) => {
    try {
        const updates = req.body;
        const updated = apiKeys.updateApiKey(req.params.id, updates);

        // Masquer la valeur complète de la clé
        const sanitizedKey = {
            ...updated,
            key: `${updated.key.substring(0, 8)}...${updated.key.substring(updated.key.length - 8)}`
        };

        res.json({ success: true, data: sanitizedKey });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/api-keys/:id - Supprimer une clé API
 */
router.delete('/api-keys/:id', async (req, res) => {
    try {
        apiKeys.deleteApiKey(req.params.id);
        res.json({ success: true, message: 'Clé API supprimée' });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/api-keys/:id/regenerate - Régénérer une clé API
 */
router.post('/api-keys/:id/regenerate', async (req, res) => {
    try {
        const key = apiKeys.regenerateApiKey(req.params.id);
        res.json({ success: true, data: key });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/api-keys/:id/usage - Historique d'utilisation
 */
router.get('/api-keys/:id/usage', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const usage = apiKeys.getUsageHistory(req.params.id, limit);
        res.json({ success: true, data: usage });
    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// PROXY IA (AUTHENTIFICATION PAR CLÉ API)
// ============================================

/**
 * POST /api/ai/chat - Proxy vers Ollama avec authentification
 */
router.post('/ai/chat', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        
        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Clé API requise' });
        }

        const keyData = apiKeys.getApiKeyByValue(apiKey);
        
        if (!keyData) {
            return res.status(401).json({ success: false, error: 'Clé API invalide' });
        }

        if (keyData.status !== 'active') {
            return res.status(403).json({ success: false, error: 'Clé API désactivée' });
        }

        // Vérifier le rate limit
        if (!apiKeys.checkRateLimit(apiKey)) {
            return res.status(429).json({ 
                success: false, 
                error: `Limite de ${keyData.limits.requestsPerMinute} requêtes par minute atteinte` 
            });
        }

        const { messages, stream } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, error: 'Messages requis' });
        }

        // Préparer la requête pour Ollama
        const ollamaRequest = {
            model: keyData.modelName,
            messages: messages,
            stream: stream || false
        };

        // Proxy vers Ollama
        const ollamaOptions = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const proxyReq = http.request(ollamaOptions, (proxyRes) => {
            let responseData = '';
            
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
            
            proxyRes.on('data', (chunk) => {
                responseData += chunk.toString();
                res.write(chunk);
            });

            proxyRes.on('end', () => {
                res.end();
                
                // Enregistrer l'utilisation avec requête et réponse complètes
                try {
                    const parsedResponse = JSON.parse(responseData);
                    apiKeys.recordUsage(apiKey, {
                        endpoint: '/api/ai/chat',
                        model: keyData.modelName,
                        request: {
                            messages: messages,
                            stream: stream || false
                        },
                        response: parsedResponse,
                        messagesCount: messages.length
                    });
                } catch (e) {
                    // Si parsing échoue, enregistrer quand même
                    apiKeys.recordUsage(apiKey, {
                        endpoint: '/api/ai/chat',
                        model: keyData.modelName,
                        request: {
                            messages: messages,
                            stream: stream || false
                        },
                        messagesCount: messages.length
                    });
                }
            });
        });

        proxyReq.on('error', (error) => {
            logger.error(`Erreur proxy Ollama: ${error.message}`);
            res.status(500).json({ success: false, error: 'Erreur de communication avec Ollama' });
        });

        proxyReq.write(JSON.stringify(ollamaRequest));
        proxyReq.end();

    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/ai/generate - Génération de texte simple
 */
router.post('/ai/generate', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        
        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Clé API requise' });
        }

        const keyData = apiKeys.getApiKeyByValue(apiKey);
        
        if (!keyData) {
            return res.status(401).json({ success: false, error: 'Clé API invalide' });
        }

        if (keyData.status !== 'active') {
            return res.status(403).json({ success: false, error: 'Clé API désactivée' });
        }

        // Vérifier le rate limit
        if (!apiKeys.checkRateLimit(apiKey)) {
            return res.status(429).json({ 
                success: false, 
                error: `Limite de ${keyData.limits.requestsPerMinute} requêtes par minute atteinte` 
            });
        }

        const { prompt, stream } = req.body;

        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt requis' });
        }

        // Préparer la requête pour Ollama
        const ollamaRequest = {
            model: keyData.modelName,
            prompt: prompt,
            stream: stream || false
        };

        // Proxy vers Ollama et enregistrer l'utilisation
        const ollamaOptions2 = {
            hostname: 'localhost',
            port: 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const proxyReq2 = http.request(ollamaOptions2, (proxyRes) => {
            let responseData = '';
            
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
            
            proxyRes.on('data', (chunk) => {
                responseData += chunk.toString();
                res.write(chunk);
            });

            proxyRes.on('end', () => {
                res.end();
                
                // Enregistrer l'utilisation avec requête et réponse complètes
                try {
                    const parsedResponse = JSON.parse(responseData);
                    apiKeys.recordUsage(apiKey, {
                        endpoint: '/api/ai/generate',
                        model: keyData.modelName,
                        request: {
                            prompt: prompt,
                            stream: stream || false
                        },
                        response: parsedResponse
                    });
                } catch (e) {
                    apiKeys.recordUsage(apiKey, {
                        endpoint: '/api/ai/generate',
                        model: keyData.modelName,
                        request: {
                            prompt: prompt,
                            stream: stream || false
                        }
                    });
                }
            });
        });

        proxyReq2.on('error', (error) => {
            logger.error(`Erreur proxy Ollama: ${error.message}`);
            res.status(500).json({ success: false, error: 'Erreur de communication avec Ollama' });
        });

        proxyReq2.write(JSON.stringify(ollamaRequest));
        proxyReq2.end();

    } catch (error) {
        logger.error(`API: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// IMPORT/EXPORT
// ============================================

/**
 * POST /api/export - Exporter les données sélectionnées avec fichiers et données de BDD
 */
router.post('/export', async (req, res) => {
    try {
        const { projects: exportProjects, databases: exportDatabases, apiKeys: exportApiKeys, users: exportUsers } = req.body;
        const exportData = {};

        // Exporter les projets avec leurs fichiers
        if (exportProjects) {
            const projectsList = await projects.listProjectsWithStatus();
            exportData.projects = [];
            
            for (const project of projectsList) {
                const config = projects.loadProjectConfig(project.name);
                const projectData = {
                    name: project.name,
                    sftpUser: project.sftpUser,
                    createdAt: project.createdAt,
                    config: config,
                    files: null
                };

                // Lire les fichiers du projet (sites/)
                try {
                    const projectPath = `/var/www/${project.name}/sites`;
                    if (fs.existsSync(projectPath)) {
                        const { execSync } = await import('child_process');
                        // Créer une archive tar.gz en base64
                        const archivePath = `/tmp/twoine-export-${project.name}-${Date.now()}.tar.gz`;
                        execSync(`tar -czf ${archivePath} -C ${projectPath} .`);
                        const archiveBuffer = fs.readFileSync(archivePath);
                        projectData.files = archiveBuffer.toString('base64');
                        fs.unlinkSync(archivePath); // Nettoyer
                    }
                } catch (error) {
                    logger.error(`Erreur export fichiers projet ${project.name}: ${error.message}`);
                }

                exportData.projects.push(projectData);
            }
        }

        // Exporter les bases de données avec leurs données
        if (exportDatabases) {
            const allDatabases = databases.getAllDatabases();
            exportData.databases = [];

            for (const db of allDatabases) {
                const dbData = {
                    id: db.id,
                    name: db.name,
                    type: db.type,
                    config: db.config,
                    assignedProjects: db.assignedProjects,
                    data: null
                };

                // Exporter les données selon le type
                try {
                    if (db.type === 'mysql' && db.config && db.config.host) {
                        const connection = await mysql.createConnection({
                            host: db.config.host,
                            port: db.config.port,
                            user: db.config.user,
                            password: db.config.password,
                            database: db.config.database
                        });

                        // Obtenir toutes les tables
                        const [tables] = await connection.query('SHOW TABLES');
                        const tableData = {};

                        for (const tableRow of tables) {
                            const tableName = Object.values(tableRow)[0];
                            const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
                            tableData[tableName] = rows;
                        }

                        dbData.data = tableData;
                        await connection.end();
                    } else if (db.type === 'mongodb' && db.config && db.config.uri) {
                        const client = new MongoClient(db.config.uri);
                        await client.connect();
                        const database = client.db();
                        const collections = await database.listCollections().toArray();
                        const collectionData = {};

                        for (const coll of collections) {
                            const data = await database.collection(coll.name).find({}).toArray();
                            collectionData[coll.name] = data;
                        }

                        dbData.data = collectionData;
                        await client.close();
                    } else if (db.type === 'postgresql' && db.config && db.config.host) {
                        const pool = new Pool({
                            host: db.config.host,
                            port: db.config.port,
                            user: db.config.user,
                            password: db.config.password,
                            database: db.config.database
                        });

                        // Obtenir toutes les tables
                        const tablesResult = await pool.query(`
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_schema = 'public'
                        `);
                        const tableData = {};

                        for (const row of tablesResult.rows) {
                            const tableName = row.table_name;
                            const dataResult = await pool.query(`SELECT * FROM "${tableName}"`);
                            tableData[tableName] = dataResult.rows;
                        }

                        dbData.data = tableData;
                        await pool.end();
                    }
                } catch (error) {
                    logger.error(`Erreur export données BDD ${db.name}: ${error.message}`);
                }

                exportData.databases.push(dbData);
            }
        }

        // Exporter les clés API
        if (exportApiKeys) {
            const allKeys = apiKeys.getAllApiKeys();
            exportData.apiKeys = allKeys;
        }

        // Exporter les utilisateurs (admin seulement)
        if (exportUsers) {
            const allUsers = users.listUsers();
            exportData.users = allUsers;
        }

        res.json({ success: true, data: exportData });
    } catch (error) {
        logger.error(`API Export: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/import - Importer des données depuis un export
 */
router.post('/import', async (req, res) => {
    try {
        const importData = req.body;
        const results = {
            projects: { success: 0, failed: 0, errors: [] },
            databases: { success: 0, failed: 0, errors: [] },
            apiKeys: { success: 0, failed: 0, errors: [] },
            users: { success: 0, failed: 0, errors: [] }
        };

        // Importer les projets
        if (importData.projects && Array.isArray(importData.projects)) {
            for (const project of importData.projects) {
                try {
                    // Vérifier si le projet existe déjà
                    if (!projects.projectExists(project.name)) {
                        // Créer le projet avec un mot de passe par défaut (l'utilisateur devra le changer)
                        const defaultPassword = 'changeme123';
                        await projects.createProject(project.name, defaultPassword);
                        scriptsModule.generateScripts(project.name);
                        
                        // Importer les services si présents
                        if (project.config && project.config.services) {
                            for (const service of project.config.services) {
                                try {
                                    services.addService(project.name, service);
                                } catch (e) {
                                    logger.error(`Erreur import service ${service.name}: ${e.message}`);
                                }
                            }
                            scriptsModule.generateScripts(project.name);
                        }
                        
                        // Restaurer les fichiers si présents
                        if (project.files) {
                            try {
                                const projectPath = `/var/www/${project.name}/sites`;
                                const archivePath = `/tmp/twoine-import-${project.name}-${Date.now()}.tar.gz`;
                                
                                // Décoder le base64 et écrire l'archive
                                const archiveBuffer = Buffer.from(project.files, 'base64');
                                fs.writeFileSync(archivePath, archiveBuffer);
                                
                                // Extraire l'archive
                                const { execSync } = await import('child_process');
                                execSync(`tar -xzf ${archivePath} -C ${projectPath}`);
                                
                                // Nettoyer
                                fs.unlinkSync(archivePath);
                                
                                // Changer les permissions
                                execSync(`chown -R sftp_${project.name}:sftp_${project.name} ${projectPath}`);
                            } catch (error) {
                                logger.error(`Erreur import fichiers projet ${project.name}: ${error.message}`);
                            }
                        }
                        
                        results.projects.success++;
                    } else {
                        results.projects.failed++;
                        results.projects.errors.push(`Projet "${project.name}" existe déjà`);
                    }
                } catch (error) {
                    results.projects.failed++;
                    results.projects.errors.push(`${project.name}: ${error.message}`);
                }
            }
        }

        // Importer les bases de données
        if (importData.databases && Array.isArray(importData.databases)) {
            for (const db of importData.databases) {
                try {
                    // Vérifier si la base existe déjà
                    const existing = databases.getDatabaseById(db.id);
                    if (!existing) {
                        // Créer la base de données selon le type
                        if (db.type === 'mysql') {
                            databases.createMySQLDatabase(db.name, db.config.host, db.config.port, db.config.user, db.config.password, db.config.database);
                        } else if (db.type === 'mongodb') {
                            databases.createMongoDatabase(db.name, db.config.uri);
                        } else if (db.type === 'postgresql') {
                            databases.createPostgreSQLDatabase(db.name, db.config.host, db.config.port, db.config.user, db.config.password, db.config.database);
                        }
                        
                        // Restaurer les données si présentes
                        if (db.data) {
                            try {
                                if (db.type === 'mysql') {
                                    const connection = await mysql.createConnection({
                                        host: db.config.host,
                                        port: db.config.port,
                                        user: db.config.user,
                                        password: db.config.password,
                                        database: db.config.database
                                    });

                                    for (const [tableName, rows] of Object.entries(db.data)) {
                                        if (rows.length > 0) {
                                            const columns = Object.keys(rows[0]);
                                            const placeholders = columns.map(() => '?').join(',');
                                            const insertQuery = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES (${placeholders})`;
                                            
                                            for (const row of rows) {
                                                const values = columns.map(col => row[col]);
                                                await connection.query(insertQuery, values);
                                            }
                                        }
                                    }

                                    await connection.end();
                                } else if (db.type === 'mongodb') {
                                    const client = new MongoClient(db.config.uri);
                                    await client.connect();
                                    const database = client.db();

                                    for (const [collectionName, documents] of Object.entries(db.data)) {
                                        if (documents.length > 0) {
                                            await database.collection(collectionName).insertMany(documents);
                                        }
                                    }

                                    await client.close();
                                } else if (db.type === 'postgresql') {
                                    const pool = new Pool({
                                        host: db.config.host,
                                        port: db.config.port,
                                        user: db.config.user,
                                        password: db.config.password,
                                        database: db.config.database
                                    });

                                    for (const [tableName, rows] of Object.entries(db.data)) {
                                        if (rows.length > 0) {
                                            const columns = Object.keys(rows[0]);
                                            const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
                                            const insertQuery = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;
                                            
                                            for (const row of rows) {
                                                const values = columns.map(col => row[col]);
                                                await pool.query(insertQuery, values);
                                            }
                                        }
                                    }

                                    await pool.end();
                                }
                            } catch (error) {
                                logger.error(`Erreur import données BDD ${db.name}: ${error.message}`);
                            }
                        }
                        
                        // Assigner aux projets si nécessaire
                        if (db.assignedProjects && Array.isArray(db.assignedProjects)) {
                            for (const projectName of db.assignedProjects) {
                                try {
                                    databases.assignDatabaseToProject(db.id, projectName);
                                } catch (e) {
                                    logger.error(`Erreur assignation BDD ${db.name} au projet ${projectName}: ${e.message}`);
                                }
                            }
                        }
                        
                        results.databases.success++;
                    } else {
                        results.databases.failed++;
                        results.databases.errors.push(`Base de données "${db.name}" existe déjà`);
                    }
                } catch (error) {
                    results.databases.failed++;
                    results.databases.errors.push(`${db.name}: ${error.message}`);
                }
            }
        }

        // Importer les clés API
        if (importData.apiKeys && Array.isArray(importData.apiKeys)) {
            for (const key of importData.apiKeys) {
                try {
                    // Créer une nouvelle clé (ne pas réutiliser l'ancienne clé pour des raisons de sécurité)
                    apiKeys.createApiKey({
                        name: key.name,
                        modelName: key.modelName,
                        projects: key.projects || [],
                        requestsPerMinute: key.rateLimit || key.limits?.requestsPerMinute || 10,
                        createdBy: 'import'
                    });
                    results.apiKeys.success++;
                } catch (error) {
                    results.apiKeys.failed++;
                    results.apiKeys.errors.push(`${key.name}: ${error.message}`);
                }
            }
        }

        // Importer les utilisateurs (admin seulement)
        if (importData.users && Array.isArray(importData.users)) {
            for (const user of importData.users) {
                try {
                    // Ne pas importer l'utilisateur admin par défaut
                    if (user.username === 'admin') {
                        results.users.failed++;
                        results.users.errors.push('Impossible d\'importer l\'utilisateur admin');
                        continue;
                    }
                    
                    const existing = users.getUser(user.username);
                    if (!existing) {
                        // Créer avec un mot de passe par défaut
                        users.createUser(user.username, 'changeme123', user.role, user.projects || []);
                        results.users.success++;
                    } else {
                        results.users.failed++;
                        results.users.errors.push(`Utilisateur "${user.username}" existe déjà`);
                    }
                } catch (error) {
                    results.users.failed++;
                    results.users.errors.push(`${user.username}: ${error.message}`);
                }
            }
        }

        // Construire le message de résultat
        const totalSuccess = results.projects.success + results.databases.success + 
                           results.apiKeys.success + results.users.success;
        const totalFailed = results.projects.failed + results.databases.failed + 
                          results.apiKeys.failed + results.users.failed;

        res.json({
            success: true,
            message: `Import terminé: ${totalSuccess} réussi(s), ${totalFailed} échoué(s)`,
            results
        });
    } catch (error) {
        logger.error(`API Import: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
