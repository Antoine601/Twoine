/**
 * Constants de configuration pour l'outil de gestion de projets
 */

// Chemin de base pour les projets web
export const BASE_PATH = '/var/www';

// Préfixe pour les utilisateurs SFTP
export const SFTP_USER_PREFIX = 'sftp_';

// Groupe SFTP
export const SFTP_GROUP = 'sftpusers';

// Fichier de configuration SSH
export const SSH_CONFIG_PATH = '/etc/ssh/sshd_config';

// Fichier de configuration des projets de l'outil
export const TOOL_CONFIG_PATH = '/etc/nodejs-project-manager';
export const PROJECTS_CONFIG_FILE = '/etc/nodejs-project-manager/projects.json';

// Structure des dossiers d'un projet
export const PROJECT_STRUCTURE = {
    sites: 'sites',
    scripts: 'scripts',
    config: 'project.json'
};

// Nom des scripts générés
export const SCRIPTS = {
    start: 'start.sh',
    stop: 'stop.sh'
};

// Configuration PM2
export const PM2_CONFIG = {
    logPath: '/var/log/pm2',
    pidPath: '/var/run/pm2'
};

// Couleurs pour l'interface
export const COLORS = {
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'cyan',
    primary: 'blue'
};

// Messages
export const MESSAGES = {
    noProjects: 'Aucun projet configuré. Créez-en un d\'abord.',
    noServices: 'Aucun service configuré pour ce projet.',
    requireRoot: 'Cet outil doit être exécuté en tant que root (sudo).',
    projectCreated: 'Projet créé avec succès !',
    serviceAdded: 'Service ajouté avec succès !',
    operationCancelled: 'Opération annulée.'
};
