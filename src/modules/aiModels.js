/**
 * Module de gestion des modèles IA Ollama
 */

import shell from '../utils/shell.js';
import logger from '../utils/logger.js';
import https from 'https';

/**
 * Liste tous les modèles Ollama installés
 * @returns {Promise<Array>}
 */
export async function listInstalledModels() {
    try {
        const { stdout } = await shell.execCommand('ollama list');
        const lines = stdout.trim().split('\n');
        
        if (lines.length <= 1) {
            return [];
        }

        const models = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                models.push({
                    name: parts[0],
                    id: parts[1],
                    size: parts[2],
                    modified: parts.slice(3).join(' ')
                });
            }
        }

        return models;
    } catch (error) {
        logger.error(`Erreur lors de la liste des modèles: ${error.message}`);
        throw new Error('Impossible de lister les modèles Ollama');
    }
}

/**
 * Installe un modèle Ollama
 * @param {string} modelName - Nom du modèle à installer
 * @returns {Promise<object>}
 */
export async function installModel(modelName) {
    try {
        if (!modelName || typeof modelName !== 'string') {
            throw new Error('Nom du modèle invalide');
        }

        logger.info(`Installation du modèle ${modelName}...`);
        const { stdout, stderr } = await shell.execCommand(`ollama pull ${modelName}`);
        
        logger.info(`Modèle ${modelName} installé avec succès`);
        return {
            success: true,
            message: `Modèle ${modelName} installé`,
            output: stdout || stderr
        };
    } catch (error) {
        logger.error(`Erreur lors de l'installation du modèle ${modelName}: ${error.message}`);
        throw new Error(`Impossible d'installer le modèle: ${error.message}`);
    }
}

/**
 * Supprime un modèle Ollama
 * @param {string} modelName - Nom du modèle à supprimer
 * @returns {Promise<object>}
 */
export async function deleteModel(modelName) {
    try {
        if (!modelName || typeof modelName !== 'string') {
            throw new Error('Nom du modèle invalide');
        }

        logger.info(`Suppression du modèle ${modelName}...`);
        const { stdout, stderr } = await shell.execCommand(`ollama rm ${modelName}`);
        
        logger.info(`Modèle ${modelName} supprimé avec succès`);
        return {
            success: true,
            message: `Modèle ${modelName} supprimé`,
            output: stdout || stderr
        };
    } catch (error) {
        logger.error(`Erreur lors de la suppression du modèle ${modelName}: ${error.message}`);
        throw new Error(`Impossible de supprimer le modèle: ${error.message}`);
    }
}

/**
 * Récupère les détails d'un modèle
 * @param {string} modelName - Nom du modèle
 * @returns {Promise<object>}
 */
export async function getModelDetails(modelName) {
    try {
        const { stdout } = await shell.execCommand(`ollama show ${modelName}`);
        return {
            name: modelName,
            details: stdout
        };
    } catch (error) {
        logger.error(`Erreur lors de la récupération des détails du modèle ${modelName}: ${error.message}`);
        throw new Error(`Impossible de récupérer les détails du modèle: ${error.message}`);
    }
}

/**
 * Scrape la liste des modèles disponibles sur ollama.com/library
 * @returns {Promise<Array>}
 */
export async function getAvailableModels() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'ollama.com',
            path: '/library',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        https.get(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const models = parseOllamaLibrary(data);
                    resolve(models);
                } catch (error) {
                    logger.error(`Erreur lors du parsing de la bibliothèque Ollama: ${error.message}`);
                    resolve(getDefaultModelsList());
                }
            });
        }).on('error', (error) => {
            logger.error(`Erreur lors de la récupération de la bibliothèque Ollama: ${error.message}`);
            resolve(getDefaultModelsList());
        });
    });
}

/**
 * Parse le HTML de ollama.com/library pour extraire les modèles
 * @param {string} html
 * @returns {Array}
 */
function parseOllamaLibrary(html) {
    const models = [];
    
    // Regex pour extraire les modèles depuis le HTML
    const modelRegex = /<a[^>]*href="\/library\/([^"]+)"[^>]*>.*?<h2[^>]*>([^<]+)<\/h2>.*?<p[^>]*>([^<]+)<\/p>/gs;
    
    let match;
    while ((match = modelRegex.exec(html)) !== null) {
        models.push({
            name: match[1],
            title: match[2].trim(),
            description: match[3].trim()
        });
    }

    // Si aucun modèle trouvé, retourner la liste par défaut
    if (models.length === 0) {
        return getDefaultModelsList();
    }

    return models;
}

/**
 * Liste par défaut des modèles populaires
 * @returns {Array}
 */
function getDefaultModelsList() {
    return [
        { name: 'llama3.2', title: 'Llama 3.2', description: 'Meta\'s latest Llama model' },
        { name: 'llama3.2:1b', title: 'Llama 3.2 1B', description: 'Lightweight 1B parameter model' },
        { name: 'llama3.2:3b', title: 'Llama 3.2 3B', description: 'Balanced 3B parameter model' },
        { name: 'llama3.1', title: 'Llama 3.1', description: 'Meta\'s Llama 3.1 model' },
        { name: 'mistral', title: 'Mistral', description: 'Mistral AI\'s flagship model' },
        { name: 'mixtral', title: 'Mixtral', description: 'Mistral\'s mixture of experts model' },
        { name: 'qwen2.5', title: 'Qwen 2.5', description: 'Alibaba\'s Qwen 2.5 model' },
        { name: 'qwen2.5-coder', title: 'Qwen 2.5 Coder', description: 'Specialized coding model' },
        { name: 'codellama', title: 'Code Llama', description: 'Meta\'s code-specialized model' },
        { name: 'deepseek-coder', title: 'DeepSeek Coder', description: 'DeepSeek\'s coding model' },
        { name: 'phi3', title: 'Phi-3', description: 'Microsoft\'s small language model' },
        { name: 'gemma2', title: 'Gemma 2', description: 'Google\'s Gemma 2 model' },
        { name: 'neural-chat', title: 'Neural Chat', description: 'Intel\'s chat model' },
        { name: 'starling-lm', title: 'Starling', description: 'Berkeley\'s Starling model' },
        { name: 'orca-mini', title: 'Orca Mini', description: 'Compact Orca model' },
        { name: 'vicuna', title: 'Vicuna', description: 'LMSYS Vicuna model' },
        { name: 'nous-hermes2', title: 'Nous Hermes 2', description: 'Nous Research model' }
    ];
}

/**
 * Vérifie si Ollama est installé et en cours d'exécution
 * @returns {Promise<boolean>}
 */
export async function checkOllamaStatus() {
    try {
        await shell.execCommand('ollama --version');
        return true;
    } catch (error) {
        return false;
    }
}

export default {
    listInstalledModels,
    installModel,
    deleteModel,
    getModelDetails,
    getAvailableModels,
    checkOllamaStatus
};
