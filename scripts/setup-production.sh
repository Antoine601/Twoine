#!/bin/bash

#===============================================================================
# TWOINE - Production Setup Script
# Installe les scripts et configurations de production
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/opt/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

#-------------------------------------------------------------------------------
# FONCTIONS
#-------------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en tant que root"
        exit 1
    fi
}


ensure_app_runtime_ready() {
    log_info "Vérification des prérequis runtime..."

    local app_dir="$INSTALL_DIR/app"
    local env_file="$app_dir/.env"
    local env_example="$app_dir/.env.example"

    if [ ! -f "$app_dir/src/app.js" ]; then
        log_error "Fichier applicatif manquant: $app_dir/src/app.js"
        log_error "Déployez le code applicatif dans $app_dir avant d'exécuter ce script"
        return 1
    fi

    if [ ! -f "$env_file" ]; then
        if [ -f "$env_example" ]; then
            cp "$env_example" "$env_file"
            chmod 600 "$env_file"
            chown twoine:twoine "$env_file" 2>/dev/null || true
            log_warning ".env absent: créé depuis .env.example"
            log_warning "Pensez à configurer les secrets (JWT_SECRET, JWT_REFRESH_SECRET)"
        else
            cat > "$env_file" << 'EOF'
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/twoine
JWT_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_MINIMUM_32_CHARS
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_SECURE_RANDOM_STRING_32_CHARS
EOF
            chmod 600 "$env_file"
            chown twoine:twoine "$env_file" 2>/dev/null || true
            log_warning ".env.example absent: un .env minimal a été généré"
            log_warning "Mettez immédiatement à jour les secrets JWT"
        fi
    fi

    log_success "Prérequis runtime validés"
}

#-------------------------------------------------------------------------------
# INSTALLATION DES SCRIPTS
#-------------------------------------------------------------------------------

install_management_scripts() {
    log_info "Installation des scripts de gestion..."
    
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
        
        if [ -f "$SCRIPT_DIR/$src" ]; then
            cp "$SCRIPT_DIR/$src" "/usr/local/bin/$dest"
            chmod +x "/usr/local/bin/$dest"
            log_success "  $dest installé"
        else
            log_warning "  $src non trouvé"
        fi
    done
    
    log_success "Scripts de gestion installés"
}

#-------------------------------------------------------------------------------
# INSTALLATION DES SERVICES SYSTEMD
#-------------------------------------------------------------------------------

install_systemd_services() {
    log_info "Installation des services systemd..."
    
    local systemd_dir="$PLATFORM_DIR/config/systemd"
    
    if [ ! -d "$systemd_dir" ]; then
        log_warning "Répertoire systemd non trouvé: $systemd_dir"
        return 0
    fi
    
    # Copier les fichiers de service
    for service_file in "$systemd_dir"/*.service "$systemd_dir"/*.target; do
        if [ -f "$service_file" ]; then
            local filename=$(basename "$service_file")
            cp "$service_file" "/etc/systemd/system/$filename"
            log_success "  $filename installé"
        fi
    done
    
    # Recharger systemd
    systemctl daemon-reload
    
    # Activer les services
    systemctl enable twoine-api.service 2>/dev/null || true
    systemctl enable twoine-worker.service 2>/dev/null || true
    systemctl enable twoine-supervisor.service 2>/dev/null || true
    systemctl enable twoine.target 2>/dev/null || true
    
    log_success "Services systemd installés"
}

#-------------------------------------------------------------------------------
# INSTALLATION DE LA CONFIGURATION NGINX
#-------------------------------------------------------------------------------

install_nginx_config() {
    log_info "Installation de la configuration Nginx..."
    
    local nginx_template="$PLATFORM_DIR/config/nginx-templates/twoine-platform.conf.template"
    local nginx_dest="/etc/nginx/sites-available/twoine-platform"
    
    if [ ! -f "$nginx_template" ]; then
        log_warning "Template Nginx non trouvé"
        return 0
    fi
    
    # Déterminer les variables
    local domain="_"
    local ssl_cert="$INSTALL_DIR/ssl/twoine.crt"
    local ssl_key="$INSTALL_DIR/ssl/twoine.key"
    local api_port="3000"
    local log_dir="/var/log/twoine"
    
    # Lire le domaine depuis .env si disponible
    if [ -f "$INSTALL_DIR/app/.env" ]; then
        local env_domain=$(grep "^DOMAIN=" "$INSTALL_DIR/app/.env" | cut -d'=' -f2)
        [ -n "$env_domain" ] && domain="$env_domain"
    fi
    
    # Appliquer les variables
    sed -e "s|{{DOMAIN}}|$domain|g" \
        -e "s|{{SSL_CERT}}|$ssl_cert|g" \
        -e "s|{{SSL_KEY}}|$ssl_key|g" \
        -e "s|{{API_PORT}}|$api_port|g" \
        -e "s|{{LOG_DIR}}|$log_dir|g" \
        "$nginx_template" > "$nginx_dest"
    
    # Créer le lien symbolique
    ln -sf "$nginx_dest" /etc/nginx/sites-enabled/twoine-platform
    
    # Supprimer l'ancienne config si elle existe
    rm -f /etc/nginx/sites-enabled/twoine 2>/dev/null || true
    
    # Tester et recharger Nginx
    if nginx -t 2>/dev/null; then
        systemctl reload nginx
        log_success "Configuration Nginx installée"
    else
        log_error "Configuration Nginx invalide"
        rm -f /etc/nginx/sites-enabled/twoine-platform
        return 1
    fi
}

#-------------------------------------------------------------------------------
# INSTALLATION DE LOGROTATE
#-------------------------------------------------------------------------------

install_logrotate() {
    log_info "Installation de la configuration logrotate..."
    
    local logrotate_src="$PLATFORM_DIR/config/logrotate-twoine.conf"
    local logrotate_dest="/etc/logrotate.d/twoine"
    
    if [ -f "$logrotate_src" ]; then
        cp "$logrotate_src" "$logrotate_dest"
        chmod 644 "$logrotate_dest"
        log_success "Configuration logrotate installée"
    else
        log_warning "Configuration logrotate non trouvée"
    fi
}

#-------------------------------------------------------------------------------
# INSTALLATION DE CRON
#-------------------------------------------------------------------------------

install_cron() {
    log_info "Installation des tâches cron..."
    
    local cron_src="$PLATFORM_DIR/config/cron-twoine"
    local cron_dest="/etc/cron.d/twoine"
    
    if [ -f "$cron_src" ]; then
        cp "$cron_src" "$cron_dest"
        chmod 644 "$cron_dest"
        log_success "Configuration cron installée"
    else
        log_warning "Configuration cron non trouvée"
    fi
}

#-------------------------------------------------------------------------------
# CRÉATION DES RÉPERTOIRES
#-------------------------------------------------------------------------------

create_directories() {
    log_info "Création des répertoires..."
    
    local dirs=(
        "$INSTALL_DIR/backups"
        "$INSTALL_DIR/tmp"
        "/var/log/twoine/app"
        "/var/log/twoine/nginx"
        "/var/log/twoine/sites"
        "/var/log/twoine/metrics"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        chown twoine:twoine "$dir" 2>/dev/null || true
        chmod 750 "$dir"
    done
    
    log_success "Répertoires créés"
}

#-------------------------------------------------------------------------------
# VÉRIFICATION
#-------------------------------------------------------------------------------

verify_installation() {
    log_info "Vérification de l'installation..."
    
    local errors=0
    
    # Vérifier les scripts
    for cmd in twoine-start twoine-stop twoine-status twoine-update twoine-validate; do
        if command -v "$cmd" &>/dev/null; then
            log_success "  $cmd disponible"
        else
            log_error "  $cmd non trouvé"
            ((errors++))
        fi
    done
    
    # Vérifier les services
    for service in twoine-api.service twoine-worker.service twoine-supervisor.service; do
        if [ -f "/etc/systemd/system/$service" ]; then
            log_success "  $service installé"
        else
            log_warning "  $service non trouvé"
        fi
    done
    
    return $errors
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TWOINE - Installation Production${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    check_root
    
    create_directories
    ensure_app_runtime_ready
    install_management_scripts
    install_systemd_services
    install_nginx_config
    install_logrotate
    install_cron
    
    echo ""
    verify_installation
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ INSTALLATION PRODUCTION TERMINÉE${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Commandes disponibles:"
    echo "  twoine-start     - Démarrer les services"
    echo "  twoine-stop      - Arrêter les services"
    echo "  twoine-status    - État des services"
    echo "  twoine-update    - Mettre à jour Twoine"
    echo "  twoine-validate  - Valider la configuration"
    echo "  twoine-secure    - Sécuriser le serveur"
    echo "  twoine-backup    - Créer un backup"
    echo "  twoine-logs      - Voir les logs"
    echo ""
    echo "Prochaines étapes:"
    echo "  1. Exécuter: twoine-secure"
    echo "  2. Vérifier: twoine-validate"
    echo "  3. Démarrer: twoine-start"
    echo ""
}

main "$@"
