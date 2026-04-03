/**
 * Module de génération des scripts start.sh et stop.sh
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH, PROJECT_STRUCTURE, SCRIPTS } from '../config/constants.js';
import projects from './projects.js';
import logger from '../utils/logger.js';

/**
 * Génère le contenu du script start.sh
 * @param {string} projectName - Nom du projet
 * @param {Array} services - Liste des services
 * @returns {string}
 */
function generateStartScript(projectName, services) {
    let script = `#!/bin/bash
# ============================================
# Script de démarrage des services
# Projet: ${projectName}
# Généré automatiquement - Ne pas modifier
# ============================================

set -e

echo "=========================================="
echo "  Démarrage des services: ${projectName}"
echo "=========================================="
echo ""

# Vérifier si PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo "ERREUR: PM2 n'est pas installé"
    echo "Installez-le avec: npm install -g pm2"
    exit 1
fi

`;

    if (services.length === 0) {
        script += `echo "Aucun service configuré pour ce projet"\n`;
        script += `exit 0\n`;
    } else {
        for (const service of services) {
            const pm2Name = `${projectName}-${service.name}`;
            script += `# Service: ${service.name}\n`;
            script += `echo "Démarrage de ${service.name}..."\n`;
            script += `cd "${service.directory}"\n`;
            
            // Avertissement si la commande semble être un build
            if (service.command && (service.command.includes('build') || service.command.includes('tsc'))) {
                script += `echo "⚠ ATTENTION: La commande '${service.command}' semble être un build"\n`;
                script += `echo "⚠ PM2 va redémarrer en boucle car le build se termine"\n`;
                script += `echo "⚠ Utilisez 'npm start' ou 'npx vite preview' pour un serveur"\n`;
                script += `echo ""\n`;
            }
            
            script += `pm2 start "${service.command}" --name "${pm2Name}" --cwd "${service.directory}" 2>/dev/null || pm2 restart "${pm2Name}"\n`;
            script += `echo "  ✔ ${service.name} démarré"\n`;
            script += `echo ""\n\n`;
        }

        script += `# Sauvegarder la configuration PM2\n`;
        script += `pm2 save\n\n`;
        script += `echo "=========================================="
echo "  Tous les services ont été démarrés"
echo "=========================================="
echo ""
echo "Utilisez 'pm2 status' pour voir l'état des services"
echo "Utilisez 'pm2 logs' pour voir les logs"
`;
    }

    return script;
}

/**
 * Génère le contenu du script stop.sh
 * @param {string} projectName - Nom du projet
 * @param {Array} services - Liste des services
 * @returns {string}
 */
function generateStopScript(projectName, services) {
    let script = `#!/bin/bash
# ============================================
# Script d'arrêt des services
# Projet: ${projectName}
# Généré automatiquement - Ne pas modifier
# ============================================

set -e

echo "=========================================="
echo "  Arrêt des services: ${projectName}"
echo "=========================================="
echo ""

# Vérifier si PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo "ERREUR: PM2 n'est pas installé"
    exit 1
fi

`;

    if (services.length === 0) {
        script += `echo "Aucun service configuré pour ce projet"\n`;
        script += `exit 0\n`;
    } else {
        for (const service of services) {
            const pm2Name = `${projectName}-${service.name}`;
            script += `# Service: ${service.name}\n`;
            script += `echo "Arrêt de ${service.name}..."\n`;
            script += `pm2 stop "${pm2Name}" 2>/dev/null || echo "  (non actif)"\n`;
            script += `echo "  ✔ ${service.name} arrêté"\n`;
            script += `echo ""\n\n`;
        }

        script += `# Sauvegarder la configuration PM2\n`;
        script += `pm2 save\n\n`;
        script += `echo "=========================================="
echo "  Tous les services ont été arrêtés"
echo "=========================================="
`;
    }

    return script;
}

/**
 * Génère un script de redémarrage
 * @param {string} projectName - Nom du projet
 * @param {Array} services - Liste des services
 * @returns {string}
 */
function generateRestartScript(projectName, services) {
    let script = `#!/bin/bash
# ============================================
# Script de redémarrage des services
# Projet: ${projectName}
# Généré automatiquement - Ne pas modifier
# ============================================

set -e

echo "=========================================="
echo "  Redémarrage des services: ${projectName}"
echo "=========================================="
echo ""

# Vérifier si PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo "ERREUR: PM2 n'est pas installé"
    exit 1
fi

`;

    if (services.length === 0) {
        script += `echo "Aucun service configuré pour ce projet"\n`;
        script += `exit 0\n`;
    } else {
        for (const service of services) {
            const pm2Name = `${projectName}-${service.name}`;
            script += `# Service: ${service.name}\n`;
            script += `echo "Redémarrage de ${service.name}..."\n`;
            script += `pm2 restart "${pm2Name}" 2>/dev/null || echo "  (démarrage initial...)"\n`;
            script += `echo "  ✔ ${service.name} redémarré"\n`;
            script += `echo ""\n\n`;
        }

        script += `# Sauvegarder la configuration PM2\n`;
        script += `pm2 save\n\n`;
        script += `echo "=========================================="
echo "  Tous les services ont été redémarrés"
echo "=========================================="
`;
    }

    return script;
}

/**
 * Génère un script de déploiement
 * @param {string} projectName - Nom du projet
 * @param {Array} services - Liste des services
 * @returns {string}
 */
function generateDeployScript(projectName, services) {
    let script = `#!/bin/bash
# ============================================
# Script de déploiement
# Projet: ${projectName}
# Généré automatiquement - Ne pas modifier
# ============================================

set -e

echo "=========================================="
echo "  Déploiement: ${projectName}"
echo "=========================================="
echo ""

# Fonction pour corriger les permissions
fix_permissions() {
    local dir="$1"
    local user="$2"
    
    echo "Correction des permissions pour: $dir"
    
    # Vérifier si on a les droits sudo
    if sudo -n true 2>/dev/null; then
        echo "  → Changement du propriétaire..."
        sudo chown -R "$user:$user" "$dir"
        echo "  → Ajustement des permissions..."
        sudo chmod -R u+rwX,g+rX,o+rX "$dir"
        echo "  ✔ Permissions corrigées"
    else
        echo "  ⚠ Sudo requis pour corriger les permissions"
        echo "  Exécutez: sudo chown -R $user:$user $dir"
        exit 1
    fi
}

`;

    if (services.length === 0) {
        script += `echo "Aucun service configuré pour ce projet"\n`;
    } else {
        script += `# Déploiement de chaque service\n`;
        script += `CURRENT_USER=$(whoami)\n\n`;
        
        for (const service of services) {
            const runtime = service.runtime || 'nodejs';
            script += `# Service: ${service.name} (${runtime})\n`;
            script += `echo "Déploiement de ${service.name} (${runtime})..."\n`;
            script += `cd "${service.directory}"\n\n`;
            
            script += `# Vérifier et corriger les permissions si nécessaire\n`;
            script += `if [ ! -w "${service.directory}" ]; then\n`;
            script += `    echo "  ⚠ Permissions insuffisantes"\n`;
            script += `    fix_permissions "${service.directory}" "$CURRENT_USER"\n`;
            script += `fi\n\n`;
            
            // Installation des dépendances selon le runtime
            if (runtime === 'nodejs') {
                script += `# Installer les dépendances Node.js\n`;
                script += `if [ -f "package.json" ]; then\n`;
                script += `    echo "  → Installation des dépendances npm..."\n`;
                script += `    npm install || {\n`;
                script += `        echo "  ✗ Erreur lors de npm install"\n`;
                script += `        echo "  Tentative de correction des permissions..."\n`;
                script += `        fix_permissions "${service.directory}" "$CURRENT_USER"\n`;
                script += `        npm install || exit 1\n`;
                script += `    }\n`;
                script += `    echo "  ✔ Dépendances installées"\n`;
                script += `fi\n\n`;
                
                script += `# Build si nécessaire\n`;
                script += `if grep -q '"build"' package.json 2>/dev/null; then\n`;
                script += `    echo "  → Build de l'application..."\n`;
                script += `    npm run build 2>/dev/null || echo "  (pas de build configuré)"\n`;
                script += `fi\n\n`;
            } else if (runtime === 'python') {
                script += `# Installer les dépendances Python\n`;
                script += `if [ -f "requirements.txt" ]; then\n`;
                script += `    echo "  → Installation des dépendances Python..."\n`;
                script += `    python3 -m pip install -r requirements.txt --user || {\n`;
                script += `        echo "  ✗ Erreur lors de l'installation des dépendances"\n`;
                script += `        exit 1\n`;
                script += `    }\n`;
                script += `    echo "  ✔ Dépendances Python installées"\n`;
                script += `else\n`;
                script += `    echo "  ℹ Aucun fichier requirements.txt trouvé"\n`;
                script += `fi\n\n`;
            } else if (runtime === 'php') {
                script += `# Installer les dépendances PHP (Composer)\n`;
                script += `if [ -f "composer.json" ]; then\n`;
                script += `    if command -v composer &> /dev/null; then\n`;
                script += `        echo "  → Installation des dépendances Composer..."\n`;
                script += `        composer install --no-dev --optimize-autoloader || {\n`;
                script += `            echo "  ✗ Erreur lors de composer install"\n`;
                script += `            exit 1\n`;
                script += `        }\n`;
                script += `        echo "  ✔ Dépendances Composer installées"\n`;
                script += `    else\n`;
                script += `        echo "  ⚠ Composer n'est pas installé"\n`;
                script += `    fi\n`;
                script += `else\n`;
                script += `    echo "  ℹ Aucun fichier composer.json trouvé"\n`;
                script += `fi\n\n`;
            }
            
            script += `echo "  ✔ ${service.name} déployé"\n`;
            script += `echo ""\n\n`;
        }
        
        script += `echo "=========================================="\n`;
        script += `echo "  Déploiement terminé"\n`;
        script += `echo "=========================================="\n`;
        script += `echo ""\n`;
        script += `echo "Utilisez './scripts/start.sh' pour démarrer les services"\n`;
    }

    return script;
}

/**
 * Génère un script de statut
 * @param {string} projectName - Nom du projet
 * @param {Array} services - Liste des services
 * @returns {string}
 */
function generateStatusScript(projectName, services) {
    let script = `#!/bin/bash
# ============================================
# Script de statut des services
# Projet: ${projectName}
# Généré automatiquement - Ne pas modifier
# ============================================

echo "=========================================="
echo "  Statut des services: ${projectName}"
echo "=========================================="
echo ""

# Vérifier si PM2 est installé
if ! command -v pm2 &> /dev/null; then
    echo "ERREUR: PM2 n'est pas installé"
    exit 1
fi

`;

    if (services.length === 0) {
        script += `echo "Aucun service configuré pour ce projet"\n`;
    } else {
        script += `# Afficher le statut de tous les services du projet\n`;
        script += `pm2 list | grep -E "(${services.map(s => `${projectName}-${s.name}`).join('|')}|Name|─)" || echo "Aucun service actif"\n`;
    }

    return script;
}

/**
 * Génère tous les scripts pour un projet
 * @param {string} projectName - Nom du projet
 * @returns {void}
 */
export function generateScripts(projectName) {
    const projectConfig = projects.loadProjectConfig(projectName);
    const services = projectConfig.services || [];
    const scriptsPath = path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.scripts);

    // S'assurer que le dossier scripts existe
    if (!fs.existsSync(scriptsPath)) {
        fs.mkdirSync(scriptsPath, { recursive: true });
    }

    // Générer start.sh
    const startScriptPath = path.join(scriptsPath, SCRIPTS.start);
    const startContent = generateStartScript(projectName, services);
    fs.writeFileSync(startScriptPath, startContent);
    fs.chmodSync(startScriptPath, '755');
    logger.debug(`Script créé: ${startScriptPath}`);

    // Générer stop.sh
    const stopScriptPath = path.join(scriptsPath, SCRIPTS.stop);
    const stopContent = generateStopScript(projectName, services);
    fs.writeFileSync(stopScriptPath, stopContent);
    fs.chmodSync(stopScriptPath, '755');
    logger.debug(`Script créé: ${stopScriptPath}`);

    // Générer restart.sh
    const restartScriptPath = path.join(scriptsPath, 'restart.sh');
    const restartContent = generateRestartScript(projectName, services);
    fs.writeFileSync(restartScriptPath, restartContent);
    fs.chmodSync(restartScriptPath, '755');
    logger.debug(`Script créé: ${restartScriptPath}`);

    // Générer status.sh
    const statusScriptPath = path.join(scriptsPath, 'status.sh');
    const statusContent = generateStatusScript(projectName, services);
    fs.writeFileSync(statusScriptPath, statusContent);
    fs.chmodSync(statusScriptPath, '755');
    logger.debug(`Script créé: ${statusScriptPath}`);

    // Générer deploy.sh
    const deployScriptPath = path.join(scriptsPath, 'deploy.sh');
    const deployContent = generateDeployScript(projectName, services);
    fs.writeFileSync(deployScriptPath, deployContent);
    fs.chmodSync(deployScriptPath, '755');
    logger.debug(`Script créé: ${deployScriptPath}`);

    logger.success(`Scripts générés pour ${projectName}`);
}

/**
 * Régénère les scripts pour tous les projets
 * @returns {void}
 */
export function regenerateAllScripts() {
    const allProjects = projects.loadProjects();

    for (const project of allProjects) {
        try {
            generateScripts(project.name);
        } catch (error) {
            logger.error(`Erreur pour ${project.name}: ${error.message}`);
        }
    }

    logger.success('Scripts régénérés pour tous les projets');
}

/**
 * Affiche le chemin des scripts d'un projet
 * @param {string} projectName - Nom du projet
 * @returns {object}
 */
export function getScriptsPaths(projectName) {
    const scriptsPath = path.join(BASE_PATH, projectName, PROJECT_STRUCTURE.scripts);

    return {
        directory: scriptsPath,
        start: path.join(scriptsPath, SCRIPTS.start),
        stop: path.join(scriptsPath, SCRIPTS.stop),
        restart: path.join(scriptsPath, 'restart.sh'),
        status: path.join(scriptsPath, 'status.sh'),
        deploy: path.join(scriptsPath, 'deploy.sh')
    };
}

export default {
    generateScripts,
    regenerateAllScripts,
    getScriptsPaths
};
