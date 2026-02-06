/**
 * TWOINE - Database Manager Service
 * Gestion complète des bases de données (MongoDB, MySQL/MariaDB, PostgreSQL)
 * Création, suppression, gestion des utilisateurs et droits
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const Database = require('../models/Database');
const Site = require('../models/Site');

const execAsync = promisify(exec);

// Configuration
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || '/opt/twoine/scripts';

/**
 * Classe principale de gestion des bases de données
 */
class DatabaseManager {
    constructor(options = {}) {
        this.scriptsDir = options.scriptsDir || SCRIPTS_DIR;
        this.dryRun = options.dryRun || false;
        
        // Configurations par défaut
        this.config = {
            mongodb: {
                host: process.env.MONGODB_HOST || 'localhost',
                port: parseInt(process.env.MONGODB_PORT || '27017', 10),
                adminDb: process.env.MONGODB_ADMIN_DB || 'admin',
                adminUser: process.env.MONGODB_ADMIN_USER || 'twoine_admin',
                adminPassword: process.env.MONGODB_ADMIN_PASSWORD,
            },
            mysql: {
                host: process.env.MYSQL_HOST || 'localhost',
                port: parseInt(process.env.MYSQL_PORT || '3306', 10),
                adminUser: process.env.MYSQL_ADMIN_USER || 'twoine_admin',
                adminPassword: process.env.MYSQL_ADMIN_PASSWORD,
            },
            postgresql: {
                host: process.env.POSTGRESQL_HOST || 'localhost',
                port: parseInt(process.env.POSTGRESQL_PORT || '5432', 10),
                adminUser: process.env.POSTGRESQL_ADMIN_USER || 'twoine_admin',
                adminPassword: process.env.POSTGRESQL_ADMIN_PASSWORD,
                adminDb: process.env.POSTGRESQL_ADMIN_DB || 'postgres',
            },
        };
    }

    // ============================================
    // CRÉATION DE BASE DE DONNÉES
    // ============================================

    /**
     * Crée une nouvelle base de données
     * @param {Object} data - Données de la base
     * @param {string} data.name - Nom de la base
     * @param {string} data.type - Type (mongodb, mysql, mariadb, postgresql)
     * @param {string} data.siteId - ID du site associé
     * @param {string} data.createdBy - ID de l'utilisateur créateur
     * @param {string} [data.displayName] - Nom d'affichage
     * @returns {Promise<Database>}
     */
    async createDatabase(data) {
        const { name, type, siteId, createdBy, displayName } = data;

        // Validation du type
        const validTypes = ['mongodb', 'mysql', 'mariadb', 'postgresql'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid database type: ${type}`);
        }

        // Vérifier que le site existe
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Vérifier unicité du nom
        const isAvailable = await Database.isNameAvailable(name, type);
        if (!isAvailable) {
            throw new Error(`Database name '${name}' already exists for type ${type}`);
        }

        // Générer les credentials
        const dbUsername = Database.generateDbUsername(site.name, name, type);
        const dbPassword = Database.generatePassword();

        // Créer le document Database
        const database = new Database({
            name,
            displayName: displayName || name,
            type: type === 'mariadb' ? 'mariadb' : type,
            site: siteId,
            createdBy,
            isExternal: false,
            connection: {
                host: this.config[type === 'mariadb' ? 'mysql' : type].host,
                port: this.config[type === 'mariadb' ? 'mysql' : type].port,
                databaseName: name,
            },
            dbUser: {
                username: dbUsername,
                privileges: this._getDefaultPrivileges(type),
                created: false,
            },
            status: 'creating',
        });

        // Chiffrer et stocker le mot de passe
        database.setPassword(dbPassword);
        await database.save();

        try {
            // Créer la base selon le type
            switch (type) {
                case 'mongodb':
                    await this._createMongoDatabase(database, dbPassword);
                    break;
                case 'mysql':
                case 'mariadb':
                    await this._createMySQLDatabase(database, dbPassword);
                    break;
                case 'postgresql':
                    await this._createPostgreSQLDatabase(database, dbPassword);
                    break;
            }

            // Marquer comme active
            database.status = 'active';
            database.dbUser.created = true;
            await database.save();

            // Retourner avec le mot de passe (une seule fois)
            const result = database.toObject();
            result.credentials = {
                username: dbUsername,
                password: dbPassword,
                connectionString: database.getConnectionString(true),
            };

            return result;

        } catch (error) {
            database.status = 'error';
            database.errorMessage = error.message;
            await database.save();
            throw error;
        }
    }

    /**
     * Lie une base de données existante à un site
     * @param {Object} data - Données de la base externe
     * @returns {Promise<Database>}
     */
    async linkExternalDatabase(data) {
        const { name, type, siteId, createdBy, displayName, host, port, databaseName, username, password } = data;

        // Vérifier que le site existe
        const site = await Site.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        // Créer le document Database
        const database = new Database({
            name,
            displayName: displayName || name,
            type,
            site: siteId,
            createdBy,
            isExternal: true,
            connection: {
                host: host || 'localhost',
                port: port || this.config[type === 'mariadb' ? 'mysql' : type]?.port,
                databaseName: databaseName || name,
            },
            dbUser: {
                username,
                privileges: ['ALL'],
                created: true,
            },
            status: 'external',
        });

        // Chiffrer le mot de passe
        database.setPassword(password);
        await database.save();

        return database;
    }

    // ============================================
    // CRÉATION PAR TYPE DE BASE
    // ============================================

    /**
     * Crée une base MongoDB
     * @private
     */
    async _createMongoDatabase(database, password) {
        const { adminDb, adminUser, adminPassword, host, port } = this.config.mongodb;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create MongoDB database: ${dbName}`);
            return;
        }

        // Commande mongosh pour créer la base et l'utilisateur
        const mongoCommands = `
            use ${dbName}
            db.createUser({
                user: "${dbUser}",
                pwd: "${password}",
                roles: [
                    { role: "readWrite", db: "${dbName}" },
                    { role: "dbAdmin", db: "${dbName}" }
                ]
            })
            db.createCollection("_twoine_init")
        `;

        const command = `mongosh --host ${host}:${port} -u "${adminUser}" -p "${adminPassword}" --authenticationDatabase "${adminDb}" --eval '${mongoCommands.replace(/\n/g, '; ')}'`;

        try {
            await execAsync(command);
        } catch (error) {
            throw new Error(`Failed to create MongoDB database: ${error.message}`);
        }
    }

    /**
     * Crée une base MySQL/MariaDB
     * @private
     */
    async _createMySQLDatabase(database, password) {
        const { adminUser, adminPassword, host, port } = this.config.mysql;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create MySQL database: ${dbName}`);
            return;
        }

        // Commandes SQL
        const sqlCommands = `
            CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${password}';
            GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER, REFERENCES ON \`${dbName}\`.* TO '${dbUser}'@'localhost';
            FLUSH PRIVILEGES;
        `;

        const command = `mysql -h ${host} -P ${port} -u "${adminUser}" -p"${adminPassword}" -e "${sqlCommands.replace(/\n/g, ' ')}"`;

        try {
            await execAsync(command);
        } catch (error) {
            throw new Error(`Failed to create MySQL database: ${error.message}`);
        }
    }

    /**
     * Crée une base PostgreSQL
     * @private
     */
    async _createPostgreSQLDatabase(database, password) {
        const { adminUser, adminPassword, host, port, adminDb } = this.config.postgresql;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would create PostgreSQL database: ${dbName}`);
            return;
        }

        // Créer l'utilisateur
        const createUserCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "CREATE USER ${dbUser} WITH PASSWORD '${password}';"`;
        
        // Créer la base
        const createDbCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "CREATE DATABASE ${dbName} OWNER ${dbUser};"`;
        
        // Accorder les privilèges
        const grantCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${dbName}" -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}; GRANT ALL ON SCHEMA public TO ${dbUser};"`;

        try {
            await execAsync(createUserCmd).catch(() => {}); // L'utilisateur existe peut-être déjà
            await execAsync(createDbCmd);
            await execAsync(grantCmd);
        } catch (error) {
            throw new Error(`Failed to create PostgreSQL database: ${error.message}`);
        }
    }

    // ============================================
    // SUPPRESSION DE BASE DE DONNÉES
    // ============================================

    /**
     * Supprime une base de données
     * @param {string} databaseId - ID de la base
     * @param {boolean} keepData - Garder les données (ne supprime que l'entrée Twoine)
     * @returns {Promise<void>}
     */
    async deleteDatabase(databaseId, keepData = false) {
        const database = await Database.findById(databaseId);
        if (!database) {
            throw new Error('Database not found');
        }

        database.status = 'deleting';
        await database.save();

        try {
            // Si base externe ou keepData, ne pas supprimer physiquement
            if (!database.isExternal && !keepData) {
                switch (database.type) {
                    case 'mongodb':
                        await this._deleteMongoDatabase(database);
                        break;
                    case 'mysql':
                    case 'mariadb':
                        await this._deleteMySQLDatabase(database);
                        break;
                    case 'postgresql':
                        await this._deletePostgreSQLDatabase(database);
                        break;
                }
            }

            database.status = 'deleted';
            await database.save();

        } catch (error) {
            database.status = 'error';
            database.errorMessage = error.message;
            await database.save();
            throw error;
        }
    }

    /**
     * Supprime une base MongoDB
     * @private
     */
    async _deleteMongoDatabase(database) {
        const { adminDb, adminUser, adminPassword, host, port } = this.config.mongodb;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete MongoDB database: ${dbName}`);
            return;
        }

        const mongoCommands = `
            use ${dbName}
            db.dropUser("${dbUser}")
            db.dropDatabase()
        `;

        const command = `mongosh --host ${host}:${port} -u "${adminUser}" -p "${adminPassword}" --authenticationDatabase "${adminDb}" --eval '${mongoCommands.replace(/\n/g, '; ')}'`;

        try {
            await execAsync(command);
        } catch (error) {
            console.warn(`Failed to delete MongoDB database: ${error.message}`);
        }
    }

    /**
     * Supprime une base MySQL/MariaDB
     * @private
     */
    async _deleteMySQLDatabase(database) {
        const { adminUser, adminPassword, host, port } = this.config.mysql;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete MySQL database: ${dbName}`);
            return;
        }

        const sqlCommands = `
            DROP DATABASE IF EXISTS \`${dbName}\`;
            DROP USER IF EXISTS '${dbUser}'@'localhost';
            FLUSH PRIVILEGES;
        `;

        const command = `mysql -h ${host} -P ${port} -u "${adminUser}" -p"${adminPassword}" -e "${sqlCommands.replace(/\n/g, ' ')}"`;

        try {
            await execAsync(command);
        } catch (error) {
            console.warn(`Failed to delete MySQL database: ${error.message}`);
        }
    }

    /**
     * Supprime une base PostgreSQL
     * @private
     */
    async _deletePostgreSQLDatabase(database) {
        const { adminUser, adminPassword, host, port, adminDb } = this.config.postgresql;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would delete PostgreSQL database: ${dbName}`);
            return;
        }

        // Fermer les connexions actives
        const terminateCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}';"`;
        
        const dropDbCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "DROP DATABASE IF EXISTS ${dbName};"`;
        
        const dropUserCmd = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "DROP USER IF EXISTS ${dbUser};"`;

        try {
            await execAsync(terminateCmd).catch(() => {});
            await execAsync(dropDbCmd);
            await execAsync(dropUserCmd);
        } catch (error) {
            console.warn(`Failed to delete PostgreSQL database: ${error.message}`);
        }
    }

    // ============================================
    // GESTION DES MOTS DE PASSE
    // ============================================

    /**
     * Réinitialise le mot de passe d'une base de données
     * @param {string} databaseId 
     * @returns {Promise<Object>} Nouveau mot de passe
     */
    async resetPassword(databaseId) {
        const database = await Database.findById(databaseId);
        if (!database) {
            throw new Error('Database not found');
        }

        if (database.isExternal) {
            throw new Error('Cannot reset password for external database');
        }

        const newPassword = Database.generatePassword();

        try {
            switch (database.type) {
                case 'mongodb':
                    await this._resetMongoPassword(database, newPassword);
                    break;
                case 'mysql':
                case 'mariadb':
                    await this._resetMySQLPassword(database, newPassword);
                    break;
                case 'postgresql':
                    await this._resetPostgreSQLPassword(database, newPassword);
                    break;
            }

            // Mettre à jour le mot de passe chiffré
            database.setPassword(newPassword);
            await database.save();

            return {
                username: database.dbUser.username,
                password: newPassword,
                connectionString: database.getConnectionString(true),
            };

        } catch (error) {
            throw new Error(`Failed to reset password: ${error.message}`);
        }
    }

    /**
     * Réinitialise le mot de passe MongoDB
     * @private
     */
    async _resetMongoPassword(database, newPassword) {
        const { adminDb, adminUser, adminPassword, host, port } = this.config.mongodb;
        const dbName = database.connection.databaseName;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would reset MongoDB password for: ${dbUser}`);
            return;
        }

        const command = `mongosh --host ${host}:${port} -u "${adminUser}" -p "${adminPassword}" --authenticationDatabase "${adminDb}" --eval 'use ${dbName}; db.changeUserPassword("${dbUser}", "${newPassword}")'`;

        await execAsync(command);
    }

    /**
     * Réinitialise le mot de passe MySQL
     * @private
     */
    async _resetMySQLPassword(database, newPassword) {
        const { adminUser, adminPassword, host, port } = this.config.mysql;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would reset MySQL password for: ${dbUser}`);
            return;
        }

        const sqlCommand = `ALTER USER '${dbUser}'@'localhost' IDENTIFIED BY '${newPassword}'; FLUSH PRIVILEGES;`;
        const command = `mysql -h ${host} -P ${port} -u "${adminUser}" -p"${adminPassword}" -e "${sqlCommand}"`;

        await execAsync(command);
    }

    /**
     * Réinitialise le mot de passe PostgreSQL
     * @private
     */
    async _resetPostgreSQLPassword(database, newPassword) {
        const { adminUser, adminPassword, host, port, adminDb } = this.config.postgresql;
        const dbUser = database.dbUser.username;

        if (this.dryRun) {
            console.log(`[DRY-RUN] Would reset PostgreSQL password for: ${dbUser}`);
            return;
        }

        const command = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${adminDb}" -c "ALTER USER ${dbUser} WITH PASSWORD '${newPassword}';"`;

        await execAsync(command);
    }

    // ============================================
    // INFORMATIONS ET STATISTIQUES
    // ============================================

    /**
     * Obtient les informations d'une base de données
     * @param {string} databaseId 
     * @returns {Promise<Object>}
     */
    async getDatabaseInfo(databaseId) {
        const database = await Database.findById(databaseId).populate('site', 'name displayName');
        if (!database) {
            throw new Error('Database not found');
        }

        // Récupérer les stats
        let stats = null;
        try {
            stats = await this.getDatabaseStats(databaseId);
        } catch (error) {
            console.warn(`Could not get stats for database ${databaseId}: ${error.message}`);
        }

        return {
            ...database.toObject(),
            connectionUrl: database.getConnectionString(false),
            stats,
        };
    }

    /**
     * Obtient les statistiques d'une base de données
     * @param {string} databaseId 
     * @returns {Promise<Object>}
     */
    async getDatabaseStats(databaseId) {
        const database = await Database.findById(databaseId);
        if (!database) {
            throw new Error('Database not found');
        }

        try {
            switch (database.type) {
                case 'mongodb':
                    return await this._getMongoStats(database);
                case 'mysql':
                case 'mariadb':
                    return await this._getMySQLStats(database);
                case 'postgresql':
                    return await this._getPostgreSQLStats(database);
                default:
                    return null;
            }
        } catch (error) {
            console.warn(`Failed to get stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Statistiques MongoDB
     * @private
     */
    async _getMongoStats(database) {
        const { adminDb, adminUser, adminPassword, host, port } = this.config.mongodb;
        const dbName = database.connection.databaseName;

        const command = `mongosh --host ${host}:${port} -u "${adminUser}" -p "${adminPassword}" --authenticationDatabase "${adminDb}" --quiet --eval 'use ${dbName}; JSON.stringify(db.stats())'`;

        try {
            const { stdout } = await execAsync(command);
            const stats = JSON.parse(stdout.trim());
            return {
                sizeBytes: stats.dataSize || 0,
                storageSize: stats.storageSize || 0,
                collections: stats.collections || 0,
                indexes: stats.indexes || 0,
            };
        } catch {
            return null;
        }
    }

    /**
     * Statistiques MySQL
     * @private
     */
    async _getMySQLStats(database) {
        const { adminUser, adminPassword, host, port } = this.config.mysql;
        const dbName = database.connection.databaseName;

        const sqlCommand = `SELECT 
            SUM(data_length + index_length) as size_bytes,
            COUNT(*) as tables_count
            FROM information_schema.TABLES 
            WHERE table_schema = '${dbName}'`;

        const command = `mysql -h ${host} -P ${port} -u "${adminUser}" -p"${adminPassword}" -N -e "${sqlCommand}"`;

        try {
            const { stdout } = await execAsync(command);
            const [sizeBytes, tablesCount] = stdout.trim().split('\t');
            return {
                sizeBytes: parseInt(sizeBytes) || 0,
                tablesCount: parseInt(tablesCount) || 0,
            };
        } catch {
            return null;
        }
    }

    /**
     * Statistiques PostgreSQL
     * @private
     */
    async _getPostgreSQLStats(database) {
        const { adminUser, adminPassword, host, port } = this.config.postgresql;
        const dbName = database.connection.databaseName;

        const command = `PGPASSWORD="${adminPassword}" psql -h ${host} -p ${port} -U "${adminUser}" -d "${dbName}" -t -c "SELECT pg_database_size('${dbName}'), (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public');"`;

        try {
            const { stdout } = await execAsync(command);
            const [sizeBytes, tablesCount] = stdout.trim().split('|').map(s => s.trim());
            return {
                sizeBytes: parseInt(sizeBytes) || 0,
                tablesCount: parseInt(tablesCount) || 0,
            };
        } catch {
            return null;
        }
    }

    // ============================================
    // VÉRIFICATION DES DROITS
    // ============================================

    /**
     * Vérifie les droits d'accès d'un utilisateur sur une base
     * @param {User} user 
     * @param {string} databaseId 
     * @param {string} accessType - 'read', 'write', 'admin'
     * @returns {Promise<boolean>}
     */
    async checkUserAccess(user, databaseId, accessType = 'read') {
        const database = await Database.findById(databaseId);
        if (!database) {
            return false;
        }

        return database.checkAccess(user, accessType);
    }

    /**
     * Liste toutes les bases accessibles par un utilisateur
     * @param {User} user 
     * @returns {Promise<Database[]>}
     */
    async listUserDatabases(user) {
        return Database.findByUser(user);
    }

    /**
     * Liste toutes les bases d'un site
     * @param {string} siteId 
     * @returns {Promise<Database[]>}
     */
    async listSiteDatabases(siteId) {
        return Database.findBySite(siteId);
    }

    // ============================================
    // UTILITAIRES
    // ============================================

    /**
     * Retourne les privilèges par défaut selon le type de base
     * @private
     */
    _getDefaultPrivileges(type) {
        switch (type) {
            case 'mongodb':
                return ['readWrite', 'dbAdmin'];
            case 'mysql':
            case 'mariadb':
                return ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'INDEX', 'ALTER', 'REFERENCES'];
            case 'postgresql':
                return ['ALL'];
            default:
                return [];
        }
    }

    /**
     * Teste la connexion à une base de données
     * @param {string} databaseId 
     * @returns {Promise<boolean>}
     */
    async testConnection(databaseId) {
        const database = await Database.findById(databaseId);
        if (!database) {
            throw new Error('Database not found');
        }

        const password = database.getPassword();
        const { host, port, databaseName } = database.connection;
        const { username } = database.dbUser;

        try {
            switch (database.type) {
                case 'mongodb':
                    await execAsync(`mongosh --host ${host}:${port} -u "${username}" -p "${password}" --authenticationDatabase "${databaseName}" --eval "db.runCommand({ping: 1})" --quiet`);
                    break;
                case 'mysql':
                case 'mariadb':
                    await execAsync(`mysql -h ${host} -P ${port} -u "${username}" -p"${password}" "${databaseName}" -e "SELECT 1"`);
                    break;
                case 'postgresql':
                    await execAsync(`PGPASSWORD="${password}" psql -h ${host} -p ${port} -U "${username}" -d "${databaseName}" -c "SELECT 1"`);
                    break;
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gère la suppression d'un site (que faire des bases?)
     * @param {string} siteId 
     * @param {string} action - 'delete' | 'keep' | 'unlink'
     * @returns {Promise<Object>}
     */
    async handleSiteDeletion(siteId, action = 'unlink') {
        const databases = await Database.findBySite(siteId);
        const results = { processed: [], errors: [] };

        for (const db of databases) {
            try {
                switch (action) {
                    case 'delete':
                        await this.deleteDatabase(db._id, false);
                        results.processed.push({ id: db._id, name: db.name, action: 'deleted' });
                        break;
                    case 'keep':
                        // Marquer comme orpheline mais garder
                        db.status = 'external';
                        db.metadata.set('orphanedFrom', siteId);
                        db.metadata.set('orphanedAt', new Date().toISOString());
                        await db.save();
                        results.processed.push({ id: db._id, name: db.name, action: 'orphaned' });
                        break;
                    case 'unlink':
                    default:
                        // Supprimer l'entrée mais garder les données
                        await this.deleteDatabase(db._id, true);
                        results.processed.push({ id: db._id, name: db.name, action: 'unlinked' });
                        break;
                }
            } catch (error) {
                results.errors.push({ id: db._id, name: db.name, error: error.message });
            }
        }

        return results;
    }
}

// Export singleton et classe
const defaultManager = new DatabaseManager();

module.exports = {
    DatabaseManager,
    databaseManager: defaultManager,
};
