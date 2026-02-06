#!/bin/bash
#
# TWOINE - Database Setup Script
# Installe et configure les moteurs de bases de données
# Compatible Ubuntu 22.04
#
# Usage: sudo ./setup-databases.sh [mongodb|mysql|postgresql|all]
#

set -euo pipefail

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TWOINE_DB_USER="${TWOINE_DB_USER:-twoine_admin}"
TWOINE_DB_PASSWORD="${TWOINE_DB_PASSWORD:-}"
CONFIG_DIR="/etc/twoine"
LOG_FILE="/var/log/twoine/db-setup.log"

# ============================================
# FONCTIONS UTILITAIRES
# ============================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() { log "INFO" "${BLUE}$*${NC}"; }
success() { log "SUCCESS" "${GREEN}$*${NC}"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        exit 1
    fi
}

generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

create_directories() {
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
}

# ============================================
# INSTALLATION MONGODB
# ============================================

install_mongodb() {
    info "Installing MongoDB..."

    # Vérifier si déjà installé
    if command -v mongod &> /dev/null; then
        warn "MongoDB is already installed"
        mongod --version
        return 0
    fi

    # Importer la clé GPG
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

    # Ajouter le dépôt
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list

    # Installer
    apt-get update
    apt-get install -y mongodb-org

    # Démarrer et activer
    systemctl start mongod
    systemctl enable mongod

    success "MongoDB installed successfully"
}

configure_mongodb() {
    info "Configuring MongoDB for Twoine..."

    local password="${TWOINE_DB_PASSWORD:-$(generate_password)}"

    # Backup de la config originale
    cp /etc/mongod.conf /etc/mongod.conf.backup.$(date +%s) 2>/dev/null || true

    # Configuration sécurisée
    cat > /etc/mongod.conf << 'MONGOCONF'
# Twoine MongoDB Configuration
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
MONGOCONF

    # Redémarrer MongoDB
    systemctl restart mongod
    sleep 3

    # Créer l'utilisateur admin Twoine (première fois sans auth)
    mongosh --quiet --eval "
        use admin
        try {
            db.createUser({
                user: '${TWOINE_DB_USER}',
                pwd: '${password}',
                roles: [
                    { role: 'userAdminAnyDatabase', db: 'admin' },
                    { role: 'dbAdminAnyDatabase', db: 'admin' },
                    { role: 'readWriteAnyDatabase', db: 'admin' }
                ]
            })
            print('Admin user created successfully')
        } catch(e) {
            if (e.codeName === 'DuplicateKey') {
                print('Admin user already exists')
            } else {
                throw e
            }
        }
    " 2>/dev/null || warn "Could not create admin user (may already exist)"

    # Sauvegarder les credentials
    echo "MONGODB_ADMIN_USER=${TWOINE_DB_USER}" >> "$CONFIG_DIR/db-credentials.env"
    echo "MONGODB_ADMIN_PASSWORD=${password}" >> "$CONFIG_DIR/db-credentials.env"
    chmod 600 "$CONFIG_DIR/db-credentials.env"

    success "MongoDB configured for Twoine"
    info "Admin password saved to $CONFIG_DIR/db-credentials.env"
}

secure_mongodb() {
    info "Securing MongoDB..."

    # Bloquer l'accès externe via iptables
    if command -v ufw &> /dev/null; then
        ufw deny 27017/tcp comment 'Block external MongoDB' 2>/dev/null || true
    fi

    # Vérifier que bindIp est localhost uniquement
    if grep -q "bindIp: 127.0.0.1" /etc/mongod.conf; then
        success "MongoDB is bound to localhost only"
    else
        warn "MongoDB may be accessible externally - check bindIp in /etc/mongod.conf"
    fi

    success "MongoDB security configured"
}

# ============================================
# INSTALLATION MYSQL/MARIADB
# ============================================

install_mysql() {
    info "Installing MariaDB (MySQL compatible)..."

    # Vérifier si déjà installé
    if command -v mysql &> /dev/null; then
        warn "MySQL/MariaDB is already installed"
        mysql --version
        return 0
    fi

    # Installer MariaDB
    apt-get update
    apt-get install -y mariadb-server mariadb-client

    # Démarrer et activer
    systemctl start mariadb
    systemctl enable mariadb

    success "MariaDB installed successfully"
}

configure_mysql() {
    info "Configuring MySQL/MariaDB for Twoine..."

    local password="${TWOINE_DB_PASSWORD:-$(generate_password)}"

    # Configuration sécurisée
    cat > /etc/mysql/mariadb.conf.d/99-twoine.cnf << 'MYSQLCONF'
# Twoine MySQL/MariaDB Configuration
[mysqld]
# Sécurité
bind-address = 127.0.0.1
skip-networking = 0
local-infile = 0
symbolic-links = 0

# Performance
max_connections = 100
innodb_buffer_pool_size = 256M

# Charset
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# Logs
log_error = /var/log/mysql/error.log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
MYSQLCONF

    # Créer l'utilisateur admin Twoine
    mysql -u root << EOSQL
-- Créer l'utilisateur admin Twoine
CREATE USER IF NOT EXISTS '${TWOINE_DB_USER}'@'localhost' IDENTIFIED BY '${password}';
GRANT ALL PRIVILEGES ON *.* TO '${TWOINE_DB_USER}'@'localhost' WITH GRANT OPTION;

-- Supprimer les utilisateurs anonymes
DELETE FROM mysql.user WHERE User='';

-- Supprimer la base test
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';

-- Désactiver l'accès root distant
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');

FLUSH PRIVILEGES;
EOSQL

    # Redémarrer MySQL
    systemctl restart mariadb

    # Sauvegarder les credentials
    echo "MYSQL_ADMIN_USER=${TWOINE_DB_USER}" >> "$CONFIG_DIR/db-credentials.env"
    echo "MYSQL_ADMIN_PASSWORD=${password}" >> "$CONFIG_DIR/db-credentials.env"
    chmod 600 "$CONFIG_DIR/db-credentials.env"

    success "MySQL/MariaDB configured for Twoine"
    info "Admin password saved to $CONFIG_DIR/db-credentials.env"
}

secure_mysql() {
    info "Securing MySQL/MariaDB..."

    # Bloquer l'accès externe via ufw
    if command -v ufw &> /dev/null; then
        ufw deny 3306/tcp comment 'Block external MySQL' 2>/dev/null || true
    fi

    # Vérifier le binding
    if grep -q "bind-address.*=.*127.0.0.1" /etc/mysql/mariadb.conf.d/99-twoine.cnf 2>/dev/null; then
        success "MySQL is bound to localhost only"
    else
        warn "MySQL may be accessible externally - check bind-address"
    fi

    success "MySQL security configured"
}

# ============================================
# INSTALLATION POSTGRESQL
# ============================================

install_postgresql() {
    info "Installing PostgreSQL..."

    # Vérifier si déjà installé
    if command -v psql &> /dev/null; then
        warn "PostgreSQL is already installed"
        psql --version
        return 0
    fi

    # Ajouter le dépôt PostgreSQL officiel
    sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

    # Installer
    apt-get update
    apt-get install -y postgresql-16 postgresql-contrib-16

    # Démarrer et activer
    systemctl start postgresql
    systemctl enable postgresql

    success "PostgreSQL installed successfully"
}

configure_postgresql() {
    info "Configuring PostgreSQL for Twoine..."

    local password="${TWOINE_DB_PASSWORD:-$(generate_password)}"
    local pg_version=$(ls /etc/postgresql/ | head -1)
    local pg_conf="/etc/postgresql/${pg_version}/main"

    # Configuration sécurisée
    cat > "${pg_conf}/conf.d/twoine.conf" << 'PGCONF'
# Twoine PostgreSQL Configuration

# Connexions
listen_addresses = 'localhost'
max_connections = 100

# Mémoire
shared_buffers = 256MB
work_mem = 4MB
maintenance_work_mem = 64MB

# Logs
log_destination = 'stderr'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'ddl'
log_duration = off

# Sécurité
ssl = off
password_encryption = scram-sha-256
PGCONF

    # Modifier pg_hba.conf pour l'authentification
    cat > "${pg_conf}/pg_hba.conf" << 'PGHBA'
# Twoine PostgreSQL HBA Configuration
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     scram-sha-256

# IPv4 local connections
host    all             all             127.0.0.1/32            scram-sha-256

# IPv6 local connections
host    all             all             ::1/128                 scram-sha-256

# Reject all other connections
host    all             all             0.0.0.0/0               reject
PGHBA

    # Créer l'utilisateur admin Twoine
    sudo -u postgres psql << EOSQL
-- Créer l'utilisateur admin Twoine
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${TWOINE_DB_USER}') THEN
        CREATE ROLE ${TWOINE_DB_USER} WITH LOGIN PASSWORD '${password}' SUPERUSER CREATEDB CREATEROLE;
    ELSE
        ALTER ROLE ${TWOINE_DB_USER} WITH PASSWORD '${password}';
    END IF;
END
\$\$;
EOSQL

    # Redémarrer PostgreSQL
    systemctl restart postgresql

    # Sauvegarder les credentials
    echo "POSTGRESQL_ADMIN_USER=${TWOINE_DB_USER}" >> "$CONFIG_DIR/db-credentials.env"
    echo "POSTGRESQL_ADMIN_PASSWORD=${password}" >> "$CONFIG_DIR/db-credentials.env"
    chmod 600 "$CONFIG_DIR/db-credentials.env"

    success "PostgreSQL configured for Twoine"
    info "Admin password saved to $CONFIG_DIR/db-credentials.env"
}

secure_postgresql() {
    info "Securing PostgreSQL..."

    # Bloquer l'accès externe via ufw
    if command -v ufw &> /dev/null; then
        ufw deny 5432/tcp comment 'Block external PostgreSQL' 2>/dev/null || true
    fi

    success "PostgreSQL security configured"
}

# ============================================
# FONCTIONS PRINCIPALES
# ============================================

setup_mongodb() {
    info "=== MongoDB Setup ==="
    install_mongodb
    configure_mongodb
    secure_mongodb
    success "=== MongoDB Setup Complete ==="
}

setup_mysql() {
    info "=== MySQL/MariaDB Setup ==="
    install_mysql
    configure_mysql
    secure_mysql
    success "=== MySQL/MariaDB Setup Complete ==="
}

setup_postgresql() {
    info "=== PostgreSQL Setup ==="
    install_postgresql
    configure_postgresql
    secure_postgresql
    success "=== PostgreSQL Setup Complete ==="
}

setup_all() {
    info "=== Installing All Database Engines ==="
    setup_mongodb
    echo ""
    setup_mysql
    echo ""
    setup_postgresql
    success "=== All Database Engines Installed ==="
}

show_usage() {
    cat << EOF
Twoine Database Setup Script

Usage: sudo $0 [OPTION]

Options:
    mongodb      Install and configure MongoDB
    mysql        Install and configure MySQL/MariaDB
    postgresql   Install and configure PostgreSQL
    all          Install all database engines
    help         Show this help message

Environment Variables:
    TWOINE_DB_USER      Admin username (default: twoine_admin)
    TWOINE_DB_PASSWORD  Admin password (auto-generated if not set)

Examples:
    sudo $0 mongodb
    sudo TWOINE_DB_PASSWORD=MySecurePass123 $0 all

EOF
}

# ============================================
# MAIN
# ============================================

main() {
    check_root
    create_directories

    local action="${1:-help}"

    case "$action" in
        mongodb)
            setup_mongodb
            ;;
        mysql|mariadb)
            setup_mysql
            ;;
        postgresql|postgres)
            setup_postgresql
            ;;
        all)
            setup_all
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            error "Unknown option: $action"
            show_usage
            exit 1
            ;;
    esac

    if [[ "$action" != "help" && "$action" != "--help" && "$action" != "-h" ]]; then
        echo ""
        info "Database credentials saved to: $CONFIG_DIR/db-credentials.env"
        info "Add these to your Twoine .env file"
        warn "Keep these credentials secure!"
    fi
}

main "$@"
