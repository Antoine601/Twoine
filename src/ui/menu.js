/**
 * Interface utilisateur - Menu principal et sous-menus
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';
import figlet from 'figlet';
import ora from 'ora';

import projects from '../modules/projects.js';
import services from '../modules/services.js';
import scripts from '../modules/scripts.js';
import sftp from '../modules/sftp.js';
import nginx from '../modules/nginx.js';
import logger from '../utils/logger.js';
import { MESSAGES } from '../config/constants.js';

/**
 * Affiche le header de l'application
 */
export function displayHeader() {
    console.clear();
    
    const title = figlet.textSync('Twoine', {
        font: 'Small',
        horizontalLayout: 'default'
    });

    console.log(chalk.cyan(title));
    console.log(chalk.gray('  Outil de gestion de projets pour Ubuntu 22.04'));
    console.log(chalk.gray('  Version 1.0.0 | PM2 + SFTP Chroot\n'));
}

/**
 * Menu principal
 */
export async function mainMenu() {
    displayHeader();

    const projectsList = projects.loadProjects();
    const projectCount = projectsList.length;

    const choices = [
        { name: '📁  Lister les projets', value: 'list' },
        { name: '➕  Créer un nouveau projet', value: 'create' },
        new inquirer.Separator(),
    ];

    if (projectCount > 0) {
        choices.push({ name: '🔧  Gérer un projet', value: 'manage' });
        choices.push({ name: '🗑️   Supprimer un projet', value: 'delete' });
        choices.push(new inquirer.Separator());
    }

    choices.push({ name: '📊  Statut global PM2', value: 'pm2status' });
    choices.push({ name: '🔄  Régénérer tous les scripts', value: 'regenerate' });
    choices.push(new inquirer.Separator());
    choices.push({ name: '❌  Quitter', value: 'exit' });

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `Menu principal (${projectCount} projet(s)):`,
            choices
        }
    ]);

    return action;
}

/**
 * Affiche la liste des projets
 */
export async function showProjectsList() {
    displayHeader();
    logger.section('Liste des projets');

    const spinner = ora('Chargement des projets...').start();
    
    try {
        const projectsWithStatus = await projects.listProjectsWithStatus();
        spinner.stop();

        if (projectsWithStatus.length === 0) {
            console.log(chalk.yellow(MESSAGES.noProjects));
            return;
        }

        const table = new Table({
            head: [
                chalk.cyan('Projet'),
                chalk.cyan('Utilisateur SFTP'),
                chalk.cyan('Services'),
                chalk.cyan('Actifs'),
                chalk.cyan('Créé le')
            ],
            colWidths: [20, 20, 12, 10, 20]
        });

        for (const project of projectsWithStatus) {
            const statusColor = project.runningServices === project.totalServices && project.totalServices > 0
                ? chalk.green
                : project.runningServices > 0
                    ? chalk.yellow
                    : chalk.gray;

            table.push([
                chalk.white(project.name),
                chalk.gray(project.sftpUser || '-'),
                project.totalServices.toString(),
                statusColor(`${project.runningServices}/${project.totalServices}`),
                new Date(project.createdAt).toLocaleDateString('fr-FR')
            ]);
        }

        console.log(table.toString());
    } catch (error) {
        spinner.fail('Erreur lors du chargement');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Formulaire de création de projet
 */
export async function createProjectForm() {
    displayHeader();
    logger.section('Créer un nouveau projet');

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Nom du projet:',
            validate: (input) => {
                if (!input || input.trim() === '') {
                    return 'Le nom du projet est requis';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
                    return 'Le nom doit commencer par une lettre et ne contenir que lettres, chiffres, tirets et underscores';
                }
                if (projects.projectExists(input)) {
                    return 'Ce projet existe déjà';
                }
                return true;
            }
        },
        {
            type: 'password',
            name: 'password',
            message: 'Mot de passe SFTP:',
            mask: '*',
            validate: (input) => {
                if (!input || input.length < 8) {
                    return 'Le mot de passe doit contenir au moins 8 caractères';
                }
                return true;
            }
        },
        {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirmer le mot de passe:',
            mask: '*',
            validate: (input, answers) => {
                if (input !== answers.password) {
                    return 'Les mots de passe ne correspondent pas';
                }
                return true;
            }
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: (answers) => `Créer le projet "${answers.name}" ?`,
            default: true
        }
    ]);

    if (!answers.confirm) {
        logger.warn(MESSAGES.operationCancelled);
        await pressEnterToContinue();
        return;
    }

    const spinner = ora('Création du projet en cours...').start();

    try {
        await projects.createProject(answers.name, answers.password);
        scripts.generateScripts(answers.name);
        spinner.succeed('Projet créé avec succès !');

        // Afficher le résumé
        const box = boxen(
            `${chalk.green('✔ Projet créé avec succès !')}\n\n` +
            `${chalk.white('Nom:')} ${answers.name}\n` +
            `${chalk.white('Chemin:')} /var/www/${answers.name}\n` +
            `${chalk.white('Utilisateur SFTP:')} sftp_${answers.name}\n` +
            `${chalk.white('Dossier sites:')} /var/www/${answers.name}/sites\n\n` +
            `${chalk.gray('Utilisez "Gérer un projet" pour ajouter des services.')}`,
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }
        );
        console.log(box);

    } catch (error) {
        spinner.fail('Erreur lors de la création');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Sélection d'un projet
 */
export async function selectProject() {
    const projectsList = projects.loadProjects();

    if (projectsList.length === 0) {
        logger.warn(MESSAGES.noProjects);
        return null;
    }

    const { projectName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'projectName',
            message: 'Sélectionner un projet:',
            choices: [
                ...projectsList.map(p => ({
                    name: `📁 ${p.name}`,
                    value: p.name
                })),
                new inquirer.Separator(),
                { name: '← Retour', value: null }
            ]
        }
    ]);

    return projectName;
}

/**
 * Menu de gestion d'un projet
 */
export async function projectManagementMenu(projectName) {
    while (true) {
        displayHeader();
        
        const projectConfig = projects.loadProjectConfig(projectName);
        const servicesStatus = await services.getAllServicesStatus(projectName);

        // Afficher l'en-tête du projet
        console.log(boxen(
            `${chalk.cyan.bold(projectName)}\n` +
            `${chalk.gray('Chemin:')} /var/www/${projectName}\n` +
            `${chalk.gray('Services:')} ${servicesStatus.length}`,
            { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
        ));

        // Afficher le statut des services
        if (servicesStatus.length > 0) {
            const table = new Table({
                head: [
                    chalk.cyan('Service'),
                    chalk.cyan('Statut'),
                    chalk.cyan('PID'),
                    chalk.cyan('Restarts'),
                    chalk.cyan('Mémoire')
                ],
                colWidths: [20, 12, 10, 12, 15]
            });

            for (const svc of servicesStatus) {
                const statusIcon = svc.status === 'online' 
                    ? chalk.green('● online') 
                    : chalk.red('○ stopped');
                
                const memory = svc.memory 
                    ? `${Math.round(svc.memory / 1024 / 1024)} MB` 
                    : '-';

                table.push([
                    svc.name,
                    statusIcon,
                    svc.pid || '-',
                    svc.restarts || 0,
                    memory
                ]);
            }

            console.log(table.toString());
        }

        const choices = [
            { name: '➕  Ajouter un service', value: 'add_service' },
        ];

        if (servicesStatus.length > 0) {
            choices.push(
                { name: '▶️   Démarrer un service', value: 'start_service' },
                { name: '⏹️   Arrêter un service', value: 'stop_service' },
                { name: '🔄  Redémarrer un service', value: 'restart_service' },
                { name: '📋  Voir les logs', value: 'logs' },
                new inquirer.Separator(),
                { name: '▶️   Démarrer TOUS les services', value: 'start_all' },
                { name: '⏹️   Arrêter TOUS les services', value: 'stop_all' },
                new inquirer.Separator(),
                { name: '✏️   Modifier un service', value: 'edit_service' },
                { name: '🗑️   Supprimer un service', value: 'remove_service' }
            );
        }

        choices.push(
            new inquirer.Separator(),
            { name: '🌐  Gérer les reverse proxy (Nginx)', value: 'nginx_menu' },
            new inquirer.Separator(),
            { name: '🔑  Changer mot de passe SFTP', value: 'change_password' },
            { name: '📜  Régénérer les scripts', value: 'regenerate' },
            { name: '📂  Afficher les chemins', value: 'paths' },
            new inquirer.Separator(),
            { name: '← Retour au menu principal', value: 'back' }
        );

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Action:',
                choices,
                pageSize: 15
            }
        ]);

        switch (action) {
            case 'add_service':
                await addServiceForm(projectName);
                break;
            case 'start_service':
                await startServiceAction(projectName);
                break;
            case 'stop_service':
                await stopServiceAction(projectName);
                break;
            case 'restart_service':
                await restartServiceAction(projectName);
                break;
            case 'logs':
                await showServiceLogs(projectName);
                break;
            case 'start_all':
                await startAllServicesAction(projectName);
                break;
            case 'stop_all':
                await stopAllServicesAction(projectName);
                break;
            case 'edit_service':
                await editServiceForm(projectName);
                break;
            case 'remove_service':
                await removeServiceAction(projectName);
                break;
            case 'change_password':
                await changePasswordForm(projectName);
                break;
            case 'regenerate':
                scripts.generateScripts(projectName);
                await pressEnterToContinue();
                break;
            case 'paths':
                await showProjectPaths(projectName);
                break;
            case 'nginx_menu':
                await nginxManagementMenu(projectName);
                break;
            case 'back':
                return;
        }
    }
}

/**
 * Formulaire d'ajout de service
 */
async function addServiceForm(projectName) {
    logger.section('Ajouter un service');

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Nom du service (ex: api, site, admin):',
            validate: (input) => {
                if (!input || input.trim() === '') {
                    return 'Le nom est requis';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
                    return 'Le nom doit commencer par une lettre';
                }
                return true;
            }
        },
        {
            type: 'input',
            name: 'directory',
            message: 'Chemin du dossier (relatif à sites/ ou absolu):',
            default: (answers) => answers.name,
            validate: (input) => input && input.trim() !== '' ? true : 'Le chemin est requis'
        },
        {
            type: 'input',
            name: 'setupCommands',
            message: 'Commandes de setup (séparées par ;, ex: npm install):',
            default: '',
            filter: (input) => input ? input.split(';').map(c => c.trim()).filter(c => c) : []
        },
        {
            type: 'input',
            name: 'command',
            message: 'Commande de démarrage (PM2):',
            default: 'npm start',
            validate: (input) => input && input.trim() !== '' ? true : 'La commande est requise'
        },
        {
            type: 'input',
            name: 'description',
            message: 'Description (optionnel):',
            default: ''
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Ajouter ce service ?',
            default: true
        }
    ]);

    if (!answers.confirm) {
        logger.warn(MESSAGES.operationCancelled);
        return;
    }

    const spinner = ora('Ajout du service...').start();

    try {
        services.addService(projectName, {
            name: answers.name,
            directory: answers.directory,
            setupCommands: answers.setupCommands,
            command: answers.command,
            description: answers.description
        });

        scripts.generateScripts(projectName);
        spinner.succeed(`Service ${answers.name} ajouté`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Sélection d'un service
 */
async function selectService(projectName, message = 'Sélectionner un service:') {
    const servicesList = services.listServices(projectName);

    if (servicesList.length === 0) {
        logger.warn(MESSAGES.noServices);
        return null;
    }

    const { serviceName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'serviceName',
            message,
            choices: [
                ...servicesList.map(s => {
                    const setupCount = (s.setupCommands || []).length;
                    const setupInfo = setupCount > 0 ? ` [${setupCount} setup cmd]` : '';
                    return {
                        name: `${s.name} (${s.command})${chalk.gray(setupInfo)}`,
                        value: s.name
                    };
                }),
                new inquirer.Separator(),
                { name: '← Annuler', value: null }
            ]
        }
    ]);

    return serviceName;
}

/**
 * Action: Démarrer un service
 */
async function startServiceAction(projectName) {
    const serviceName = await selectService(projectName, 'Service à démarrer:');
    if (!serviceName) return;

    const service = services.getService(projectName, serviceName);
    const hasSetupCommands = (service.setupCommands || []).length > 0;

    let runSetup = true;
    if (hasSetupCommands) {
        const { setupChoice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'setupChoice',
                message: `Ce service a ${service.setupCommands.length} commande(s) de setup:`,
                choices: [
                    { name: '▶️  Exécuter setup + démarrer', value: 'with_setup' },
                    { name: '⏩  Démarrer sans setup', value: 'skip_setup' },
                    { name: '🛠️  Exécuter setup seulement', value: 'setup_only' },
                    { name: '← Annuler', value: 'cancel' }
                ]
            }
        ]);

        if (setupChoice === 'cancel') return;
        runSetup = setupChoice === 'with_setup' || setupChoice === 'setup_only';

        if (setupChoice === 'setup_only') {
            const spinner = ora(`Exécution du setup pour ${serviceName}...`).start();
            try {
                for (const cmd of service.setupCommands) {
                    spinner.text = `Exécution: ${cmd}`;
                    const shell = (await import('../utils/shell.js')).default;
                    await shell.execCommand(cmd, { cwd: service.directory });
                }
                spinner.succeed(`Setup terminé pour ${serviceName}`);
            } catch (error) {
                spinner.fail('Erreur');
                logger.error(error.message);
            }
            await pressEnterToContinue();
            return;
        }

        runSetup = setupChoice === 'with_setup';
    }

    const spinner = ora(`Démarrage de ${serviceName}...`).start();

    try {
        await services.startService(projectName, serviceName, runSetup);
        spinner.succeed(`${serviceName} démarré`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Action: Arrêter un service
 */
async function stopServiceAction(projectName) {
    const serviceName = await selectService(projectName, 'Service à arrêter:');
    if (!serviceName) return;

    const spinner = ora(`Arrêt de ${serviceName}...`).start();

    try {
        await services.stopService(projectName, serviceName);
        spinner.succeed(`${serviceName} arrêté`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Action: Redémarrer un service
 */
async function restartServiceAction(projectName) {
    const serviceName = await selectService(projectName, 'Service à redémarrer:');
    if (!serviceName) return;

    const spinner = ora(`Redémarrage de ${serviceName}...`).start();

    try {
        await services.restartService(projectName, serviceName);
        spinner.succeed(`${serviceName} redémarré`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Afficher les logs d'un service
 */
async function showServiceLogs(projectName) {
    const serviceName = await selectService(projectName, 'Voir les logs de:');
    if (!serviceName) return;

    logger.section(`Logs: ${projectName}-${serviceName}`);

    try {
        const logs = await services.getServiceLogs(projectName, serviceName, 100);
        console.log(logs);
    } catch (error) {
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Démarrer tous les services
 */
async function startAllServicesAction(projectName) {
    const servicesList = services.listServices(projectName);
    const hasAnySetup = servicesList.some(s => (s.setupCommands || []).length > 0);

    const { setupChoice } = await inquirer.prompt([
        {
            type: 'list',
            name: 'setupChoice',
            message: hasAnySetup 
                ? 'Certains services ont des commandes de setup. Que faire ?' 
                : 'Démarrer tous les services ?',
            choices: hasAnySetup ? [
                { name: '▶️  Exécuter setup + démarrer tous', value: 'with_setup' },
                { name: '⏩  Démarrer tous sans setup', value: 'skip_setup' },
                { name: '← Annuler', value: 'cancel' }
            ] : [
                { name: '▶️  Démarrer tous les services', value: 'skip_setup' },
                { name: '← Annuler', value: 'cancel' }
            ]
        }
    ]);

    if (setupChoice === 'cancel') return;

    const runSetup = setupChoice === 'with_setup';
    const spinner = ora('Démarrage des services...').start();

    try {
        for (const svc of servicesList) {
            spinner.text = `Démarrage de ${svc.name}...`;
            await services.startService(projectName, svc.name, runSetup);
        }
        spinner.succeed('Tous les services démarrés');
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Arrêter tous les services
 */
async function stopAllServicesAction(projectName) {
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Arrêter tous les services ?',
            default: false
        }
    ]);

    if (!confirm) return;

    const spinner = ora('Arrêt des services...').start();

    try {
        await services.stopAllServices(projectName);
        spinner.succeed('Tous les services arrêtés');
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Formulaire d'édition de service
 */
async function editServiceForm(projectName) {
    const serviceName = await selectService(projectName, 'Service à modifier:');
    if (!serviceName) return;

    const service = services.getService(projectName, serviceName);
    const currentSetupCommands = (service.setupCommands || []).join('; ');

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'directory',
            message: 'Nouveau chemin du dossier:',
            default: service.directory
        },
        {
            type: 'input',
            name: 'setupCommands',
            message: 'Commandes de setup (séparées par ;):',
            default: currentSetupCommands,
            filter: (input) => input ? input.split(';').map(c => c.trim()).filter(c => c) : []
        },
        {
            type: 'input',
            name: 'command',
            message: 'Nouvelle commande de démarrage:',
            default: service.command
        },
        {
            type: 'input',
            name: 'description',
            message: 'Nouvelle description:',
            default: service.description
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Appliquer les modifications ?',
            default: true
        }
    ]);

    if (!answers.confirm) return;

    try {
        services.updateService(projectName, serviceName, {
            directory: answers.directory,
            setupCommands: answers.setupCommands,
            command: answers.command,
            description: answers.description
        });

        scripts.generateScripts(projectName);
        logger.success('Service mis à jour');
    } catch (error) {
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Supprimer un service
 */
async function removeServiceAction(projectName) {
    const serviceName = await selectService(projectName, 'Service à supprimer:');
    if (!serviceName) return;

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Supprimer le service "${serviceName}" ?`,
            default: false
        }
    ]);

    if (!confirm) return;

    const spinner = ora('Suppression...').start();

    try {
        await services.removeService(projectName, serviceName);
        scripts.generateScripts(projectName);
        spinner.succeed('Service supprimé');
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Formulaire de changement de mot de passe
 */
async function changePasswordForm(projectName) {
    logger.section('Changer le mot de passe SFTP');

    const answers = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Nouveau mot de passe:',
            mask: '*',
            validate: (input) => input && input.length >= 8 ? true : 'Minimum 8 caractères'
        },
        {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirmer:',
            mask: '*',
            validate: (input, answers) => input === answers.password ? true : 'Non identique'
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Changer le mot de passe ?',
            default: true
        }
    ]);

    if (!answers.confirm) return;

    try {
        await sftp.changeSftpPassword(projectName, answers.password);
        logger.success('Mot de passe changé');
    } catch (error) {
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Afficher les chemins du projet
 */
async function showProjectPaths(projectName) {
    logger.section(`Chemins: ${projectName}`);

    const scriptPaths = scripts.getScriptsPaths(projectName);

    console.log(chalk.white('Dossier projet:'), `/var/www/${projectName}`);
    console.log(chalk.white('Dossier sites:'), `/var/www/${projectName}/sites`);
    console.log(chalk.white('Scripts:'), scriptPaths.directory);
    console.log('');
    console.log(chalk.gray('Scripts disponibles:'));
    console.log(`  ${scriptPaths.start}`);
    console.log(`  ${scriptPaths.stop}`);
    console.log(`  ${scriptPaths.restart}`);
    console.log(`  ${scriptPaths.status}`);

    await pressEnterToContinue();
}

/**
 * Supprimer un projet
 */
export async function deleteProjectForm() {
    displayHeader();
    logger.section('Supprimer un projet');

    const projectName = await selectProject();
    if (!projectName) return;

    const { deleteFiles, confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'deleteFiles',
            message: 'Supprimer également les fichiers du projet ?',
            default: false
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: `ATTENTION: Supprimer définitivement "${projectName}" ?`,
            default: false
        }
    ]);

    if (!confirm) {
        logger.warn(MESSAGES.operationCancelled);
        await pressEnterToContinue();
        return;
    }

    const spinner = ora('Suppression en cours...').start();

    try {
        await projects.deleteProject(projectName, deleteFiles);
        spinner.succeed(`Projet ${projectName} supprimé`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Afficher le statut global PM2
 */
export async function showPm2Status() {
    displayHeader();
    logger.section('Statut PM2 global');

    try {
        const { stdout } = await import('../utils/shell.js').then(m => m.default.execCommand('pm2 list'));
        console.log(stdout);
    } catch (error) {
        logger.error(`PM2 non disponible: ${error.message}`);
    }

    await pressEnterToContinue();
}

/**
 * Régénérer tous les scripts
 */
export async function regenerateAllScriptsAction() {
    displayHeader();
    logger.section('Régénération des scripts');

    const spinner = ora('Régénération...').start();

    try {
        scripts.regenerateAllScripts();
        spinner.succeed('Scripts régénérés');
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Menu de gestion Nginx
 */
async function nginxManagementMenu(projectName) {
    while (true) {
        displayHeader();
        logger.section(`Reverse Proxy Nginx - ${projectName}`);

        const proxiesStatus = nginx.getAllProxiesStatus(projectName);

        if (proxiesStatus.length > 0) {
            const table = new Table({
                head: [
                    chalk.cyan('Nom'),
                    chalk.cyan('Domaine'),
                    chalk.cyan('Cible'),
                    chalk.cyan('SSL'),
                    chalk.cyan('Statut')
                ],
                colWidths: [15, 30, 25, 8, 12]
            });

            for (const proxy of proxiesStatus) {
                const statusIcon = proxy.enabled
                    ? chalk.green('● actif')
                    : chalk.gray('○ inactif');
                const sslIcon = proxy.ssl ? chalk.green('✓') : chalk.gray('-');
                const target = `${proxy.targetHost}:${proxy.targetPort}`;

                table.push([
                    proxy.name,
                    proxy.domain,
                    target,
                    sslIcon,
                    statusIcon
                ]);
            }

            console.log(table.toString());
        } else {
            console.log(chalk.yellow('Aucun reverse proxy configuré.\n'));
        }

        const choices = [
            { name: '➕  Ajouter un reverse proxy', value: 'add_proxy' },
        ];

        if (proxiesStatus.length > 0) {
            choices.push(
                { name: '✏️   Modifier un proxy', value: 'edit_proxy' },
                { name: '🗑️   Supprimer un proxy', value: 'remove_proxy' },
                new inquirer.Separator(),
                { name: '✅  Activer un proxy', value: 'enable_proxy' },
                { name: '❌  Désactiver un proxy', value: 'disable_proxy' }
            );
        }

        choices.push(
            new inquirer.Separator(),
            { name: '← Retour', value: 'back' }
        );

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Action:',
                choices
            }
        ]);

        switch (action) {
            case 'add_proxy':
                await addProxyForm(projectName);
                break;
            case 'edit_proxy':
                await editProxyForm(projectName);
                break;
            case 'remove_proxy':
                await removeProxyAction(projectName);
                break;
            case 'enable_proxy':
                await enableProxyAction(projectName);
                break;
            case 'disable_proxy':
                await disableProxyAction(projectName);
                break;
            case 'back':
                return;
        }
    }
}

/**
 * Formulaire d'ajout de reverse proxy
 */
async function addProxyForm(projectName) {
    logger.section('Ajouter un reverse proxy');

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Nom du proxy (ex: api, web):',
            validate: (input) => {
                if (!input || input.trim() === '') {
                    return 'Le nom est requis';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
                    return 'Le nom doit commencer par une lettre';
                }
                return true;
            }
        },
        {
            type: 'input',
            name: 'domain',
            message: 'Nom de domaine (ex: api.example.com):',
            validate: (input) => input && input.trim() !== '' ? true : 'Le domaine est requis'
        },
        {
            type: 'input',
            name: 'targetHost',
            message: 'Hôte cible:',
            default: 'localhost'
        },
        {
            type: 'input',
            name: 'targetPort',
            message: 'Port cible:',
            validate: (input) => {
                const port = parseInt(input);
                if (isNaN(port) || port < 1 || port > 65535) {
                    return 'Port invalide (1-65535)';
                }
                return true;
            },
            filter: (input) => parseInt(input)
        },
        {
            type: 'confirm',
            name: 'ssl',
            message: 'Activer SSL (nécessite certbot) ?',
            default: false
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Créer ce reverse proxy ?',
            default: true
        }
    ]);

    if (!answers.confirm) {
        logger.warn(MESSAGES.operationCancelled);
        await pressEnterToContinue();
        return;
    }

    try {
        nginx.addProxy(projectName, {
            name: answers.name,
            domain: answers.domain,
            targetHost: answers.targetHost,
            targetPort: answers.targetPort,
            ssl: answers.ssl
        });
        logger.success(`Proxy ${answers.name} ajouté`);
        
        const { enableNow } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'enableNow',
                message: 'Activer le proxy maintenant ?',
                default: true
            }
        ]);

        if (enableNow) {
            const ora = (await import('ora')).default;
            const spinner = ora('Activation du proxy...').start();
            try {
                await nginx.enableProxy(projectName, answers.name);
                spinner.succeed('Proxy activé');
            } catch (error) {
                spinner.fail('Erreur');
                logger.error(error.message);
            }
        }
    } catch (error) {
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Sélection d'un proxy
 */
async function selectProxy(projectName, message = 'Sélectionner un proxy:') {
    const proxiesList = nginx.listProxies(projectName);

    if (proxiesList.length === 0) {
        logger.warn('Aucun proxy configuré.');
        return null;
    }

    const { proxyName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'proxyName',
            message,
            choices: [
                ...proxiesList.map(p => ({
                    name: `${p.name} (${p.domain} → ${p.targetHost}:${p.targetPort})`,
                    value: p.name
                })),
                new inquirer.Separator(),
                { name: '← Annuler', value: null }
            ]
        }
    ]);

    return proxyName;
}

/**
 * Formulaire d'édition de proxy
 */
async function editProxyForm(projectName) {
    const proxyName = await selectProxy(projectName, 'Proxy à modifier:');
    if (!proxyName) return;

    const proxy = nginx.getProxy(projectName, proxyName);

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'domain',
            message: 'Nouveau domaine:',
            default: proxy.domain
        },
        {
            type: 'input',
            name: 'targetHost',
            message: 'Nouvel hôte cible:',
            default: proxy.targetHost
        },
        {
            type: 'input',
            name: 'targetPort',
            message: 'Nouveau port cible:',
            default: proxy.targetPort.toString(),
            validate: (input) => {
                const port = parseInt(input);
                if (isNaN(port) || port < 1 || port > 65535) {
                    return 'Port invalide (1-65535)';
                }
                return true;
            },
            filter: (input) => parseInt(input)
        },
        {
            type: 'confirm',
            name: 'ssl',
            message: 'SSL activé ?',
            default: proxy.ssl
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Appliquer les modifications ?',
            default: true
        }
    ]);

    if (!answers.confirm) return;

    try {
        nginx.updateProxy(projectName, proxyName, {
            domain: answers.domain,
            targetHost: answers.targetHost,
            targetPort: answers.targetPort,
            ssl: answers.ssl
        });
        logger.success('Proxy mis à jour');

        if (nginx.isProxyEnabled(projectName, proxyName)) {
            const { reloadNow } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'reloadNow',
                    message: 'Le proxy est actif. Recharger la configuration Nginx ?',
                    default: true
                }
            ]);

            if (reloadNow) {
                const ora = (await import('ora')).default;
                const spinner = ora('Rechargement...').start();
                try {
                    await nginx.enableProxy(projectName, proxyName);
                    spinner.succeed('Configuration rechargée');
                } catch (error) {
                    spinner.fail('Erreur');
                    logger.error(error.message);
                }
            }
        }
    } catch (error) {
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Action: Supprimer un proxy
 */
async function removeProxyAction(projectName) {
    const proxyName = await selectProxy(projectName, 'Proxy à supprimer:');
    if (!proxyName) return;

    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `Supprimer le proxy "${proxyName}" ?`,
            default: false
        }
    ]);

    if (!confirm) return;

    const ora = (await import('ora')).default;
    const spinner = ora('Suppression...').start();

    try {
        await nginx.removeProxy(projectName, proxyName);
        spinner.succeed('Proxy supprimé');
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Action: Activer un proxy
 */
async function enableProxyAction(projectName) {
    const proxyName = await selectProxy(projectName, 'Proxy à activer:');
    if (!proxyName) return;

    if (nginx.isProxyEnabled(projectName, proxyName)) {
        logger.warn('Ce proxy est déjà activé.');
        await pressEnterToContinue();
        return;
    }

    const ora = (await import('ora')).default;
    const spinner = ora(`Activation de ${proxyName}...`).start();

    try {
        await nginx.enableProxy(projectName, proxyName);
        spinner.succeed(`${proxyName} activé`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Action: Désactiver un proxy
 */
async function disableProxyAction(projectName) {
    const proxyName = await selectProxy(projectName, 'Proxy à désactiver:');
    if (!proxyName) return;

    if (!nginx.isProxyEnabled(projectName, proxyName)) {
        logger.warn('Ce proxy est déjà désactivé.');
        await pressEnterToContinue();
        return;
    }

    const ora = (await import('ora')).default;
    const spinner = ora(`Désactivation de ${proxyName}...`).start();

    try {
        await nginx.disableProxy(projectName, proxyName);
        spinner.succeed(`${proxyName} désactivé`);
    } catch (error) {
        spinner.fail('Erreur');
        logger.error(error.message);
    }

    await pressEnterToContinue();
}

/**
 * Pause - Appuyer sur Entrée pour continuer
 */
async function pressEnterToContinue() {
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: chalk.gray('Appuyez sur Entrée pour continuer...')
        }
    ]);
}

export default {
    displayHeader,
    mainMenu,
    showProjectsList,
    createProjectForm,
    selectProject,
    projectManagementMenu,
    deleteProjectForm,
    showPm2Status,
    regenerateAllScriptsAction
};
