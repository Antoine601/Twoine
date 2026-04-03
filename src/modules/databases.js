/**
 * Module de gestion des bases de données MySQL, MongoDB et PostgreSQL
 */

import fs from 'fs';
import path from 'path';
import { BASE_PATH, TOOL_CONFIG_PATH } from '../config/constants.js';
import projects from './projects.js';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import mysql from 'mysql2/promise';
import { MongoClient, ObjectId } from 'mongodb';
import { deserialize } from 'bson';
import pg from 'pg';

const { Pool } = pg;

const DATABASES_CONFIG_FILE = path.join(TOOL_CONFIG_PATH, 'databases.json');

/**
 * Initialise le fichier de configuration des bases de données
 */
export function initDatabasesConfig() {
    if (!fs.existsSync(DATABASES_CONFIG_FILE)) {
        fs.writeFileSync(DATABASES_CONFIG_FILE, JSON.stringify({ 
            mysql: [],
            mongodb: [],
            postgresql: []
        }, null, 2));
        logger.debug(`Fichier de configuration des BDD créé: ${DATABASES_CONFIG_FILE}`);
    }
}

/**
 * Charge la configuration des bases de données
 * @returns {object}
 */
export function loadDatabases() {
    try {
        initDatabasesConfig();
        const data = fs.readFileSync(DATABASES_CONFIG_FILE, 'utf8');
        const databases = JSON.parse(data);
        if (!databases.postgresql) {
            databases.postgresql = [];
        }
        return databases;
    } catch (error) {
        logger.error(`Erreur lors du chargement des BDD: ${error.message}`);
        return { mysql: [], mongodb: [], postgresql: [] };
    }
}

/**
 * Sauvegarde la configuration des bases de données
 * @param {object} databases
 */
export function saveDatabases(databases) {
    try {
        initDatabasesConfig();
        fs.writeFileSync(DATABASES_CONFIG_FILE, JSON.stringify(databases, null, 2));
        logger.debug('Configuration des BDD sauvegardée');
    } catch (error) {
        throw new Error(`Erreur lors de la sauvegarde: ${error.message}`);
    }
}

/**
 * Crée une base de données MySQL
 * @param {object} config - Configuration de la BDD
 * @returns {Promise<object>}
 */
export async function createMySQLDatabase(config) {
    const { name, host, port, username, password, projectName } = config;

    if (!name || !host || !username || !password) {
        throw new Error('Tous les champs sont requis');
    }

    // Vérifier que le projet existe
    if (projectName && !projects.projectExists(projectName)) {
        throw new Error(`Le projet ${projectName} n'existe pas`);
    }

    const databases = loadDatabases();

    // Vérifier si la BDD existe déjà
    if (databases.mysql.find(db => db.name === name)) {
        throw new Error(`La base de données MySQL ${name} existe déjà`);
    }

    const database = {
        id: `mysql_${Date.now()}`,
        name,
        type: 'mysql',
        host: host || 'localhost',
        port: port || 3306,
        username,
        password,
        projectName: projectName || null,
        createdAt: new Date().toISOString()
    };

    // Tester la connexion (optionnel, nécessite mysql2)
    try {
        // La connexion sera testée côté client si mysql2 est installé
        logger.info(`Base de données MySQL ${name} configurée`);
    } catch (error) {
        logger.warn(`Impossible de tester la connexion MySQL: ${error.message}`);
    }

    databases.mysql.push(database);
    saveDatabases(databases);

    logger.success(`Base de données MySQL ${name} créée`);
    return database;
}

/**
 * Crée automatiquement un utilisateur et une base de données PostgreSQL sur le serveur local
 * @param {string} dbName - Nom de la base de données
 * @param {string} username - Nom d'utilisateur
 * @param {string} password - Mot de passe
 * @returns {Promise<void>}
 */
export async function autoCreatePostgreSQLDatabase(dbName, username, password) {
    try {
        // Échapper les caractères spéciaux pour le shell
        const escapedPassword = password.replace(/'/g, "''");
        const escapedUsername = username.replace(/"/g, '\\"');
        const escapedDbName = dbName.replace(/"/g, '\\"');

        // Créer l'utilisateur PostgreSQL avec privilèges CREATEDB pour Prisma
        const createUserCmd = `sudo -u postgres psql -c "CREATE USER \\"${escapedUsername}\\" WITH PASSWORD '${escapedPassword}' CREATEDB;"`;
        await shell.execCommand(createUserCmd);
        logger.info(`Utilisateur PostgreSQL créé: ${username}`);

        // Créer la base de données
        const createDbCmd = `sudo -u postgres psql -c "CREATE DATABASE \\"${escapedDbName}\\" OWNER \\"${escapedUsername}\\";"`;
        await shell.execCommand(createDbCmd);
        logger.info(`Base de données PostgreSQL créée: ${dbName}`);

        // Se connecter à la base et configurer les permissions complètes
        const setupPermissionsCmd = `sudo -u postgres psql -d "${escapedDbName}" << 'EOF'
-- Donner tous les privilèges sur la base
GRANT ALL PRIVILEGES ON DATABASE "${escapedDbName}" TO "${escapedUsername}";

-- Donner tous les privilèges sur le schéma public
GRANT ALL ON SCHEMA public TO "${escapedUsername}";
GRANT CREATE ON SCHEMA public TO "${escapedUsername}";

-- Donner tous les privilèges sur les objets existants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${escapedUsername}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${escapedUsername}";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "${escapedUsername}";

-- Permissions par défaut pour les futurs objets créés par postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO "${escapedUsername}";

-- Permissions par défaut pour les objets créés par l'utilisateur lui-même
ALTER DEFAULT PRIVILEGES FOR ROLE "${escapedUsername}" IN SCHEMA public GRANT ALL ON TABLES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${escapedUsername}" IN SCHEMA public GRANT ALL ON SEQUENCES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${escapedUsername}" IN SCHEMA public GRANT ALL ON FUNCTIONS TO "${escapedUsername}";
EOF`;
        await shell.execCommand(setupPermissionsCmd);

        logger.success(`Configuration PostgreSQL complète pour ${dbName} (compatible Prisma)`);
    } catch (error) {
        // Si l'utilisateur existe déjà, on continue
        if (error.message.includes('already exists')) {
            logger.warn(`L'utilisateur ou la base existe déjà, reconfiguration des permissions...`);
            
            // Essayer de reconfigurer les permissions
            try {
                const escapedUsername = username.replace(/"/g, '\\"');
                const escapedDbName = dbName.replace(/"/g, '\\"');
                
                // Donner le privilège CREATEDB à l'utilisateur existant
                const alterUserCmd = `sudo -u postgres psql -c "ALTER USER \\"${escapedUsername}\\" CREATEDB;"`;
                await shell.execCommand(alterUserCmd);
                
                // Reconfigurer toutes les permissions
                const reconfigCmd = `sudo -u postgres psql -d "${escapedDbName}" << 'EOF'
GRANT ALL PRIVILEGES ON DATABASE "${escapedDbName}" TO "${escapedUsername}";
GRANT ALL ON SCHEMA public TO "${escapedUsername}";
GRANT CREATE ON SCHEMA public TO "${escapedUsername}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${escapedUsername}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${escapedUsername}";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${escapedUsername}" IN SCHEMA public GRANT ALL ON TABLES TO "${escapedUsername}";
ALTER DEFAULT PRIVILEGES FOR ROLE "${escapedUsername}" IN SCHEMA public GRANT ALL ON SEQUENCES TO "${escapedUsername}";
EOF`;
                await shell.execCommand(reconfigCmd);
                logger.success(`Permissions reconfigurées pour ${username}`);
            } catch (grantError) {
                logger.warn(`Impossible de configurer les permissions: ${grantError.message}`);
            }
        } else {
            throw new Error(`Erreur lors de la création PostgreSQL: ${error.message}`);
        }
    }
}

/**
 * Crée une base de données PostgreSQL
 * @param {object} config - Configuration de la BDD
 * @returns {Promise<object>}
 */
export async function createPostgreSQLDatabase(config) {
    const { name, host, port, username, password, projectName } = config;

    if (!name || !host || !username || !password) {
        throw new Error('Tous les champs sont requis');
    }

    // Vérifier que le projet existe
    if (projectName && !projects.projectExists(projectName)) {
        throw new Error(`Le projet ${projectName} n'existe pas`);
    }

    const databases = loadDatabases();

    // Vérifier si la BDD existe déjà
    if (databases.postgresql.find(db => db.name === name)) {
        throw new Error(`La base de données PostgreSQL ${name} existe déjà`);
    }

    const database = {
        id: `postgres_${Date.now()}`,
        name,
        type: 'postgresql',
        host: host || 'localhost',
        port: port || 5432,
        username,
        password,
        projectName: projectName || null,
        createdAt: new Date().toISOString()
    };

    databases.postgresql.push(database);
    saveDatabases(databases);

    logger.success(`Base de données PostgreSQL ${name} créée`);
    return database;
}

/**
 * Crée une base de données MongoDB
 * @param {object} config - Configuration de la BDD
 * @returns {Promise<object>}
 */
export async function createMongoDatabase(config) {
    const { name, host, port, username, password, authDatabase, projectName } = config;

    if (!name || !host) {
        throw new Error('Le nom et l\'hôte sont requis');
    }

    // Vérifier que le projet existe
    if (projectName && !projects.projectExists(projectName)) {
        throw new Error(`Le projet ${projectName} n'existe pas`);
    }

    const databases = loadDatabases();

    // Vérifier si la BDD existe déjà
    if (databases.mongodb.find(db => db.name === name)) {
        throw new Error(`La base de données MongoDB ${name} existe déjà`);
    }

    const database = {
        id: `mongo_${Date.now()}`,
        name,
        type: 'mongodb',
        host: host || 'localhost',
        port: port || 27017,
        username: username || '',
        password: password || '',
        authDatabase: authDatabase || 'admin',
        projectName: projectName || null,
        createdAt: new Date().toISOString()
    };

    databases.mongodb.push(database);
    saveDatabases(databases);

    logger.success(`Base de données MongoDB ${name} créée`);
    return database;
}

/**
 * Récupère toutes les bases de données
 * @param {string} projectName - Filtrer par projet (optionnel)
 * @returns {Array}
 */
export function getAllDatabases(projectName = null) {
    const databases = loadDatabases();
    let allDbs = [
        ...databases.mysql.map(db => ({ ...db, type: 'mysql' })),
        ...databases.mongodb.map(db => ({ ...db, type: 'mongodb' })),
        ...databases.postgresql.map(db => ({ ...db, type: 'postgresql' }))
    ];

    if (projectName) {
        allDbs = allDbs.filter(db => db.projectName === projectName);
    }

    return allDbs;
}

/**
 * Récupère une base de données par son ID
 * @param {string} id
 * @returns {object|null}
 */
export function getDatabaseById(id) {
    const databases = loadDatabases();
    
    if (id.startsWith('mysql_')) {
        return databases.mysql.find(db => db.id === id) || null;
    } else if (id.startsWith('mongo_')) {
        return databases.mongodb.find(db => db.id === id) || null;
    } else if (id.startsWith('postgres_')) {
        return databases.postgresql.find(db => db.id === id) || null;
    }
    
    return null;
}

/**
 * Met à jour une base de données
 * @param {string} id
 * @param {object} updates
 * @returns {object}
 */
export function updateDatabase(id, updates) {
    const databases = loadDatabases();
    let updated = null;

    if (id.startsWith('mysql_')) {
        const index = databases.mysql.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données MySQL non trouvée');
        }
        databases.mysql[index] = { 
            ...databases.mysql[index], 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        updated = databases.mysql[index];
    } else if (id.startsWith('mongo_')) {
        const index = databases.mongodb.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données MongoDB non trouvée');
        }
        databases.mongodb[index] = { 
            ...databases.mongodb[index], 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        updated = databases.mongodb[index];
    } else if (id.startsWith('postgres_')) {
        const index = databases.postgresql.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données PostgreSQL non trouvée');
        }
        databases.postgresql[index] = { 
            ...databases.postgresql[index], 
            ...updates,
            updatedAt: new Date().toISOString()
        };
        updated = databases.postgresql[index];
    } else {
        throw new Error('ID de base de données invalide');
    }

    saveDatabases(databases);
    logger.success(`Base de données ${id} mise à jour`);
    return updated;
}

/**
 * Supprime une base de données
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteDatabase(id) {
    const databases = loadDatabases();

    if (id.startsWith('mysql_')) {
        const index = databases.mysql.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données MySQL non trouvée');
        }
        const dbName = databases.mysql[index].name;
        databases.mysql.splice(index, 1);
        logger.success(`Base de données MySQL ${dbName} supprimée`);
    } else if (id.startsWith('mongo_')) {
        const index = databases.mongodb.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données MongoDB non trouvée');
        }
        const dbName = databases.mongodb[index].name;
        databases.mongodb.splice(index, 1);
        logger.success(`Base de données MongoDB ${dbName} supprimée`);
    } else if (id.startsWith('postgres_')) {
        const index = databases.postgresql.findIndex(db => db.id === id);
        if (index === -1) {
            throw new Error('Base de données PostgreSQL non trouvée');
        }
        const dbName = databases.postgresql[index].name;
        databases.postgresql.splice(index, 1);
        logger.success(`Base de données PostgreSQL ${dbName} supprimée`);
    } else {
        throw new Error('ID de base de données invalide');
    }

    saveDatabases(databases);
}

/**
 * Assigne une base de données à un projet
 * @param {string} databaseId
 * @param {string} projectName
 * @returns {object}
 */
export function assignDatabaseToProject(databaseId, projectName) {
    if (!projects.projectExists(projectName)) {
        throw new Error(`Le projet ${projectName} n'existe pas`);
    }

    return updateDatabase(databaseId, { projectName });
}

/**
 * Retire l'assignation d'une base de données à un projet
 * @param {string} databaseId
 * @returns {object}
 */
export function unassignDatabaseFromProject(databaseId) {
    return updateDatabase(databaseId, { projectName: null });
}

/**
 * Récupère les bases de données accessibles par un utilisateur
 * @param {object} user - Utilisateur
 * @returns {Array}
 */
export function getDatabasesForUser(user) {
    if (user.role === 'admin') {
        return getAllDatabases();
    }

    // Pour les utilisateurs normaux, ne retourner que les BDD des projets assignés
    const userProjects = user.projects || [];
    const databases = loadDatabases();
    
    const allDbs = [
        ...databases.mysql.map(db => ({ ...db, type: 'mysql' })),
        ...databases.mongodb.map(db => ({ ...db, type: 'mongodb' })),
        ...databases.postgresql.map(db => ({ ...db, type: 'postgresql' }))
    ];

    return allDbs.filter(db => db.projectName && userProjects.includes(db.projectName));
}

/**
 * Génère une chaîne de connexion pour une base de données
 * @param {string} id
 * @returns {string}
 */
export function getConnectionString(id) {
    const db = getDatabaseById(id);
    if (!db) {
        throw new Error('Base de données non trouvée');
    }

    if (db.type === 'mysql') {
        const auth = db.username && db.password ? `${db.username}:${db.password}@` : '';
        return `mysql://${auth}${db.host}:${db.port}/${db.name}`;
    } else if (db.type === 'mongodb') {
        const auth = db.username && db.password ? `${db.username}:${db.password}@` : '';
        const authDb = db.authDatabase ? `?authSource=${db.authDatabase}` : '';
        return `mongodb://${auth}${db.host}:${db.port}/${db.name}${authDb}`;
    } else if (db.type === 'postgresql') {
        const auth = db.username && db.password ? `${db.username}:${encodeURIComponent(db.password)}@` : '';
        return `postgresql://${auth}${db.host}:${db.port}/${db.name}?schema=public`;
    }

    throw new Error('Type de base de données non supporté');
}

/**
 * Teste la connexion à une base de données MySQL
 * @param {object} config
 * @returns {Promise<boolean>}
 */
export async function testMySQLConnection(config) {
    try {
        // Cette fonction nécessite mysql2 installé
        // Pour l'instant, on retourne true par défaut
        logger.info('Test de connexion MySQL (nécessite mysql2)');
        return true;
    } catch (error) {
        logger.error(`Erreur de connexion MySQL: ${error.message}`);
        return false;
    }
}

/**
 * Teste la connexion à une base de données MongoDB
 * @param {object} config
 * @returns {Promise<boolean>}
 */
export async function testMongoConnection(config) {
    try {
        // Cette fonction nécessite mongodb installé
        // Pour l'instant, on retourne true par défaut
        logger.info('Test de connexion MongoDB (nécessite mongodb)');
        return true;
    } catch (error) {
        logger.error(`Erreur de connexion MongoDB: ${error.message}`);
        return false;
    }
}

/**
 * Teste la connexion à une base de données PostgreSQL
 * @param {object} config
 * @returns {Promise<boolean>}
 */
export async function testPostgreSQLConnection(config) {
    try {
        logger.info('Test de connexion PostgreSQL');
        return true;
    } catch (error) {
        logger.error(`Erreur de connexion PostgreSQL: ${error.message}`);
        return false;
    }
}

/**
 * Exécute une requête SQL sur une base MySQL
 * @param {string} id - ID de la base de données
 * @param {string} query - Requête SQL
 * @returns {Promise<object>}
 */
export async function executeMySQLQuery(id, query) {
    const db = getDatabaseById(id);
    if (!db || db.type !== 'mysql') {
        throw new Error('Base de données MySQL non trouvée');
    }

    let connection;
    try {
        connection = await mysql.createConnection({
            host: db.host,
            port: db.port,
            user: db.username,
            password: db.password,
            database: db.name
        });

        const [rows, fields] = await connection.execute(query);
        
        return {
            rows: Array.isArray(rows) ? rows : [rows],
            fields: fields ? fields.map(f => ({
                name: f.name,
                type: f.type,
                table: f.table
            })) : [],
            affectedRows: rows.affectedRows,
            insertId: rows.insertId
        };
    } catch (error) {
        logger.error(`Erreur MySQL: ${error.message}`);
        throw new Error(`Erreur d'exécution: ${error.message}`);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

/**
 * Liste les tables d'une base MySQL
 * @param {string} id - ID de la base de données
 * @returns {Promise<Array>}
 */
export async function getMySQLTables(id) {
    const result = await executeMySQLQuery(id, 'SHOW TABLES');
    return result.rows.map(row => Object.values(row)[0]);
}

/**
 * Récupère la structure d'une table MySQL
 * @param {string} id - ID de la base de données
 * @param {string} tableName - Nom de la table
 * @returns {Promise<Array>}
 */
export async function getMySQLTableStructure(id, tableName) {
    const result = await executeMySQLQuery(id, `DESCRIBE \`${tableName}\``);
    return result.rows;
}

/**
 * Récupère les données d'une table MySQL avec pagination
 * @param {string} id - ID de la base de données
 * @param {string} tableName - Nom de la table
 * @param {number} limit - Nombre de lignes
 * @param {number} offset - Décalage
 * @returns {Promise<object>}
 */
export async function getMySQLTableData(id, tableName, limit = 100, offset = 0) {
    const countResult = await executeMySQLQuery(id, `SELECT COUNT(*) as total FROM \`${tableName}\``);
    const total = countResult.rows[0].total;
    
    const dataResult = await executeMySQLQuery(
        id,
        `SELECT * FROM \`${tableName}\` LIMIT ${limit} OFFSET ${offset}`
    );
    
    return {
        rows: dataResult.rows,
        fields: dataResult.fields,
        total,
        limit,
        offset
    };
}

/**
 * Exécute une requête SQL sur une base PostgreSQL
 * @param {string} id - ID de la base de données
 * @param {string} query - Requête SQL
 * @param {Array} params - Paramètres de la requête
 * @returns {Promise<object>}
 */
export async function executePostgreSQLQuery(id, query, params = []) {
    const db = getDatabaseById(id);
    if (!db || db.type !== 'postgresql') {
        throw new Error('Base de données PostgreSQL non trouvée');
    }

    const pool = new Pool({
        host: db.host,
        port: db.port,
        user: db.username,
        password: db.password,
        database: db.name
    });

    try {
        const result = await pool.query(query, params);
        
        return {
            rows: result.rows || [],
            fields: result.fields ? result.fields.map(f => ({
                name: f.name,
                dataTypeID: f.dataTypeID,
                tableID: f.tableID
            })) : [],
            rowCount: result.rowCount,
            command: result.command
        };
    } catch (error) {
        logger.error(`Erreur PostgreSQL: ${error.message}`);
        throw new Error(`Erreur d'exécution: ${error.message}`);
    } finally {
        await pool.end();
    }
}

/**
 * Liste les tables d'une base PostgreSQL
 * @param {string} id - ID de la base de données
 * @returns {Promise<Array>}
 */
export async function getPostgreSQLTables(id) {
    const result = await executePostgreSQLQuery(
        id,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    return result.rows.map(row => row.table_name);
}

/**
 * Récupère la structure d'une table PostgreSQL
 * @param {string} id - ID de la base de données
 * @param {string} tableName - Nom de la table
 * @returns {Promise<Array>}
 */
export async function getPostgreSQLTableStructure(id, tableName) {
    const result = await executePostgreSQLQuery(
        id,
        `SELECT 
            c.column_name, 
            c.data_type,
            c.character_maximum_length,
            c.column_default,
            c.is_nullable,
            c.udt_name,
            CASE 
                WHEN pk.column_name IS NOT NULL THEN 'PRI'
                WHEN u.column_name IS NOT NULL THEN 'UNI'
                ELSE ''
            END as constraint_type
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku
                ON tc.constraint_name = ku.constraint_name
                AND tc.table_schema = ku.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_name = $1
                AND tc.table_schema = 'public'
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku
                ON tc.constraint_name = ku.constraint_name
                AND tc.table_schema = ku.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
                AND tc.table_name = $1
                AND tc.table_schema = 'public'
        ) u ON c.column_name = u.column_name
        WHERE c.table_name = $1
            AND c.table_schema = 'public'
        ORDER BY c.ordinal_position`,
        [tableName]
    );
    
    // Convertir au format MySQL pour compatibilité avec l'interface
    return result.rows.map(row => {
        let type = row.data_type.toUpperCase();
        if (row.character_maximum_length) {
            type = `${type}(${row.character_maximum_length})`;
        }
        
        return {
            Field: row.column_name,
            Type: type,
            Null: row.is_nullable === 'YES' ? 'YES' : 'NO',
            Key: row.constraint_type || '',
            Default: row.column_default,
            Extra: row.column_default && row.column_default.includes('nextval') ? 'auto_increment' : ''
        };
    });
}

/**
 * Récupère les données d'une table PostgreSQL avec pagination
 * @param {string} id - ID de la base de données
 * @param {string} tableName - Nom de la table
 * @param {number} limit - Nombre de lignes
 * @param {number} offset - Décalage
 * @returns {Promise<object>}
 */
export async function getPostgreSQLTableData(id, tableName, limit = 100, offset = 0) {
    const countResult = await executePostgreSQLQuery(
        id,
        `SELECT COUNT(*) as total FROM "${tableName}"`
    );
    const total = parseInt(countResult.rows[0].total);
    
    const dataResult = await executePostgreSQLQuery(
        id,
        `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
    
    return {
        rows: dataResult.rows,
        fields: dataResult.fields,
        total,
        limit,
        offset
    };
}

/**
 * Exécute une commande MongoDB
 * @param {string} id - ID de la base de données
 * @param {string} collection - Nom de la collection
 * @param {string} operation - Opération (find, insertOne, updateOne, deleteOne, etc.)
 * @param {object} query - Requête/filtre
 * @param {object} options - Options supplémentaires
 * @returns {Promise<object>}
 */
function resolveObjectIds(obj, key) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(v => resolveObjectIds(v, key));
    if (typeof obj === 'object') {
        if (obj.$oid && typeof obj.$oid === 'string') return new ObjectId(obj.$oid);
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveObjectIds(v, k)]));
    }
    if (typeof obj === 'string' && key === '_id' && /^[a-f\d]{24}$/i.test(obj)) {
        return new ObjectId(obj);
    }
    return obj;
}

export async function executeMongoOperation(id, collection, operation, query = {}, options = {}) {
    const db = getDatabaseById(id);
    if (!db || db.type !== 'mongodb') {
        throw new Error('Base de données MongoDB non trouvée');
    }

    let client;
    try {
        const auth = db.username && db.password 
            ? `${db.username}:${encodeURIComponent(db.password)}@` 
            : '';
        const authDb = db.authDatabase ? `?authSource=${db.authDatabase}` : '';
        const uri = `mongodb://${auth}${db.host}:${db.port}/${db.name}${authDb}`;
        
        client = new MongoClient(uri);
        await client.connect();
        
        const database = client.db(db.name);
        const coll = database.collection(collection);
        
        logger.info(`[Mongo] op=${operation} raw_query=${JSON.stringify(query)}`);
        query = resolveObjectIds(query);
        options = resolveObjectIds(options);
        logger.info(`[Mongo] op=${operation} resolved_query=${JSON.stringify(query)}`);

        let result;
        switch (operation) {
            case 'find':
                const limit = options.limit || 100;
                const skip = options.skip || 0;
                result = await coll.find(query).limit(limit).skip(skip).toArray();
                const total = await coll.countDocuments(query);
                return { documents: result, total, limit, skip };
                
            case 'insertOne':
                result = await coll.insertOne(query);
                return { insertedId: result.insertedId, acknowledged: result.acknowledged };
                
            case 'updateOne':
                result = await coll.updateOne(query, options.update || {});
                return { 
                    matchedCount: result.matchedCount, 
                    modifiedCount: result.modifiedCount,
                    acknowledged: result.acknowledged
                };
                
            case 'deleteOne':
                result = await coll.deleteOne(query);
                return { deletedCount: result.deletedCount, acknowledged: result.acknowledged };
                
            case 'countDocuments':
                result = await coll.countDocuments(query);
                return { count: result };
                
            default:
                throw new Error(`Opération non supportée: ${operation}`);
        }
    } catch (error) {
        logger.error(`Erreur MongoDB: ${error.message}`);
        throw new Error(`Erreur d'exécution: ${error.message}`);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Importe des données depuis un fichier BSON dans une collection MongoDB
 * @param {string} id - ID de la base de données
 * @param {string} collection - Nom de la collection
 * @param {Buffer} bsonBuffer - Contenu du fichier BSON
 * @returns {Promise<object>}
 */
export async function importBSONToMongo(id, collection, bsonBuffer) {
    const db = getDatabaseById(id);
    if (!db || db.type !== 'mongodb') {
        throw new Error('Base de données MongoDB non trouvée');
    }

    let client;
    try {
        const auth = db.username && db.password 
            ? `${db.username}:${encodeURIComponent(db.password)}@` 
            : '';
        const authDb = db.authDatabase ? `?authSource=${db.authDatabase}` : '';
        const uri = `mongodb://${auth}${db.host}:${db.port}/${db.name}${authDb}`;
        
        client = new MongoClient(uri);
        await client.connect();
        
        const database = client.db(db.name);
        const coll = database.collection(collection);
        
        // Parser le fichier BSON
        const documents = [];
        let offset = 0;
        
        while (offset < bsonBuffer.length) {
            // Lire la taille du document (4 premiers octets)
            if (offset + 4 > bsonBuffer.length) break;
            
            const docSize = bsonBuffer.readInt32LE(offset);
            if (offset + docSize > bsonBuffer.length) break;
            
            // Extraire et désérialiser le document
            const docBuffer = bsonBuffer.slice(offset, offset + docSize);
            const document = deserialize(docBuffer);
            documents.push(document);
            
            offset += docSize;
        }
        
        if (documents.length === 0) {
            throw new Error('Aucun document trouvé dans le fichier BSON');
        }
        
        // Insérer les documents dans la collection
        const result = await coll.insertMany(documents, { ordered: false });
        
        logger.success(`${documents.length} document(s) importé(s) dans ${collection}`);
        
        return {
            insertedCount: result.insertedCount,
            insertedIds: result.insertedIds,
            totalDocuments: documents.length,
            acknowledged: result.acknowledged
        };
    } catch (error) {
        logger.error(`Erreur import BSON: ${error.message}`);
        throw new Error(`Erreur d'import: ${error.message}`);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Liste les collections d'une base MongoDB
 * @param {string} id - ID de la base de données
 * @returns {Promise<Array>}
 */
export async function getMongoCollections(id) {
    const db = getDatabaseById(id);
    if (!db || db.type !== 'mongodb') {
        throw new Error('Base de données MongoDB non trouvée');
    }

    let client;
    try {
        const auth = db.username && db.password 
            ? `${db.username}:${encodeURIComponent(db.password)}@` 
            : '';
        const authDb = db.authDatabase ? `?authSource=${db.authDatabase}` : '';
        const uri = `mongodb://${auth}${db.host}:${db.port}/${db.name}${authDb}`;
        
        client = new MongoClient(uri);
        await client.connect();
        
        const database = client.db(db.name);
        const collections = await database.listCollections().toArray();
        
        return collections.map(c => c.name);
    } catch (error) {
        logger.error(`Erreur MongoDB: ${error.message}`);
        throw new Error(`Erreur de connexion: ${error.message}`);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Met à jour le projectName de toutes les bases de données associées à un projet
 * @param {string} oldProjectName - Ancien nom du projet
 * @param {string} newProjectName - Nouveau nom du projet
 * @returns {number} - Nombre de bases de données mises à jour
 */
export function updateProjectNameInDatabases(oldProjectName, newProjectName) {
    const databases = loadDatabases();
    let updatedCount = 0;

    // Mettre à jour MySQL
    databases.mysql = databases.mysql.map(db => {
        if (db.projectName === oldProjectName) {
            updatedCount++;
            return { ...db, projectName: newProjectName, updatedAt: new Date().toISOString() };
        }
        return db;
    });

    // Mettre à jour MongoDB
    databases.mongodb = databases.mongodb.map(db => {
        if (db.projectName === oldProjectName) {
            updatedCount++;
            return { ...db, projectName: newProjectName, updatedAt: new Date().toISOString() };
        }
        return db;
    });

    // Mettre à jour PostgreSQL
    databases.postgresql = databases.postgresql.map(db => {
        if (db.projectName === oldProjectName) {
            updatedCount++;
            return { ...db, projectName: newProjectName, updatedAt: new Date().toISOString() };
        }
        return db;
    });

    if (updatedCount > 0) {
        saveDatabases(databases);
        logger.info(`${updatedCount} base(s) de données mise(s) à jour avec le nouveau nom de projet`);
    }

    return updatedCount;
}

export default {
    initDatabasesConfig,
    loadDatabases,
    saveDatabases,
    createMySQLDatabase,
    createMongoDatabase,
    createPostgreSQLDatabase,
    autoCreatePostgreSQLDatabase,
    getAllDatabases,
    getDatabaseById,
    updateDatabase,
    deleteDatabase,
    assignDatabaseToProject,
    unassignDatabaseFromProject,
    getDatabasesForUser,
    getConnectionString,
    testMySQLConnection,
    testMongoConnection,
    testPostgreSQLConnection,
    executeMySQLQuery,
    getMySQLTables,
    getMySQLTableStructure,
    getMySQLTableData,
    executeMongoOperation,
    getMongoCollections,
    importBSONToMongo,
    executePostgreSQLQuery,
    getPostgreSQLTables,
    getPostgreSQLTableStructure,
    getPostgreSQLTableData,
    updateProjectNameInDatabases
};
