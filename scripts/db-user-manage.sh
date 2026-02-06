#!/bin/bash
#
# TWOINE - Database User Management Script
# Gestion des utilisateurs et bases de données
# Compatible Ubuntu 22.04
#
# Usage: ./db-user-manage.sh <action> <type> <options>
#

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CONFIG_DIR="/etc/twoine"
CREDENTIALS_FILE="$CONFIG_DIR/db-credentials.env"

# Charger les credentials admin
if [[ -f "$CREDENTIALS_FILE" ]]; then
    source "$CREDENTIALS_FILE"
fi

# ============================================
# FONCTIONS UTILITAIRES
# ============================================

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

# ============================================
# MONGODB
# ============================================

mongo_create_db() {
    local db_name="$1"
    local db_user="$2"
    local db_password="${3:-$(generate_password)}"

    info "Creating MongoDB database: $db_name"

    mongosh --host localhost:27017 \
        -u "${MONGODB_ADMIN_USER}" \
        -p "${MONGODB_ADMIN_PASSWORD}" \
        --authenticationDatabase admin \
        --quiet \
        --eval "
            use ${db_name}
            db.createUser({
                user: '${db_user}',
                pwd: '${db_password}',
                roles: [
                    { role: 'readWrite', db: '${db_name}' },
                    { role: 'dbAdmin', db: '${db_name}' }
                ]
            })
            db.createCollection('_twoine_init')
        "

    success "MongoDB database created"
    echo "Connection string: mongodb://${db_user}:${db_password}@localhost:27017/${db_name}?authSource=${db_name}"
}

mongo_delete_db() {
    local db_name="$1"
    local db_user="$2"

    info "Deleting MongoDB database: $db_name"

    mongosh --host localhost:27017 \
        -u "${MONGODB_ADMIN_USER}" \
        -p "${MONGODB_ADMIN_PASSWORD}" \
        --authenticationDatabase admin \
        --quiet \
        --eval "
            use ${db_name}
            db.dropUser('${db_user}')
            db.dropDatabase()
        " 2>/dev/null || warn "Some cleanup may have failed"

    success "MongoDB database deleted"
}

mongo_reset_password() {
    local db_name="$1"
    local db_user="$2"
    local new_password="${3:-$(generate_password)}"

    info "Resetting MongoDB password for: $db_user"

    mongosh --host localhost:27017 \
        -u "${MONGODB_ADMIN_USER}" \
        -p "${MONGODB_ADMIN_PASSWORD}" \
        --authenticationDatabase admin \
        --quiet \
        --eval "
            use ${db_name}
            db.changeUserPassword('${db_user}', '${new_password}')
        "

    success "Password reset for $db_user"
    echo "New password: $new_password"
}

mongo_list_dbs() {
    info "Listing MongoDB databases"

    mongosh --host localhost:27017 \
        -u "${MONGODB_ADMIN_USER}" \
        -p "${MONGODB_ADMIN_PASSWORD}" \
        --authenticationDatabase admin \
        --quiet \
        --eval "db.adminCommand('listDatabases').databases.forEach(d => print(d.name + ' (' + d.sizeOnDisk + ' bytes)'))"
}

# ============================================
# MYSQL/MARIADB
# ============================================

mysql_create_db() {
    local db_name="$1"
    local db_user="$2"
    local db_password="${3:-$(generate_password)}"

    info "Creating MySQL database: $db_name"

    mysql -u "${MYSQL_ADMIN_USER}" -p"${MYSQL_ADMIN_PASSWORD}" << EOSQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user}'@'localhost' IDENTIFIED BY '${db_password}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER, REFERENCES ON \`${db_name}\`.* TO '${db_user}'@'localhost';
FLUSH PRIVILEGES;
EOSQL

    success "MySQL database created"
    echo "Connection string: mysql://${db_user}:${db_password}@localhost:3306/${db_name}"
}

mysql_delete_db() {
    local db_name="$1"
    local db_user="$2"

    info "Deleting MySQL database: $db_name"

    mysql -u "${MYSQL_ADMIN_USER}" -p"${MYSQL_ADMIN_PASSWORD}" << EOSQL
DROP DATABASE IF EXISTS \`${db_name}\`;
DROP USER IF EXISTS '${db_user}'@'localhost';
FLUSH PRIVILEGES;
EOSQL

    success "MySQL database deleted"
}

mysql_reset_password() {
    local db_user="$1"
    local new_password="${2:-$(generate_password)}"

    info "Resetting MySQL password for: $db_user"

    mysql -u "${MYSQL_ADMIN_USER}" -p"${MYSQL_ADMIN_PASSWORD}" << EOSQL
ALTER USER '${db_user}'@'localhost' IDENTIFIED BY '${new_password}';
FLUSH PRIVILEGES;
EOSQL

    success "Password reset for $db_user"
    echo "New password: $new_password"
}

mysql_list_dbs() {
    info "Listing MySQL databases"

    mysql -u "${MYSQL_ADMIN_USER}" -p"${MYSQL_ADMIN_PASSWORD}" -e "
        SELECT 
            table_schema AS 'Database',
            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
        FROM information_schema.TABLES
        GROUP BY table_schema
        ORDER BY table_schema;
    "
}

# ============================================
# POSTGRESQL
# ============================================

pg_create_db() {
    local db_name="$1"
    local db_user="$2"
    local db_password="${3:-$(generate_password)}"

    info "Creating PostgreSQL database: $db_name"

    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d postgres << EOSQL
CREATE USER ${db_user} WITH PASSWORD '${db_password}';
CREATE DATABASE ${db_name} OWNER ${db_user};
GRANT ALL PRIVILEGES ON DATABASE ${db_name} TO ${db_user};
EOSQL

    # Accorder les droits sur le schéma public
    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d "${db_name}" << EOSQL
GRANT ALL ON SCHEMA public TO ${db_user};
EOSQL

    success "PostgreSQL database created"
    echo "Connection string: postgresql://${db_user}:${db_password}@localhost:5432/${db_name}"
}

pg_delete_db() {
    local db_name="$1"
    local db_user="$2"

    info "Deleting PostgreSQL database: $db_name"

    # Terminer les connexions actives
    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db_name}';" 2>/dev/null || true

    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d postgres << EOSQL
DROP DATABASE IF EXISTS ${db_name};
DROP USER IF EXISTS ${db_user};
EOSQL

    success "PostgreSQL database deleted"
}

pg_reset_password() {
    local db_user="$1"
    local new_password="${2:-$(generate_password)}"

    info "Resetting PostgreSQL password for: $db_user"

    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d postgres -c \
        "ALTER USER ${db_user} WITH PASSWORD '${new_password}';"

    success "Password reset for $db_user"
    echo "New password: $new_password"
}

pg_list_dbs() {
    info "Listing PostgreSQL databases"

    PGPASSWORD="${POSTGRESQL_ADMIN_PASSWORD}" psql -h localhost -U "${POSTGRESQL_ADMIN_USER}" -d postgres -c "
        SELECT 
            datname AS \"Database\",
            pg_size_pretty(pg_database_size(datname)) AS \"Size\"
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname;
    "
}

# ============================================
# COMMANDES PRINCIPALES
# ============================================

show_usage() {
    cat << EOF
Twoine Database User Management

Usage: $0 <action> <type> [options]

Actions:
    create-db     Create a database and user
    delete-db     Delete a database and user
    reset-pass    Reset user password
    list-dbs      List all databases

Types:
    mongodb       MongoDB operations
    mysql         MySQL/MariaDB operations
    postgresql    PostgreSQL operations

Examples:
    $0 create-db mongodb mydb myuser [password]
    $0 delete-db mysql mydb myuser
    $0 reset-pass postgresql myuser [new_password]
    $0 list-dbs mongodb

EOF
}

# ============================================
# MAIN
# ============================================

main() {
    local action="${1:-help}"
    local db_type="${2:-}"
    
    case "$action" in
        create-db)
            local db_name="${3:-}"
            local db_user="${4:-}"
            local db_password="${5:-}"
            
            if [[ -z "$db_name" || -z "$db_user" ]]; then
                error "Usage: $0 create-db <type> <db_name> <db_user> [password]"
                exit 1
            fi
            
            case "$db_type" in
                mongodb) mongo_create_db "$db_name" "$db_user" "$db_password" ;;
                mysql|mariadb) mysql_create_db "$db_name" "$db_user" "$db_password" ;;
                postgresql|postgres) pg_create_db "$db_name" "$db_user" "$db_password" ;;
                *) error "Unknown database type: $db_type"; exit 1 ;;
            esac
            ;;
            
        delete-db)
            local db_name="${3:-}"
            local db_user="${4:-}"
            
            if [[ -z "$db_name" || -z "$db_user" ]]; then
                error "Usage: $0 delete-db <type> <db_name> <db_user>"
                exit 1
            fi
            
            case "$db_type" in
                mongodb) mongo_delete_db "$db_name" "$db_user" ;;
                mysql|mariadb) mysql_delete_db "$db_name" "$db_user" ;;
                postgresql|postgres) pg_delete_db "$db_name" "$db_user" ;;
                *) error "Unknown database type: $db_type"; exit 1 ;;
            esac
            ;;
            
        reset-pass)
            local db_user="${3:-}"
            local new_password="${4:-}"
            local db_name="${5:-}" # Pour MongoDB
            
            if [[ -z "$db_user" ]]; then
                error "Usage: $0 reset-pass <type> <db_user> [new_password] [db_name]"
                exit 1
            fi
            
            case "$db_type" in
                mongodb)
                    if [[ -z "$db_name" ]]; then
                        error "MongoDB requires db_name for password reset"
                        exit 1
                    fi
                    mongo_reset_password "$db_name" "$db_user" "$new_password"
                    ;;
                mysql|mariadb) mysql_reset_password "$db_user" "$new_password" ;;
                postgresql|postgres) pg_reset_password "$db_user" "$new_password" ;;
                *) error "Unknown database type: $db_type"; exit 1 ;;
            esac
            ;;
            
        list-dbs)
            case "$db_type" in
                mongodb) mongo_list_dbs ;;
                mysql|mariadb) mysql_list_dbs ;;
                postgresql|postgres) pg_list_dbs ;;
                *) error "Unknown database type: $db_type"; exit 1 ;;
            esac
            ;;
            
        help|--help|-h|"")
            show_usage
            ;;
            
        *)
            error "Unknown action: $action"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
