#!/bin/bash

#===============================================================================
# TWOINE - Setup Site Management
# Script d'installation des composants de gestion des sites
#===============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

#-------------------------------------------------------------------------------
# Vérifications
#-------------------------------------------------------------------------------

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en root"
        exit 1
    fi
}

check_ubuntu() {
    if [ ! -f /etc/os-release ]; then
        log_error "Système non supporté"
        exit 1
    fi
    
    source /etc/os-release
    if [ "$ID" != "ubuntu" ]; then
        log_error "Ce script nécessite Ubuntu"
        exit 1
    fi
    
    log_success "Ubuntu $VERSION_ID détecté"
}

#-------------------------------------------------------------------------------
# Installation des dépendances
#-------------------------------------------------------------------------------

install_dependencies() {
    log_info "Installation des dépendances système..."
    
    apt-get update -qq
    apt-get install -y -qq \
        acl \
        curl \
        jq \
        > /dev/null
    
    log_success "Dépendances installées"
}

#-------------------------------------------------------------------------------
# Configuration des répertoires
#-------------------------------------------------------------------------------

setup_directories() {
    log_info "Configuration des répertoires..."
    
    # Répertoire des sites
    mkdir -p /var/www/sites
    chown twoine:twoine /var/www/sites
    chmod 755 /var/www/sites
    
    # Répertoire des scripts
    mkdir -p /opt/twoine/scripts
    
    # Copier les scripts
    if [ -f "$PROJECT_DIR/lib/site-manager.sh" ]; then
        cp "$PROJECT_DIR/lib/site-manager.sh" /opt/twoine/scripts/
        chmod +x /opt/twoine/scripts/site-manager.sh
    fi
    
    log_success "Répertoires configurés"
}

#-------------------------------------------------------------------------------
# Configuration sudoers
#-------------------------------------------------------------------------------

setup_sudoers() {
    log_info "Configuration des permissions sudo..."
    
    # Créer un fichier sudoers pour Twoine
    cat > /etc/sudoers.d/twoine-sites << 'SUDOERS'
# Twoine Site Management Permissions
# Permet à l'utilisateur twoine de gérer les sites sans mot de passe

# Gestion des utilisateurs de sites
twoine ALL=(root) NOPASSWD: /usr/sbin/useradd --system --uid [0-9]* --gid [0-9]* --home-dir /var/www/sites/* --shell /usr/sbin/nologin --comment *Twoine* site_*
twoine ALL=(root) NOPASSWD: /usr/sbin/userdel site_*
twoine ALL=(root) NOPASSWD: /usr/sbin/groupadd --gid [0-9]* site_*
twoine ALL=(root) NOPASSWD: /usr/sbin/groupdel site_*

# Gestion des répertoires
twoine ALL=(root) NOPASSWD: /usr/bin/mkdir -p /var/www/sites/*
twoine ALL=(root) NOPASSWD: /usr/bin/chown -R site_*\:site_* /var/www/sites/*
twoine ALL=(root) NOPASSWD: /usr/bin/chmod [0-9][0-9][0-9] /var/www/sites/*
twoine ALL=(root) NOPASSWD: /usr/bin/rm -rf /var/www/sites/*

# Gestion des ACL
twoine ALL=(root) NOPASSWD: /usr/bin/setfacl -R -m u\:twoine\:rx /var/www/sites/*
twoine ALL=(root) NOPASSWD: /usr/bin/setfacl -R -d -m u\:twoine\:rx /var/www/sites/*

# Gestion systemd
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl daemon-reload
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl start twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl stop twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl restart twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl reload twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl enable twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl disable twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl is-active twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl is-enabled twoine-*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl show twoine-* --property=*
twoine ALL=(root) NOPASSWD: /usr/bin/systemctl list-units --type=service --all --no-pager --plain

# Gestion des fichiers unit
twoine ALL=(root) NOPASSWD: /usr/bin/mv /tmp/twoine-*.service.tmp /etc/systemd/system/twoine-*.service
twoine ALL=(root) NOPASSWD: /usr/bin/rm -f /etc/systemd/system/twoine-*.service

# Tuer les processus des utilisateurs de sites
twoine ALL=(root) NOPASSWD: /usr/bin/pkill -u site_*
twoine ALL=(root) NOPASSWD: /usr/bin/pkill -9 -u site_*

# Exécuter en tant que site_*
twoine ALL=(site_*) NOPASSWD: ALL
SUDOERS

    chmod 440 /etc/sudoers.d/twoine-sites
    
    # Vérifier la syntaxe
    if ! visudo -c -f /etc/sudoers.d/twoine-sites > /dev/null 2>&1; then
        log_error "Erreur de syntaxe sudoers"
        rm -f /etc/sudoers.d/twoine-sites
        exit 1
    fi
    
    log_success "Permissions sudo configurées"
}

#-------------------------------------------------------------------------------
# Configuration des templates
#-------------------------------------------------------------------------------

setup_templates() {
    log_info "Installation des templates..."
    
    mkdir -p /opt/twoine/templates
    
    if [ -d "$PROJECT_DIR/config/templates" ]; then
        cp -r "$PROJECT_DIR/config/templates/"* /opt/twoine/templates/
    fi
    
    log_success "Templates installés"
}

#-------------------------------------------------------------------------------
# Vérification finale
#-------------------------------------------------------------------------------

verify_installation() {
    log_info "Vérification de l'installation..."
    
    local errors=0
    
    # Vérifier les répertoires
    [ -d /var/www/sites ] || { log_error "/var/www/sites manquant"; ((errors++)); }
    [ -d /opt/twoine/scripts ] || { log_error "/opt/twoine/scripts manquant"; ((errors++)); }
    
    # Vérifier sudoers
    [ -f /etc/sudoers.d/twoine-sites ] || { log_error "sudoers non configuré"; ((errors++)); }
    
    # Vérifier que l'utilisateur twoine existe
    id twoine > /dev/null 2>&1 || { log_warning "Utilisateur twoine non trouvé"; }
    
    if [ "$errors" -gt 0 ]; then
        log_error "$errors erreurs détectées"
        return 1
    fi
    
    log_success "Installation vérifiée"
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    echo ""
    echo "======================================"
    echo "  TWOINE - Setup Site Management"
    echo "======================================"
    echo ""
    
    check_root
    check_ubuntu
    install_dependencies
    setup_directories
    setup_sudoers
    setup_templates
    verify_installation
    
    echo ""
    log_success "Installation terminée avec succès!"
    echo ""
    echo "Prochaines étapes:"
    echo "  1. Vérifiez que l'utilisateur 'twoine' existe"
    echo "  2. Redémarrez le service Twoine"
    echo "  3. Testez la création d'un site via l'API"
    echo ""
}

main "$@"
