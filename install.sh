#!/bin/bash

#===============================================================================
# TWOINE - Production Installation Script
# Version: 1.0.0
# Target: Ubuntu 22.04 LTS (Fresh server)
# Author: Twoine Team
# 
# This script installs and configures the complete Twoine self-hosting platform
# including API, Admin Panel, User Panel, Worker, and Supervisor services.
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# SCRIPT DIRECTORY & MODULES
#-------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source DNS management module if available
if [ -f "$SCRIPT_DIR/lib/dns-manager.sh" ]; then
    source "$SCRIPT_DIR/lib/dns-manager.sh"
    DNS_MODULE_LOADED=true
else
    DNS_MODULE_LOADED=false
fi

#-------------------------------------------------------------------------------
# CONFIGURATION & DEFAULTS
#-------------------------------------------------------------------------------

TWOINE_VERSION="1.0.0"
TWOINE_REPO="https://github.com/Antoine601/Twoine.git"
TWOINE_BRANCH="main"

DEFAULT_INSTALL_DIR="/opt/twoine"
DEFAULT_SITES_DIR="/var/www/twoine"
DEFAULT_LOG_DIR="/var/log/twoine"
DEFAULT_DATA_DIR="/var/lib/twoine"

# Service Ports
API_PORT="3000"
ADMIN_PANEL_PORT="4321"
USER_PANEL_PORT="5432"

# Platform Domain (twoine. prefix mandatory)
PLATFORM_DOMAIN="twoine.example.com"

# Default Admin
DEFAULT_ADMIN_USERNAME="twoineadmin"

NODEJS_VERSION="20"
MONGODB_VERSION="7.0"

MIN_DISK_SPACE_GB=5
MIN_RAM_MB=1024

#-------------------------------------------------------------------------------
# COLORS & OUTPUT
#-------------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

#-------------------------------------------------------------------------------
# MODE FLAGS
#-------------------------------------------------------------------------------

SILENT_MODE=false
DEBUG_MODE=false
DRY_RUN=false
FORCE_MODE=false

#-------------------------------------------------------------------------------
# COLLECTED INPUTS
#-------------------------------------------------------------------------------

ADMIN_USERNAME="$DEFAULT_ADMIN_USERNAME"
ADMIN_PASSWORD=""
ADMIN_EMAIL=""
DOMAIN="$PLATFORM_DOMAIN"
SITES_DIR=""
SERVER_IP=""
CONFIRM_INSTALL=false
SKIP_DNS_CHECK=false

#-------------------------------------------------------------------------------
# SERVICE TRACKING
#-------------------------------------------------------------------------------

SERVICES_INSTALLED=()
SERVICES_STARTED=()

#-------------------------------------------------------------------------------
# HELPER FUNCTIONS
#-------------------------------------------------------------------------------

log_info() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${GREEN}[OK]${NC} $1"
    fi
}

log_warning() {
    if [ "$SILENT_MODE" = false ]; then
        echo -e "${YELLOW}[WARN]${NC} $1"
    fi
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_debug() {
    if [ "$DEBUG_MODE" = true ]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

log_step() {
    if [ "$SILENT_MODE" = false ]; then
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}▶ $1${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
}

execute() {
    log_debug "Executing: $*"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} Would execute: $*"
        return 0
    fi
    "$@"
}

die() {
    log_error "$1"
    exit 1
}

print_banner() {
    if [ "$SILENT_MODE" = false ]; then
        echo ""
        echo -e "${CYAN}"
        echo "  ████████╗██╗    ██╗ ██████╗ ██╗███╗   ██╗███████╗"
        echo "  ╚══██╔══╝██║    ██║██╔═══██╗██║████╗  ██║██╔════╝"
        echo "     ██║   ██║ █╗ ██║██║   ██║██║██╔██╗ ██║█████╗  "
        echo "     ██║   ██║███╗██║██║   ██║██║██║╚██╗██║██╔══╝  "
        echo "     ██║   ╚███╔███╔╝╚██████╔╝██║██║ ╚████║███████╗"
        echo "     ╚═╝    ╚══╝╚══╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝"
        echo -e "${NC}"
        echo -e "  ${GREEN}Self-Hosting Platform Installer v${TWOINE_VERSION}${NC}"
        echo -e "  ${BLUE}Ubuntu 22.04 LTS - Production Ready${NC}"
        echo ""
    fi
}

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -s, --silent      Silent mode (minimal output, requires all params)"
    echo "  -d, --debug       Debug mode (verbose output)"
    echo "  -n, --dry-run     Dry-run mode (show commands without executing)"
    echo "  -f, --force       Force installation (skip some checks)"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Silent mode parameters:"
    echo "  --admin-password  Admin password (required in silent mode)"
    echo "  --admin-email     Admin email (required in silent mode)"
    echo "  --domain          Domain name (optional)"
    echo "  --sites-dir       Sites directory (default: /var/www/twoine)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Interactive installation"
    echo "  $0 --debug                            # Interactive with debug output"
    echo "  $0 --dry-run                          # Show what would be done"
    echo "  $0 -s --admin-password=MyPass123 --admin-email=admin@example.com"
    echo ""
}

#-------------------------------------------------------------------------------
# PARSE ARGUMENTS
#-------------------------------------------------------------------------------

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--silent)
                SILENT_MODE=true
                shift
                ;;
            -d|--debug)
                DEBUG_MODE=true
                shift
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -f|--force)
                FORCE_MODE=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            --admin-password=*)
                ADMIN_PASSWORD="${1#*=}"
                shift
                ;;
            --admin-email=*)
                ADMIN_EMAIL="${1#*=}"
                shift
                ;;
            --domain=*)
                DOMAIN="${1#*=}"
                shift
                ;;
            --sites-dir=*)
                SITES_DIR="${1#*=}"
                shift
                ;;
            --skip-dns-check)
                SKIP_DNS_CHECK=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    if [ "$SILENT_MODE" = true ]; then
        if [ -z "$ADMIN_PASSWORD" ] || [ -z "$ADMIN_EMAIL" ]; then
            die "Silent mode requires --admin-password and --admin-email"
        fi
    fi

    [ -z "$SITES_DIR" ] && SITES_DIR="$DEFAULT_SITES_DIR"
}

#-------------------------------------------------------------------------------
# SYSTEM CHECKS
#-------------------------------------------------------------------------------

check_root() {
    log_info "Checking root privileges..."
    if [ "$EUID" -ne 0 ]; then
        die "This script must be run as root. Use: sudo $0"
    fi
    log_success "Running as root"
}

check_os() {
    log_info "Checking operating system..."
    
    if [ ! -f /etc/os-release ]; then
        die "Cannot determine OS version. /etc/os-release not found."
    fi
    
    source /etc/os-release
    
    log_debug "Detected: $NAME $VERSION_ID"
    
    if [ "$ID" != "ubuntu" ]; then
        die "This script only supports Ubuntu. Detected: $ID"
    fi
    
    if [ "$VERSION_ID" != "22.04" ]; then
        if [ "$FORCE_MODE" = true ]; then
            log_warning "Ubuntu $VERSION_ID detected. Recommended: 22.04. Continuing (forced)..."
        else
            die "This script requires Ubuntu 22.04. Detected: $VERSION_ID. Use --force to bypass."
        fi
    fi
    
    log_success "Ubuntu 22.04 LTS detected"
}

check_existing_installation() {
    log_info "Checking for existing Twoine installation..."
    
    if [ -d "$DEFAULT_INSTALL_DIR" ]; then
        if [ "$FORCE_MODE" = true ]; then
            log_warning "Existing installation found at $DEFAULT_INSTALL_DIR. Will be overwritten (forced)."
        else
            die "Twoine is already installed at $DEFAULT_INSTALL_DIR. Use --force to reinstall."
        fi
    fi
    
    if id "twoine" &>/dev/null; then
        if [ "$FORCE_MODE" = true ]; then
            log_warning "User 'twoine' already exists. Continuing (forced)..."
        else
            die "System user 'twoine' already exists. Use --force to continue."
        fi
    fi
    
    log_success "No existing installation found"
}

check_internet() {
    log_info "Checking internet connectivity..."
    
    if ! ping -c 1 -W 5 8.8.8.8 &>/dev/null; then
        if ! ping -c 1 -W 5 1.1.1.1 &>/dev/null; then
            die "No internet connection detected. Please check your network."
        fi
    fi
    
    log_success "Internet connection available"
}

check_disk_space() {
    log_info "Checking disk space..."
    
    local available_gb
    available_gb=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    
    log_debug "Available disk space: ${available_gb}GB"
    
    if [ "$available_gb" -lt "$MIN_DISK_SPACE_GB" ]; then
        die "Insufficient disk space. Required: ${MIN_DISK_SPACE_GB}GB, Available: ${available_gb}GB"
    fi
    
    log_success "Disk space OK (${available_gb}GB available)"
}

check_ram() {
    log_info "Checking RAM..."
    
    local total_ram_mb
    total_ram_mb=$(free -m | awk 'NR==2 {print $2}')
    
    log_debug "Total RAM: ${total_ram_mb}MB"
    
    if [ "$total_ram_mb" -lt "$MIN_RAM_MB" ]; then
        log_warning "Low RAM detected. Recommended: ${MIN_RAM_MB}MB, Available: ${total_ram_mb}MB"
    else
        log_success "RAM OK (${total_ram_mb}MB available)"
    fi
}

run_system_checks() {
    log_step "ÉTAPE 1: Vérification du système"
    
    check_root
    check_os
    check_existing_installation
    check_internet
    check_disk_space
    check_ram
    
    log_success "Toutes les vérifications système sont passées"
}

#-------------------------------------------------------------------------------
# INTERACTIVE PROMPTS
#-------------------------------------------------------------------------------

prompt_admin_username() {
    echo ""
    echo -e "${CYAN}Configuration du compte administrateur${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    read -p "Nom d'utilisateur admin [$ADMIN_USERNAME]: " input_username
    if [ -n "$input_username" ]; then
        ADMIN_USERNAME="$input_username"
    fi
    
    log_info "Nom d'utilisateur admin: $ADMIN_USERNAME"
}

prompt_admin_password() {
    if [ -n "$ADMIN_PASSWORD" ]; then
        return
    fi
    
    while true; do
        read -sp "Mot de passe admin (min 8 caractères): " ADMIN_PASSWORD
        echo ""
        
        if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
            log_error "Le mot de passe doit contenir au moins 8 caractères"
            continue
        fi
        
        read -sp "Confirmez le mot de passe: " password_confirm
        echo ""
        
        if [ "$ADMIN_PASSWORD" != "$password_confirm" ]; then
            log_error "Les mots de passe ne correspondent pas"
            continue
        fi
        
        break
    done
}

prompt_admin_email() {
    if [ -n "$ADMIN_EMAIL" ]; then
        return
    fi
    
    while true; do
        read -p "Enter admin email: " ADMIN_EMAIL
        
        if [[ ! "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            log_error "Invalid email format"
            continue
        fi
        
        break
    done
}

prompt_domain() {
    if [ -n "$DOMAIN" ] && [ "$SKIP_DNS_CHECK" = true ]; then
        log_info "Domain set to: $DOMAIN (DNS check skipped)"
        return
    fi
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Configuration du domaine Twoine${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Twoine peut être accessible de deux façons :"
    echo "  1. Via un nom de domaine avec le sous-domaine 'twoine' obligatoire"
    echo "     (ex: vous fournissez 'exemple.com' → devient 'twoine.exemple.com')"
    echo "  2. Via l'IP du serveur (ex: https://203.0.113.50)"
    echo ""
    
    read -p "Voulez-vous utiliser un nom de domaine pour accéder à Twoine ? [o/N]: " use_domain
    
    if [[ "$use_domain" =~ ^[OoYy]$ ]]; then
        configure_domain_with_dns_check
    else
        configure_ip_access
    fi
}

get_server_public_ip() {
    local ip=""
    local services=("https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com")
    
    for service in "${services[@]}"; do
        ip=$(curl -s --max-time 5 "$service" 2>/dev/null | tr -d '[:space:]')
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    return 1
}

resolve_domain_dns() {
    local domain="$1"
    local resolvers=("8.8.8.8" "1.1.1.1" "9.9.9.9")
    local resolved_ip=""
    
    for resolver in "${resolvers[@]}"; do
        resolved_ip=$(dig +short +time=5 "@$resolver" "$domain" A 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        if [ -n "$resolved_ip" ]; then
            echo "$resolved_ip"
            return 0
        fi
    done
    
    resolved_ip=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1)
    if [ -n "$resolved_ip" ]; then
        echo "$resolved_ip"
        return 0
    fi
    
    return 1
}

validate_domain_format() {
    local domain="$1"
    local regex='^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
    [[ "$domain" =~ $regex ]]
}

configure_domain_with_dns_check() {
    SERVER_IP=$(get_server_public_ip)
    if [ -z "$SERVER_IP" ]; then
        log_error "Impossible de déterminer l'IP publique du serveur."
        log_info "Vérifiez votre connexion internet."
        configure_ip_access
        return
    fi
    
    echo ""
    echo -e "${BLUE}IP publique détectée : ${GREEN}$SERVER_IP${NC}"
    echo ""
    
    while true; do
        local base_domain
        if [ -n "$DOMAIN" ]; then
            log_info "Domaine pré-configuré: $DOMAIN"
        else
            read -p "Entrez votre nom de domaine de base (ex: exemple.com) : " base_domain
            
            if [ -z "$base_domain" ]; then
                log_warning "Domaine vide. Passage en mode IP."
                configure_ip_access
                return
            fi
            
            # Construction automatique avec le sous-domaine obligatoire "twoine"
            DOMAIN="twoine.${base_domain}"
            log_info "Domaine Twoine configuré : $DOMAIN"
        fi
        
        if [ -z "$DOMAIN" ]; then
            log_warning "Domaine vide. Passage en mode IP."
            configure_ip_access
            return
        fi
        
        if ! validate_domain_format "$DOMAIN"; then
            log_error "Format de domaine invalide."
            echo "Exemples valides de domaines de base : exemple.com, monsite.fr"
            DOMAIN=""
            continue
        fi
        
        echo ""
        log_info "Vérification DNS pour $DOMAIN..."
        
        local resolved_ip
        resolved_ip=$(resolve_domain_dns "$DOMAIN")
        
        if [ -z "$resolved_ip" ]; then
            echo ""
            log_error "Le domaine $DOMAIN ne peut pas être résolu."
            echo ""
            echo "Actions requises :"
            echo "  1. Créez un enregistrement DNS de type A pour le sous-domaine 'twoine' :"
            echo "     Nom/Host : twoine"
            echo "     Type     : A"
            echo "     Valeur   : $SERVER_IP"
            echo "     TTL      : 3600 (ou défaut)"
            echo ""
            echo "  2. Attendez la propagation DNS (5-60 minutes)"
            echo "  3. Relancez l'installation"
            echo ""
            read -p "Réessayer maintenant ? [o/N]: " retry
            if [[ ! "$retry" =~ ^[OoYy]$ ]]; then
                DOMAIN=""
                configure_ip_access
                return
            fi
            DOMAIN=""
            continue
        fi
        
        if [ "$resolved_ip" = "$SERVER_IP" ]; then
            log_success "Le domaine $DOMAIN pointe vers $SERVER_IP"
            break
        else
            echo ""
            log_error "Le domaine $DOMAIN pointe vers $resolved_ip"
            echo "           mais ce serveur a l'IP $SERVER_IP"
            echo ""
            echo "Actions requises :"
            echo "  1. Modifiez l'enregistrement DNS de type A pour le sous-domaine 'twoine' :"
            echo "     Nom/Host : twoine"
            echo "     Type     : A"
            echo "     Valeur   : $SERVER_IP  (au lieu de $resolved_ip)"
            echo ""
            echo "  2. Attendez la propagation DNS"
            echo "  3. Relancez l'installation"
            echo ""
            read -p "Réessayer maintenant ? [o/N]: " retry
            if [[ ! "$retry" =~ ^[OoYy]$ ]]; then
                DOMAIN=""
                configure_ip_access
                return
            fi
            DOMAIN=""
            continue
        fi
    done
}

configure_ip_access() {
    if [ -z "$SERVER_IP" ]; then
        SERVER_IP=$(get_server_public_ip)
        if [ -z "$SERVER_IP" ]; then
            SERVER_IP=$(hostname -I | awk '{print $1}')
        fi
    fi
    
    DOMAIN=""
    echo ""
    log_info "Twoine sera accessible via : https://$SERVER_IP"
    log_warning "Un certificat auto-signé sera généré."
    echo "        Vous pourrez configurer un domaine plus tard via l'interface admin."
    echo ""
}

prompt_hostname() {
    local current_hostname
    current_hostname=$(hostname)
    
    echo ""
    echo -e "${CYAN}Configuration du Hostname${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Hostname actuel : ${GREEN}$current_hostname${NC}"
    
    if [ -n "$DOMAIN" ]; then
        echo -e "Domaine Twoine  : ${GREEN}$DOMAIN${NC}"
        
        if [ "$current_hostname" != "$DOMAIN" ]; then
            read -p "Voulez-vous synchroniser le hostname avec le domaine ? [O/n]: " sync_hostname
            
            if [[ ! "$sync_hostname" =~ ^[Nn]$ ]]; then
                log_info "Modification du hostname en $DOMAIN..."
                hostnamectl set-hostname "$DOMAIN"
                
                local short_hostname
                short_hostname=$(echo "$DOMAIN" | cut -d'.' -f1)
                
                if ! grep -q "127.0.1.1" /etc/hosts; then
                    echo "127.0.1.1    $DOMAIN $short_hostname" >> /etc/hosts
                else
                    sed -i "s/^127\.0\.1\.1.*/127.0.1.1    $DOMAIN $short_hostname/" /etc/hosts
                fi
                
                log_success "Hostname modifié"
            fi
        else
            log_success "Hostname déjà synchronisé avec le domaine"
        fi
    fi
}

prompt_sites_directory() {
    echo ""
    echo -e "${CYAN}Sites Directory${NC}"
    echo "━━━━━━━━━━━━━━━━"
    
    read -p "Sites root directory [$SITES_DIR]: " input_sites_dir
    
    if [ -n "$input_sites_dir" ]; then
        SITES_DIR="$input_sites_dir"
    fi
    
    log_info "Sites will be stored in: $SITES_DIR"
}

prompt_confirmation() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  RÉSUMÉ DE L'INSTALLATION${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Compte Admin${NC}"
    echo "    Utilisateur:     $ADMIN_USERNAME"
    echo "    Email:           $ADMIN_EMAIL"
    echo ""
    echo -e "  ${GREEN}Configuration${NC}"
    echo "    Domaine:         ${DOMAIN:-"(accès par IP)"}"
    echo "    Répertoire:      $DEFAULT_INSTALL_DIR"
    echo "    Sites:           $SITES_DIR"
    echo ""
    echo -e "  ${GREEN}Services & Ports${NC}"
    echo "    API Backend:     port $API_PORT"
    echo "    Admin Panel:     port $ADMIN_PANEL_PORT"
    echo "    User Panel:      port $USER_PANEL_PORT"
    echo ""
    echo -e "  ${GREEN}Versions${NC}"
    echo "    Node.js:         $NODEJS_VERSION.x LTS"
    echo "    MongoDB:         $MONGODB_VERSION"
    echo ""
    
    if [ "$SILENT_MODE" = true ]; then
        CONFIRM_INSTALL=true
        return
    fi
    
    read -p "Procéder à l'installation ? [o/N]: " confirm
    
    if [[ "$confirm" =~ ^[OoYy]$ ]]; then
        CONFIRM_INSTALL=true
    else
        die "Installation annulée par l'utilisateur"
    fi
}

run_interactive_prompts() {
    log_step "ÉTAPE 2: Configuration"
    
    prompt_admin_username
    prompt_admin_password
    prompt_admin_email
    prompt_domain
    prompt_hostname
    prompt_sites_directory
    prompt_confirmation
}

#-------------------------------------------------------------------------------
# INSTALL DEPENDENCIES
#-------------------------------------------------------------------------------

update_system() {
    log_info "Updating system packages..."
    execute apt-get update -y
    execute apt-get upgrade -y
    log_success "System updated"
}

install_base_packages() {
    log_info "Installing base packages..."
    execute apt-get install -y \
        curl \
        wget \
        git \
        gnupg \
        ca-certificates \
        lsb-release \
        software-properties-common \
        build-essential \
        openssh-server \
        ufw \
        openssl \
        acl \
        htop \
        unzip \
        dnsutils
    log_success "Base packages installed"
}

install_nodejs() {
    log_info "Installing Node.js ${NODEJS_VERSION}.x LTS..."
    
    if command -v node &>/dev/null; then
        local current_version
        current_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        log_debug "Current Node.js version: $current_version"
        
        if [ "$current_version" -ge "$NODEJS_VERSION" ]; then
            log_success "Node.js already installed ($(node -v))"
            return
        fi
    fi
    
    execute curl -fsSL https://deb.nodesource.com/setup_${NODEJS_VERSION}.x | bash -
    execute apt-get install -y nodejs
    
    log_success "Node.js installed ($(node -v))"
    log_success "npm installed ($(npm -v))"
}

install_mongodb() {
    log_info "Installing MongoDB ${MONGODB_VERSION}..."
    
    if command -v mongod &>/dev/null; then
        log_success "MongoDB already installed"
        return
    fi
    
    execute curl -fsSL https://www.mongodb.org/static/pgp/server-${MONGODB_VERSION}.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg --dearmor
    
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-${MONGODB_VERSION}.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/${MONGODB_VERSION} multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-${MONGODB_VERSION}.list
    
    execute apt-get update -y
    execute apt-get install -y mongodb-org
    
    execute systemctl start mongod
    execute systemctl enable mongod
    
    log_success "MongoDB installed and started"
}

install_nginx() {
    log_info "Installing Nginx..."
    
    execute apt-get install -y nginx
    execute systemctl start nginx
    execute systemctl enable nginx
    
    log_success "Nginx installed and started"
}

run_install_dependencies() {
    log_step "ÉTAPE 3: Installation des dépendances"
    
    update_system
    install_base_packages
    install_nodejs
    install_mongodb
    install_nginx
    
    log_success "Toutes les dépendances installées"
}

#-------------------------------------------------------------------------------
# CREATE SYSTEM STRUCTURE
#-------------------------------------------------------------------------------

create_twoine_user() {
    log_info "Creating system user 'twoine'..."
    
    if id "twoine" &>/dev/null; then
        log_warning "User 'twoine' already exists"
    else
        execute useradd -r -m -d /home/twoine -s /bin/bash -c "Twoine System User" twoine
        log_success "System user 'twoine' created"
    fi
    
    execute usermod -aG www-data twoine
}

create_directories() {
    log_info "Création de l'arborescence..."
    
    local dirs=(
        "$DEFAULT_INSTALL_DIR"
        "$DEFAULT_INSTALL_DIR/config"
        "$DEFAULT_INSTALL_DIR/ssl"
        "$DEFAULT_INSTALL_DIR/tmp"
        "$DEFAULT_INSTALL_DIR/backups"
        "$DEFAULT_INSTALL_DIR/scripts"
        "$DEFAULT_DATA_DIR"
        "$DEFAULT_DATA_DIR/uploads"
        "$DEFAULT_DATA_DIR/sessions"
        "$SITES_DIR"
        "$DEFAULT_LOG_DIR"
        "$DEFAULT_LOG_DIR/nginx"
        "$DEFAULT_LOG_DIR/api"
        "$DEFAULT_LOG_DIR/admin-panel"
        "$DEFAULT_LOG_DIR/user-panel"
        "$DEFAULT_LOG_DIR/worker"
        "$DEFAULT_LOG_DIR/supervisor"
        "$DEFAULT_LOG_DIR/metrics"
    )
    
    for dir in "${dirs[@]}"; do
        execute mkdir -p "$dir"
        log_debug "Créé: $dir"
    done
    
    log_success "Arborescence créée"
}

set_permissions() {
    log_info "Configuration des permissions..."
    
    execute chown -R twoine:twoine "$DEFAULT_INSTALL_DIR"
    execute chown -R twoine:twoine "$SITES_DIR"
    execute chown -R twoine:twoine "$DEFAULT_LOG_DIR"
    execute chown -R twoine:twoine "$DEFAULT_DATA_DIR"
    
    execute chmod 750 "$DEFAULT_INSTALL_DIR"
    execute chmod 750 "$SITES_DIR"
    execute chmod 750 "$DEFAULT_LOG_DIR"
    execute chmod 750 "$DEFAULT_DATA_DIR"
    execute chmod 700 "$DEFAULT_INSTALL_DIR/config"
    execute chmod 700 "$DEFAULT_INSTALL_DIR/ssl"
    execute chmod 700 "$DEFAULT_DATA_DIR/sessions"
    
    log_success "Permissions configurées"
}

generate_ssl_certificate() {
    log_info "Generating self-signed SSL certificate..."
    
    local ssl_dir="$DEFAULT_INSTALL_DIR/ssl"
    local cn="${DOMAIN:-localhost}"
    
    # Build Subject Alternative Names (SAN)
    local san="DNS:localhost,IP:127.0.0.1"
    
    if [ -n "$DOMAIN" ]; then
        san="DNS:$DOMAIN,DNS:www.$DOMAIN,$san"
    fi
    
    if [ -n "$SERVER_IP" ]; then
        san="$san,IP:$SERVER_IP"
    else
        local detected_ip
        detected_ip=$(get_server_public_ip 2>/dev/null)
        if [ -n "$detected_ip" ]; then
            san="$san,IP:$detected_ip"
        fi
    fi
    
    log_debug "SSL SAN: $san"
    
    # Create OpenSSL config for SAN support
    local ssl_conf="$ssl_dir/openssl.cnf"
    cat > "$ssl_conf" << SSLCONF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = XX
ST = State
L = City
O = Twoine
OU = Platform
CN = $cn

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = $san
SSLCONF

    if [ "$DRY_RUN" = false ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$ssl_dir/twoine.key" \
            -out "$ssl_dir/twoine.crt" \
            -config "$ssl_conf" \
            2>/dev/null
        
        rm -f "$ssl_conf"
        
        chmod 600 "$ssl_dir/twoine.key"
        chmod 644 "$ssl_dir/twoine.crt"
        chown twoine:twoine "$ssl_dir/twoine.key" "$ssl_dir/twoine.crt"
    fi
    
    log_success "Self-signed SSL certificate generated (CN=$cn)"
}

setup_mongodb_user() {
    log_info "Creating MongoDB user for Twoine..."
    
    local mongo_password
    mongo_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    
    if [ "$DRY_RUN" = false ]; then
        # ── Step 1: Enable MongoDB authorization if not already enabled ──
        local mongod_conf="/etc/mongod.conf"
        if [ -f "$mongod_conf" ]; then
            if ! grep -q "^security:" "$mongod_conf"; then
                log_info "  → Enabling MongoDB authorization..."
                echo "" >> "$mongod_conf"
                echo "security:" >> "$mongod_conf"
                echo "  authorization: enabled" >> "$mongod_conf"
                log_success "  MongoDB authorization enabled in $mongod_conf"
            elif ! grep -q "authorization: enabled" "$mongod_conf"; then
                log_info "  → Enabling MongoDB authorization..."
                sed -i '/^security:/a\  authorization: enabled' "$mongod_conf"
                log_success "  MongoDB authorization enabled in $mongod_conf"
            else
                log_info "  → MongoDB authorization already enabled"
            fi
        else
            log_warning "  MongoDB config not found at $mongod_conf"
        fi

        # ── Step 2: Create or update the MongoDB user (BEFORE restarting with auth) ──
        # Connect directly to 'twoine' database (not 'use twoine' which is unreliable in --eval)
        log_info "  → Creating MongoDB user 'twoine'..."
        local create_output
        create_output=$(mongosh --quiet twoine --eval "
            try {
                db.createUser({
                    user: 'twoine',
                    pwd: '${mongo_password}',
                    roles: [{ role: 'readWrite', db: 'twoine' }]
                });
                print('USER_CREATED');
            } catch (e) {
                if (e.codeName === 'DuplicateKey' || e.code === 51003 || String(e).includes('already exists')) {
                    db.changeUserPassword('twoine', '${mongo_password}');
                    print('PASSWORD_UPDATED');
                } else {
                    print('ERROR: ' + e.message);
                }
            }
        " 2>&1)
        
        case "$create_output" in
            *USER_CREATED*)    log_success "  MongoDB user 'twoine' created" ;;
            *PASSWORD_UPDATED*) log_info "  MongoDB user 'twoine' already existed — password updated" ;;
            *)                 log_warning "  MongoDB user creation output: $create_output" ;;
        esac

        # ── Step 3: Restart MongoDB to apply authorization ──
        log_info "  → Restarting MongoDB with authorization..."
        systemctl restart mongod
        sleep 3
        
        if ! systemctl is-active --quiet mongod; then
            log_error "  MongoDB failed to restart! Checking config..."
            journalctl -u mongod -n 5 --no-pager
            die "MongoDB failed to restart after enabling authorization"
        fi
        log_success "  MongoDB restarted with authorization"

        # ── Step 4: Verify authentication works ──
        log_info "  → Verifying MongoDB authentication..."
        if mongosh --quiet \
            "mongodb://twoine:${mongo_password}@localhost:27017/twoine?authSource=twoine" \
            --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
            log_success "  MongoDB authentication verified successfully"
        else
            log_warning "  First auth check failed — retrying user creation with auth disabled..."
            # Temporarily disable auth, recreate user, re-enable
            sed -i 's/^  authorization: enabled/  authorization: disabled/' "$mongod_conf"
            systemctl restart mongod
            sleep 2
            
            mongosh --quiet twoine --eval "
                try { db.dropUser('twoine'); } catch(e) {}
                db.createUser({
                    user: 'twoine',
                    pwd: '${mongo_password}',
                    roles: [{ role: 'readWrite', db: 'twoine' }]
                });
                print('USER_RECREATED');
            " 2>&1 | tee /dev/stderr
            
            sed -i 's/^  authorization: disabled/  authorization: enabled/' "$mongod_conf"
            systemctl restart mongod
            sleep 3
            
            if mongosh --quiet \
                "mongodb://twoine:${mongo_password}@localhost:27017/twoine?authSource=twoine" \
                --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
                log_success "  MongoDB authentication verified (after retry)"
            else
                log_error "  MongoDB authentication STILL FAILED after retry"
                log_error "  URI: mongodb://twoine:***@localhost:27017/twoine?authSource=twoine"
                log_error "  Manual fix: mongosh twoine --eval \"db.createUser({user:'twoine',pwd:'PASSWORD',roles:[{role:'readWrite',db:'twoine'}]})\""
            fi
        fi
    fi
    
    # Save password (always in sync with what was set in MongoDB)
    echo "$mongo_password" > "$DEFAULT_INSTALL_DIR/config/.mongo_password"
    chmod 600 "$DEFAULT_INSTALL_DIR/config/.mongo_password"
    chown twoine:twoine "$DEFAULT_INSTALL_DIR/config/.mongo_password"
    
    log_success "MongoDB user configured"
}

run_create_structure() {
    log_step "ÉTAPE 4: Création de la structure système"
    
    create_twoine_user
    create_directories
    set_permissions
    generate_ssl_certificate
    setup_mongodb_user
    
    log_success "Structure système créée"
}

#-------------------------------------------------------------------------------
# INSTALL APPLICATION
#-------------------------------------------------------------------------------

clone_repository() {
    log_info "Clonage du repository Twoine depuis GitHub..."
    
    if [ -d "$DEFAULT_INSTALL_DIR/app" ]; then
        log_warning "Le répertoire app existe, suppression..."
        execute rm -rf "$DEFAULT_INSTALL_DIR/app"
    fi
    
    if [ "$DRY_RUN" = false ]; then
        log_info "Clonage depuis: $TWOINE_REPO"
        execute git clone --branch "$TWOINE_BRANCH" --depth 1 \
            "$TWOINE_REPO" "$DEFAULT_INSTALL_DIR/app" 2>/dev/null || {
            log_warning "Repository non disponible, utilisation des fichiers locaux..."
            copy_local_files
        }
    else
        log_info "[DRY-RUN] Would clone: $TWOINE_REPO"
    fi
    
    log_success "Code source prêt"
}

copy_local_files() {
    log_info "Copie des fichiers locaux..."
    
    mkdir -p "$DEFAULT_INSTALL_DIR/app"
    
    # Copy main application files
    if [ -d "$SCRIPT_DIR/src" ]; then
        cp -r "$SCRIPT_DIR/src" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    if [ -f "$SCRIPT_DIR/package.json" ]; then
        cp "$SCRIPT_DIR/package.json" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    # Copy admin panel
    if [ -d "$SCRIPT_DIR/admin-panel" ]; then
        cp -r "$SCRIPT_DIR/admin-panel" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    # Copy user panel
    if [ -d "$SCRIPT_DIR/user-panel" ]; then
        cp -r "$SCRIPT_DIR/user-panel" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    # Copy scripts
    if [ -d "$SCRIPT_DIR/scripts" ]; then
        cp -r "$SCRIPT_DIR/scripts" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    # Copy config templates
    if [ -d "$SCRIPT_DIR/config" ]; then
        cp -r "$SCRIPT_DIR/config" "$DEFAULT_INSTALL_DIR/app/"
    fi
    
    chown -R twoine:twoine "$DEFAULT_INSTALL_DIR/app"
    
    log_success "Fichiers locaux copiés"
}

# NOTE: Placeholder app removed - the real application is in src/app.js
# If git clone fails, copy_local_files() is used instead.

generate_env_file() {
    log_info "Generating environment configuration..."
    
    local jwt_secret
    local session_secret
    local mongo_password
    
    jwt_secret=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
    session_secret=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
    
    if [ -f "$DEFAULT_INSTALL_DIR/config/.mongo_password" ]; then
        mongo_password=$(cat "$DEFAULT_INSTALL_DIR/config/.mongo_password")
    else
        mongo_password=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    fi
    
    cat > "$DEFAULT_INSTALL_DIR/app/.env" << ENVFILE
# Twoine Configuration
# Generated: $(date -Iseconds)

# Application
NODE_ENV=production
PORT=${API_PORT}
TWOINE_VERSION=${TWOINE_VERSION}

# Security
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=24h
SESSION_SECRET=${session_secret}

# MongoDB
MONGODB_URI=mongodb://twoine:${mongo_password}@localhost:27017/twoine?authSource=twoine

# Paths
SITES_DIR=${SITES_DIR}
LOG_DIR=${DEFAULT_LOG_DIR}
INSTALL_DIR=${DEFAULT_INSTALL_DIR}

# Admin
ADMIN_EMAIL=${ADMIN_EMAIL}

# Domain (empty for IP-based access)
DOMAIN=${DOMAIN}

# Email (SMTP - configure later via admin panel)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Metrics
METRICS_RETENTION_DAYS=30
ENVFILE

    chmod 600 "$DEFAULT_INSTALL_DIR/app/.env"
    chown twoine:twoine "$DEFAULT_INSTALL_DIR/app/.env"
    
    log_success "Environment file generated"
}

hash_admin_password() {
    log_info "Hashing admin password..."
    
    local hashed_password
    
    if [ "$DRY_RUN" = false ]; then
        hashed_password=$(node -e "
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('${ADMIN_PASSWORD}', 12);
            console.log(hash);
        " 2>/dev/null || echo "PLACEHOLDER_HASH")
        
        echo "$hashed_password" > "$DEFAULT_INSTALL_DIR/config/.admin_hash"
        chmod 600 "$DEFAULT_INSTALL_DIR/config/.admin_hash"
        chown twoine:twoine "$DEFAULT_INSTALL_DIR/config/.admin_hash"
    fi
    
    log_success "Admin password secured"
}

install_npm_dependencies() {
    log_info "Installation des dépendances Node.js..."
    
    if [ "$DRY_RUN" = false ]; then
        # Install API dependencies
        log_info "  → API Backend..."
        cd "$DEFAULT_INSTALL_DIR/app"
        execute npm install --production 2>/dev/null || npm install
        cd - > /dev/null
        
        # Install and build Admin Panel
        if [ -d "$DEFAULT_INSTALL_DIR/app/admin-panel" ]; then
            log_info "  → Admin Panel..."
            cd "$DEFAULT_INSTALL_DIR/app/admin-panel"
            execute npm install 2>/dev/null || npm install
            cd - > /dev/null
        fi
        
        # Install and build User Panel
        if [ -d "$DEFAULT_INSTALL_DIR/app/user-panel" ]; then
            log_info "  → User Panel..."
            cd "$DEFAULT_INSTALL_DIR/app/user-panel"
            execute npm install 2>/dev/null || npm install
            cd - > /dev/null
        fi
    fi
    
    log_success "Dépendances installées"
}

build_frontend_panels() {
    log_info "Construction des interfaces frontend..."
    
    if [ "$DRY_RUN" = false ]; then
        # Build Admin Panel
        if [ -d "$DEFAULT_INSTALL_DIR/app/admin-panel" ]; then
            log_info "  → Build Admin Panel (port $ADMIN_PANEL_PORT)..."
            cd "$DEFAULT_INSTALL_DIR/app/admin-panel"
            
            # Create .env for admin panel
            cat > .env << ADMINENV
VITE_API_URL=https://${DOMAIN:-localhost}/api
VITE_APP_NAME=Twoine Admin
VITE_APP_VERSION=$TWOINE_VERSION
PORT=$ADMIN_PANEL_PORT
ADMINENV
            
            execute npm run build 2>/dev/null || log_warning "Admin panel build skipped"
            cd - > /dev/null
        fi
        
        # Build User Panel
        if [ -d "$DEFAULT_INSTALL_DIR/app/user-panel" ]; then
            log_info "  → Build User Panel (port $USER_PANEL_PORT)..."
            cd "$DEFAULT_INSTALL_DIR/app/user-panel"
            
            # Create .env for user panel
            cat > .env << USERENV
VITE_API_URL=https://${DOMAIN:-localhost}/api
VITE_APP_NAME=Twoine
VITE_APP_VERSION=$TWOINE_VERSION
PORT=$USER_PANEL_PORT
USERENV
            
            execute npm run build 2>/dev/null || log_warning "User panel build skipped"
            cd - > /dev/null
        fi
    fi
    
    chown -R twoine:twoine "$DEFAULT_INSTALL_DIR/app"
    
    log_success "Interfaces frontend construites"
}

run_install_application() {
    log_step "ÉTAPE 5: Installation de l'application"
    
    clone_repository
    install_npm_dependencies
    build_frontend_panels
    generate_env_file
    hash_admin_password
    
    log_success "Application installée"
}

#-------------------------------------------------------------------------------
# CONFIGURE SYSTEMD SERVICES
#-------------------------------------------------------------------------------

create_api_service() {
    log_info "  → Service API Backend (twoine-api)..."
    
    cat > /etc/systemd/system/twoine-api.service << SYSTEMD
[Unit]
Description=Twoine API Backend
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service
Requires=mongod.service
PartOf=twoine.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=${DEFAULT_INSTALL_DIR}/app
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-api

Environment=NODE_ENV=production
Environment=PORT=${API_PORT}
EnvironmentFile=-${DEFAULT_INSTALL_DIR}/app/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${SITES_DIR} ${DEFAULT_LOG_DIR} ${DEFAULT_INSTALL_DIR}/tmp ${DEFAULT_DATA_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD

    SERVICES_INSTALLED+=("twoine-api")
}

create_admin_panel_service() {
    log_info "  → Admin Panel: servi en statique via Nginx (pas de service systemd)"
    # Admin panel is built to static files and served directly by Nginx.
    # No systemd service needed - the built files are in:
    #   ${DEFAULT_INSTALL_DIR}/app/admin-panel/dist/
    # Nginx serves them at /admin/
}

create_user_panel_service() {
    log_info "  → User Panel: servi en statique via Nginx (pas de service systemd)"
    # User panel is built to static files and served directly by Nginx.
    # No systemd service needed - the built files are in:
    #   ${DEFAULT_INSTALL_DIR}/app/user-panel/dist/
    # Nginx serves them at /
}

create_worker_service() {
    log_info "  → Service Worker (twoine-worker)..."
    
    cat > /etc/systemd/system/twoine-worker.service << SYSTEMD
[Unit]
Description=Twoine Background Worker
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service twoine-api.service
Wants=twoine-api.service
PartOf=twoine.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=${DEFAULT_INSTALL_DIR}/app
ExecStart=/usr/bin/node src/worker.js
Restart=always
RestartSec=15
TimeoutStartSec=30
TimeoutStopSec=60

StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-worker

Environment=NODE_ENV=production
EnvironmentFile=-${DEFAULT_INSTALL_DIR}/app/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${SITES_DIR} ${DEFAULT_LOG_DIR} ${DEFAULT_INSTALL_DIR}/tmp ${DEFAULT_DATA_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD

    SERVICES_INSTALLED+=("twoine-worker")
}

create_supervisor_service() {
    log_info "  → Service Supervisor (twoine-supervisor)..."
    
    cat > /etc/systemd/system/twoine-supervisor.service << SYSTEMD
[Unit]
Description=Twoine Service Supervisor & Monitor
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service twoine-api.service
Wants=twoine-api.service
PartOf=twoine.target
StartLimitIntervalSec=120
StartLimitBurst=3

[Service]
Type=simple
User=twoine
Group=twoine
WorkingDirectory=${DEFAULT_INSTALL_DIR}/app
ExecStart=/usr/bin/node src/monitor.js
Restart=always
RestartSec=15
TimeoutStartSec=30
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=twoine-supervisor

Environment=NODE_ENV=production
EnvironmentFile=-${DEFAULT_INSTALL_DIR}/app/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${SITES_DIR} ${DEFAULT_LOG_DIR} ${DEFAULT_LOG_DIR}/metrics ${DEFAULT_DATA_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD

    SERVICES_INSTALLED+=("twoine-supervisor")
}

create_twoine_target() {
    log_info "  → Target Twoine (twoine.target)..."
    
    cat > /etc/systemd/system/twoine.target << SYSTEMD
[Unit]
Description=Twoine Platform Services
Documentation=https://github.com/Antoine601/Twoine
After=network.target mongod.service
Requires=mongod.service
Wants=twoine-api.service twoine-worker.service twoine-supervisor.service

[Install]
WantedBy=multi-user.target
SYSTEMD
}

enable_and_start_services() {
    log_info "Activation et démarrage des services..."
    
    execute systemctl daemon-reload
    
    # Enable all services
    for service in "${SERVICES_INSTALLED[@]}"; do
        execute systemctl enable "$service.service" 2>/dev/null || true
    done
    
    execute systemctl enable twoine.target 2>/dev/null || true
    
    # Start services in order
    log_info "  → Démarrage twoine-api..."
    execute systemctl start twoine-api.service
    
    # Wait for API to actually listen on port
    log_info "  → Vérification que l'API écoute sur le port ${API_PORT}..."
    local api_ready=false
    for i in $(seq 1 15); do
        if ss -tlnp 2>/dev/null | grep -q ":${API_PORT} " || \
           curl -sf http://localhost:${API_PORT}/health >/dev/null 2>&1; then
            api_ready=true
            break
        fi
        sleep 1
    done
    
    if [ "$api_ready" = true ]; then
        log_success "  ✓ API écoute sur le port ${API_PORT}"
    else
        log_error "  ✗ API ne répond PAS sur le port ${API_PORT} après 15s"
        log_error "    Vérifiez les logs: journalctl -u twoine-api -n 50"
        log_error "    Vérifiez le .env: cat ${DEFAULT_INSTALL_DIR}/app/.env"
    fi
    
    log_info "  → Démarrage twoine-worker..."
    execute systemctl start twoine-worker.service
    
    log_info "  → Démarrage twoine-supervisor..."
    execute systemctl start twoine-supervisor.service
    
    log_info "  → Admin et User panels servis en statique via Nginx (pas de service)"
    
    # Track started services
    for service in "${SERVICES_INSTALLED[@]}"; do
        if systemctl is-active --quiet "$service.service" 2>/dev/null; then
            SERVICES_STARTED+=("$service")
        fi
    done
    
    log_success "Services démarrés: ${#SERVICES_STARTED[@]}/${#SERVICES_INSTALLED[@]}"
}

run_configure_systemd() {
    log_step "ÉTAPE 6: Configuration des services systemd"
    
    create_api_service
    create_admin_panel_service
    create_user_panel_service
    create_worker_service
    create_supervisor_service
    create_twoine_target
    enable_and_start_services
    
    log_success "Services systemd configurés"
}

#-------------------------------------------------------------------------------
# CONFIGURE NGINX
#-------------------------------------------------------------------------------

configure_nginx() {
    log_info "Configuration de Nginx..."
    
    local server_name="${DOMAIN:-_}"
    
    rm -f /etc/nginx/sites-enabled/default
    
    # Rate limiting configuration
    cat > /etc/nginx/conf.d/twoine-ratelimit.conf << RATELIMIT
# Twoine Rate Limiting Zones
limit_req_zone \$binary_remote_addr zone=twoine_api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=twoine_login:10m rate=5r/m;
limit_req_zone \$binary_remote_addr zone=twoine_general:10m rate=30r/s;
RATELIMIT

    cat > /etc/nginx/sites-available/twoine << NGINXCONF
# ============================================================================
# TWOINE PLATFORM - Nginx Configuration
# Generated: $(date -Iseconds)
# Domain: ${server_name}
# ============================================================================

# Upstream servers
upstream twoine_api {
    server 127.0.0.1:${API_PORT};
    keepalive 64;
}

# Admin and User panels are served as static files (no upstream needed)

# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};
    
    # Let's Encrypt ACME Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Main HTTPS Server - User Panel (default)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${server_name};

    # SSL Configuration
    ssl_certificate ${DEFAULT_INSTALL_DIR}/ssl/twoine.crt;
    ssl_certificate_key ${DEFAULT_INSTALL_DIR}/ssl/twoine.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:TwoineSSL:10m;
    ssl_session_tickets off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;

    # Logging
    access_log ${DEFAULT_LOG_DIR}/nginx/access.log;
    error_log ${DEFAULT_LOG_DIR}/nginx/error.log;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml application/rss+xml application/atom+xml image/svg+xml;

    # Client Settings
    client_max_body_size 100M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy Settings (global)
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # =========================================================================
    # API Backend Routes
    # =========================================================================
    
    # Authentication - strict rate limiting
    location /api/auth/ {
        limit_req zone=twoine_login burst=3 nodelay;
        limit_req_status 429;
        proxy_pass http://twoine_api;
    }

    # API endpoints
    location /api/ {
        limit_req zone=twoine_api burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://twoine_api;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://twoine_api;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        access_log off;
        proxy_pass http://twoine_api/api/health;
    }

    # =========================================================================
    # Admin Panel (static files from build)
    # =========================================================================
    
    location /admin/ {
        alias ${DEFAULT_INSTALL_DIR}/app/admin-panel/dist/;
        try_files \$uri \$uri/ /admin/index.html;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /admin {
        return 301 /admin/;
    }

    # =========================================================================
    # User Panel (static files from build - default root)
    # =========================================================================
    
    location / {
        root ${DEFAULT_INSTALL_DIR}/app/user-panel/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg|eot)$ {
        root ${DEFAULT_INSTALL_DIR}/app/user-panel/dist;
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Block sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Block common exploit paths
    location ~* (\.php|\.asp|\.aspx|\.jsp|\.cgi)$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINXCONF

    execute ln -sf /etc/nginx/sites-available/twoine /etc/nginx/sites-enabled/twoine
    
    # Test nginx configuration
    if nginx -t 2>/dev/null; then
        execute systemctl reload nginx
        log_success "Nginx configuré et rechargé"
    else
        log_error "Erreur de configuration Nginx"
        nginx -t
        die "Configuration Nginx invalide"
    fi
}

run_configure_nginx() {
    log_step "ÉTAPE 7: Configuration de Nginx"
    
    configure_nginx
    
    log_success "Nginx configuré"
}

#-------------------------------------------------------------------------------
# CONFIGURE FIREWALL
#-------------------------------------------------------------------------------

configure_firewall() {
    log_info "Configuration du pare-feu UFW..."
    
    execute ufw --force reset
    
    execute ufw default deny incoming
    execute ufw default allow outgoing
    
    execute ufw allow ssh
    execute ufw allow http
    execute ufw allow https
    
    execute ufw --force enable
    
    log_success "Pare-feu configuré (SSH, HTTP, HTTPS autorisés)"
}

run_configure_firewall() {
    log_step "ÉTAPE 8: Configuration du pare-feu"
    
    configure_firewall
    
    log_success "Pare-feu configuré"
}

#-------------------------------------------------------------------------------
# FINALIZATION
#-------------------------------------------------------------------------------

create_admin_user() {
    log_info "Création du compte administrateur initial..."
    
    local admin_hash
    if [ -f "$DEFAULT_INSTALL_DIR/config/.admin_hash" ]; then
        admin_hash=$(cat "$DEFAULT_INSTALL_DIR/config/.admin_hash")
    else
        admin_hash="PLACEHOLDER"
    fi
    
    if [ "$DRY_RUN" = false ]; then
        mongosh --quiet twoine --eval "
            db.users.insertOne({
                username: '${ADMIN_USERNAME}',
                email: '${ADMIN_EMAIL}',
                password: '${admin_hash}',
                role: 'admin',
                active: true,
                permissions: {
                    sites: { create: true, read: true, update: true, delete: true },
                    users: { create: true, read: true, update: true, delete: true },
                    services: { create: true, read: true, update: true, delete: true },
                    domains: { create: true, read: true, update: true, delete: true },
                    databases: { create: true, read: true, update: true, delete: true },
                    system: { read: true, update: true }
                },
                createdAt: new Date(),
                updatedAt: new Date()
            });
        " 2>/dev/null || log_warning "Le compte admin existe peut-être déjà"
    fi
    
    rm -f "$DEFAULT_INSTALL_DIR/config/.admin_hash"
    
    log_success "Compte administrateur '$ADMIN_USERNAME' créé"
}

setup_service_management() {
    log_info "Setting up service management scripts..."
    
    local scripts_dir="$DEFAULT_INSTALL_DIR/scripts"
    local source_scripts_dir="$DEFAULT_INSTALL_DIR/app/scripts"

    if [ ! -d "$source_scripts_dir" ]; then
        source_scripts_dir="$SCRIPT_DIR/scripts"
    fi
    
    # Copier les scripts de gestion des services
    if [ -f "$source_scripts_dir/service-manager.sh" ]; then
        execute cp "$source_scripts_dir/service-manager.sh" "$scripts_dir/"
        execute chmod +x "$scripts_dir/service-manager.sh"
    fi
    
    if [ -f "$source_scripts_dir/service-cleanup.sh" ]; then
        execute cp "$source_scripts_dir/service-cleanup.sh" "$scripts_dir/"
        execute chmod +x "$scripts_dir/service-cleanup.sh"
    fi
    
    # Créer les liens symboliques pour un accès facile
    execute ln -sf "$scripts_dir/service-manager.sh" /usr/local/bin/twoine-service
    execute ln -sf "$scripts_dir/service-cleanup.sh" /usr/local/bin/twoine-service-cleanup
    
    # Configurer sudoers pour permettre aux utilisateurs de sites de gérer leurs services
    local sudoers_file="/etc/sudoers.d/twoine-services"
    
    if [ "$DRY_RUN" = false ]; then
        cat > "$sudoers_file" << 'SUDOERS'
# Twoine Service Management
# Permet à l'utilisateur twoine de gérer les services systemd twoine-*

# Commandes systemctl autorisées pour les services Twoine
Cmnd_Alias TWOINE_SYSTEMCTL = \
    /usr/bin/systemctl start twoine-*, \
    /usr/bin/systemctl stop twoine-*, \
    /usr/bin/systemctl restart twoine-*, \
    /usr/bin/systemctl reload twoine-*, \
    /usr/bin/systemctl status twoine-*, \
    /usr/bin/systemctl enable twoine-*, \
    /usr/bin/systemctl disable twoine-*, \
    /usr/bin/systemctl is-active twoine-*, \
    /usr/bin/systemctl is-enabled twoine-*, \
    /usr/bin/systemctl show twoine-*, \
    /usr/bin/systemctl daemon-reload, \
    /usr/bin/systemctl list-units --type=service *twoine-*

# Commandes pour gérer les fichiers unit
Cmnd_Alias TWOINE_UNIT_FILES = \
    /usr/bin/mv /tmp/twoine-*.service.tmp /etc/systemd/system/twoine-*.service, \
    /usr/bin/rm -f /etc/systemd/system/twoine-*.service, \
    /usr/bin/chmod 644 /etc/systemd/system/twoine-*.service, \
    /usr/bin/chown root\:root /etc/systemd/system/twoine-*.service

# Commandes pour gérer les répertoires de services
Cmnd_Alias TWOINE_SERVICE_DIRS = \
    /usr/bin/mkdir -p /var/www/twoine/*/services/*, \
    /usr/bin/chown site_*\:site_* /var/www/twoine/*/services/*, \
    /usr/bin/chmod 750 /var/www/twoine/*/services/*, \
    /usr/bin/mv /tmp/twoine-env-*.tmp /var/www/twoine/*/services/*/.env, \
    /usr/bin/chown site_*\:site_* /var/www/twoine/*/services/*/.env, \
    /usr/bin/chmod 600 /var/www/twoine/*/services/*/.env, \
    /usr/bin/rm -rf /var/www/twoine/*/services/*

# L'utilisateur twoine peut exécuter ces commandes sans mot de passe
twoine ALL=(ALL) NOPASSWD: TWOINE_SYSTEMCTL, TWOINE_UNIT_FILES, TWOINE_SERVICE_DIRS

# Exécution de commandes en tant qu'utilisateur de site
twoine ALL=(site_*) NOPASSWD: /usr/bin/bash -c *
SUDOERS
        
        chmod 440 "$sudoers_file"
        
        # Valider le fichier sudoers
        if ! visudo -c -f "$sudoers_file" >/dev/null 2>&1; then
            log_error "Invalid sudoers file, removing..."
            rm -f "$sudoers_file"
        fi
    fi
    
    log_success "Service management scripts installed"
}

install_production_scripts() {
    log_info "Installing production management scripts..."
    
    local scripts_dir="$DEFAULT_INSTALL_DIR/app/scripts"
    if [ ! -d "$scripts_dir" ]; then
        scripts_dir="$SCRIPT_DIR/scripts"
    fi
    
    # Liste des scripts à installer
    local scripts=(
        "twoine-start.sh:twoine-start"
        "twoine-stop.sh:twoine-stop"
        "twoine-status.sh:twoine-status"
        "twoine-update.sh:twoine-update"
        "twoine-rollback.sh:twoine-rollback"
        "twoine-validate.sh:twoine-validate"
        "twoine-secure.sh:twoine-secure"
        "twoine-backup.sh:twoine-backup"
        "twoine-logs.sh:twoine-logs"
    )
    
    for entry in "${scripts[@]}"; do
        local src="${entry%%:*}"
        local dest="${entry##*:}"
        
        if [ -f "$scripts_dir/$src" ]; then
            execute cp "$scripts_dir/$src" "/usr/local/bin/$dest"
            execute chmod +x "/usr/local/bin/$dest"
            log_debug "  $dest installed"
        fi
    done
    
    log_success "Production scripts installed"
}

install_production_systemd() {
    log_info "Installing production systemd services..."
    
    local systemd_dir="$DEFAULT_INSTALL_DIR/app/config/systemd"
    if [ ! -d "$systemd_dir" ]; then
        systemd_dir="$SCRIPT_DIR/config/systemd"
    fi
    
    if [ -d "$systemd_dir" ]; then
        local installed_count=0
        local skipped_count=0

        for service_file in "$systemd_dir"/*.service "$systemd_dir"/*.target; do
            if [ -f "$service_file" ]; then
                local filename=$(basename "$service_file")
                local destination="/etc/systemd/system/$filename"

                # Les unités principales sont déjà générées dynamiquement à l'étape 6
                # avec des chemins/ports du contexte d'installation. Ne pas les écraser.
                if [ -f "$destination" ]; then
                    ((skipped_count++))
                    log_debug "  $filename conservé (déjà présent)"
                    continue
                fi

                execute cp "$service_file" "$destination"
                ((installed_count++))
                log_debug "  $filename installed"
            fi
        done
        
        execute systemctl daemon-reload
        execute systemctl enable twoine.target 2>/dev/null || true

        for service in twoine-api twoine-worker twoine-supervisor; do
            if systemctl list-unit-files | grep -q "^${service}.service"; then
                execute systemctl enable "${service}.service" 2>/dev/null || true
            fi
        done

        log_info "  systemd templates installés: $installed_count, ignorés (déjà présents): $skipped_count"
        
        log_success "Systemd services installed"
    fi
}

install_production_config() {
    log_info "Installing production configurations..."

    local config_dir="$DEFAULT_INSTALL_DIR/app/config"
    if [ ! -d "$config_dir" ]; then
        config_dir="$SCRIPT_DIR/config"
    fi
    
    # Logrotate
    if [ -f "$config_dir/logrotate-twoine.conf" ]; then
        execute cp "$config_dir/logrotate-twoine.conf" "/etc/logrotate.d/twoine"
        execute chmod 644 "/etc/logrotate.d/twoine"
        log_debug "  Logrotate configured"
    fi
    
    # Cron
    if [ -f "$config_dir/cron-twoine" ]; then
        execute cp "$config_dir/cron-twoine" "/etc/cron.d/twoine"
        execute chmod 644 "/etc/cron.d/twoine"
        log_debug "  Cron configured"
    fi
    
    # Create additional directories
    execute mkdir -p "$DEFAULT_INSTALL_DIR/backups"
    execute mkdir -p "/var/log/twoine/metrics"
    execute chown -R twoine:twoine "$DEFAULT_INSTALL_DIR/backups"
    execute chown -R twoine:twoine "/var/log/twoine/metrics"
    
    log_success "Production configurations installed"
}

print_summary() {
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    local base_url="${DOMAIN:-$server_ip}"
    
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ████████╗██╗    ██╗ ██████╗ ██╗███╗   ██╗███████╗${NC}"
    echo -e "${GREEN}  ╚══██╔══╝██║    ██║██╔═══██╗██║████╗  ██║██╔════╝${NC}"
    echo -e "${GREEN}     ██║   ██║ █╗ ██║██║   ██║██║██╔██╗ ██║█████╗  ${NC}"
    echo -e "${GREEN}     ██║   ██║███╗██║██║   ██║██║██║╚██╗██║██╔══╝  ${NC}"
    echo -e "${GREEN}     ██║   ╚███╔███╔╝╚██████╔╝██║██║ ╚████║███████╗${NC}"
    echo -e "${GREEN}     ╚═╝    ╚══╝╚══╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ INSTALLATION TERMINÉE AVEC SUCCÈS${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ACCÈS À TWOINE                                                          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${GREEN}Interface Utilisateur:${NC}"
    echo -e "    URL:        ${YELLOW}https://${base_url}/${NC}"
    echo ""
    echo -e "  ${GREEN}Interface Admin:${NC}"
    echo -e "    URL:        ${YELLOW}https://${base_url}/admin/${NC}"
    echo -e "    Utilisateur: ${ADMIN_USERNAME}"
    echo -e "    Email:       ${ADMIN_EMAIL}"
    echo ""
    echo -e "  ${GREEN}API Backend:${NC}"
    echo -e "    URL:        ${YELLOW}https://${base_url}/api/${NC}"
    echo -e "    Health:     https://${base_url}/health"
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  SERVICES ACTIFS                                                         ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${GREEN}twoine-api${NC}        (port ${API_PORT})     - API Backend"
    echo -e "  ${GREEN}twoine-worker${NC}                    - Worker interne"
    echo -e "  ${GREEN}twoine-supervisor${NC}                - Service de supervision"
    echo -e "  ${GREEN}admin-panel${NC}       (Nginx static) - Interface Admin"
    echo -e "  ${GREEN}user-panel${NC}        (Nginx static) - Interface Utilisateur"
    echo ""
    echo -e "  Services démarrés: ${GREEN}${#SERVICES_STARTED[@]}/${#SERVICES_INSTALLED[@]}${NC}"
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  RÉPERTOIRES                                                             ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Installation:  ${DEFAULT_INSTALL_DIR}"
    echo -e "  Sites:         ${SITES_DIR}"
    echo -e "  Logs:          ${DEFAULT_LOG_DIR}"
    echo -e "  Data:          ${DEFAULT_DATA_DIR}"
    echo -e "  Backups:       ${DEFAULT_INSTALL_DIR}/backups"
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  COMMANDES DE GESTION                                                    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${YELLOW}twoine-start${NC}      Démarrer tous les services"
    echo -e "  ${YELLOW}twoine-stop${NC}       Arrêter tous les services"
    echo -e "  ${YELLOW}twoine-status${NC}     Afficher l'état des services"
    echo -e "  ${YELLOW}twoine-update${NC}     Mettre à jour Twoine"
    echo -e "  ${YELLOW}twoine-backup${NC}     Créer une sauvegarde"
    echo -e "  ${YELLOW}twoine-validate${NC}   Valider la configuration"
    echo -e "  ${YELLOW}twoine-secure${NC}     Renforcer la sécurité"
    echo -e "  ${YELLOW}twoine-logs${NC}       Afficher les logs"
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  PROCHAINES ÉTAPES                                                       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  1. Accédez à l'interface admin: ${YELLOW}https://${base_url}/admin/${NC}"
    echo -e "  2. Connectez-vous avec: ${YELLOW}${ADMIN_USERNAME}${NC} / ${YELLOW}[votre mot de passe]${NC}"
    echo -e "  3. Exécutez: ${YELLOW}twoine-secure${NC} (renforcement sécurité)"
    echo -e "  4. Exécutez: ${YELLOW}twoine-validate${NC} (vérification configuration)"
    echo ""
    echo -e "${YELLOW}⚠  Note: Certificat SSL auto-signé en cours d'utilisation.${NC}"
    echo -e "${YELLOW}   Configurez Let's Encrypt pour la production:${NC}"
    echo -e "${YELLOW}   certbot --nginx -d ${DOMAIN:-votre-domaine.com}${NC}"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Twoine v${TWOINE_VERSION} - Installation réussie !${NC}"
    echo -e "${GREEN}  Repository: https://github.com/Antoine601/Twoine${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

run_finalization() {
    log_step "ÉTAPE 9: Finalisation"
    
    create_admin_user
    setup_service_management
    
    # Install production management tools
    install_production_scripts
    install_production_systemd
    install_production_config
    
    sleep 2
    
    # Verify services are running
    log_info "Vérification des services..."
    local services_ok=0
    local services_total=3
    
    for service in twoine-api twoine-worker twoine-supervisor; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            ((services_ok++))
            log_success "  ✓ $service actif"
        else
            log_warning "  ✗ $service inactif"
        fi
    done
    
    if [ $services_ok -eq $services_total ]; then
        log_success "Tous les services Twoine sont actifs ($services_ok/$services_total)"
    elif [ $services_ok -gt 0 ]; then
        log_warning "$services_ok/$services_total services actifs. Exécutez 'twoine-start' pour démarrer les autres."
    else
        log_warning "Aucun service actif. Exécutez 'twoine-start' pour démarrer Twoine."
    fi
    
    print_summary
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    
    print_banner
    
    if [ "$DRY_RUN" = true ]; then
        log_warning "Mode DRY-RUN - Aucune modification ne sera effectuée"
        echo ""
    fi
    
    # Étape 1: Vérification du système
    run_system_checks
    
    # Étape 2: Configuration interactive
    run_interactive_prompts
    
    # Étape 3: Installation des dépendances (Node.js, MongoDB, Nginx)
    run_install_dependencies
    
    # Étape 4: Création de la structure système
    run_create_structure
    
    # Étape 5: Installation de l'application Twoine
    run_install_application
    
    # Étape 6: Configuration des services systemd
    run_configure_systemd
    
    # Étape 7: Configuration de Nginx
    run_configure_nginx
    
    # Étape 8: Configuration du pare-feu
    run_configure_firewall
    
    # Étape 9: Finalisation et démarrage
    run_finalization
}

main "$@"
