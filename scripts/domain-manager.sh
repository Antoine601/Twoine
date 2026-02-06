#!/bin/bash
#===============================================================================
# TWOINE - Domain Manager
# Script principal de gestion des domaines (wrapper pour les autres scripts)
#
# Usage: ./domain-manager.sh <command> <domain> [options]
#
# Commands:
#   add       - Ajoute un domaine (génère cert + config + active)
#   remove    - Supprime un domaine complètement
#   enable    - Active un domaine existant
#   disable   - Désactive un domaine
#   cert      - Génère/régénère le certificat
#   config    - Génère/régénère la config Nginx
#   status    - Affiche le statut d'un domaine
#   list      - Liste tous les domaines configurés
#   reload    - Recharge Nginx de manière sécurisée
#
# Exemples:
#   ./domain-manager.sh add example.com 3000 --ssl
#   ./domain-manager.sh remove example.com
#   ./domain-manager.sh status example.com
#===============================================================================

set -euo pipefail

# Configuration
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_AVAILABLE="${TWOINE_NGINX_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_ENABLED="${TWOINE_NGINX_ENABLED:-/etc/nginx/sites-enabled}"
CERTS_DIR="${TWOINE_CERTS_DIR:-/etc/twoine/certs}"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Fonctions de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_header() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

# Afficher l'aide
show_help() {
    cat << EOF
TWOINE Domain Manager

Usage: $0 <command> [arguments]

Commands:
  add <domain> <port> [--ssl]    Ajoute un nouveau domaine
  remove <domain> [--force]       Supprime un domaine complètement
  enable <domain>                 Active un domaine
  disable <domain>                Désactive un domaine
  cert <domain>                   Génère/régénère le certificat SSL
  config <domain> <port> [--ssl]  Génère/régénère la config Nginx
  status <domain>                 Affiche le statut d'un domaine
  list                            Liste tous les domaines
  reload                          Recharge Nginx de manière sécurisée
  help                            Affiche cette aide

Options:
  --ssl                           Active SSL (certificat auto-signé)
  --force                         Force l'opération sans confirmation

Exemples:
  $0 add example.com 3000 --ssl
  $0 status example.com
  $0 list
  $0 remove example.com --force

EOF
}

# Commande: add
cmd_add() {
    if [ $# -lt 2 ]; then
        log_error "Usage: $0 add <domain> <port> [--ssl]"
        exit 1
    fi

    local domain="$1"
    local port="$2"
    shift 2
    local ssl_flag=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --ssl) ssl_flag="--ssl"; shift ;;
            *) shift ;;
        esac
    done

    log_header "Ajout du domaine: $domain"

    # 1. Générer le certificat si SSL
    if [ -n "$ssl_flag" ]; then
        log_info "Génération du certificat SSL..."
        "$SCRIPTS_DIR/domain-cert-generate.sh" "$domain" || {
            log_error "Échec de la génération du certificat"
            exit 1
        }
    fi

    # 2. Créer la configuration Nginx
    log_info "Création de la configuration Nginx..."
    "$SCRIPTS_DIR/domain-nginx-config.sh" "$domain" "$port" $ssl_flag || {
        log_error "Échec de la création de la configuration"
        exit 1
    }

    # 3. Activer le site
    log_info "Activation du site..."
    "$SCRIPTS_DIR/domain-enable.sh" "$domain" || {
        log_error "Échec de l'activation du site"
        exit 1
    }

    log_success "Domaine $domain ajouté avec succès!"
}

# Commande: remove
cmd_remove() {
    if [ $# -lt 1 ]; then
        log_error "Usage: $0 remove <domain> [--force]"
        exit 1
    fi

    "$SCRIPTS_DIR/domain-remove.sh" "$@"
}

# Commande: enable
cmd_enable() {
    if [ $# -lt 1 ]; then
        log_error "Usage: $0 enable <domain>"
        exit 1
    fi

    "$SCRIPTS_DIR/domain-enable.sh" "$1"
}

# Commande: disable
cmd_disable() {
    if [ $# -lt 1 ]; then
        log_error "Usage: $0 disable <domain>"
        exit 1
    fi

    "$SCRIPTS_DIR/domain-disable.sh" "$1"
}

# Commande: cert
cmd_cert() {
    if [ $# -lt 1 ]; then
        log_error "Usage: $0 cert <domain>"
        exit 1
    fi

    "$SCRIPTS_DIR/domain-cert-generate.sh" "$1"
}

# Commande: config
cmd_config() {
    if [ $# -lt 2 ]; then
        log_error "Usage: $0 config <domain> <port> [--ssl]"
        exit 1
    fi

    "$SCRIPTS_DIR/domain-nginx-config.sh" "$@"
}

# Commande: status
cmd_status() {
    if [ $# -lt 1 ]; then
        log_error "Usage: $0 status <domain>"
        exit 1
    fi

    local domain="$1"
    domain=$(echo "$domain" | tr '[:upper:]' '[:lower:]')

    log_header "Statut du domaine: $domain"

    # Configuration Nginx
    local config_path="${NGINX_AVAILABLE}/${domain}.conf"
    local enabled_path="${NGINX_ENABLED}/${domain}.conf"

    echo "Configuration Nginx:"
    if [ -f "$config_path" ]; then
        echo -e "  Config:  ${GREEN}✓${NC} $config_path"
    else
        echo -e "  Config:  ${RED}✗${NC} Non trouvée"
    fi

    if [ -L "$enabled_path" ]; then
        echo -e "  Activé:  ${GREEN}✓${NC} $enabled_path"
    else
        echo -e "  Activé:  ${RED}✗${NC} Non activé"
    fi

    # Certificats SSL
    local cert_dir="${CERTS_DIR}/${domain}"
    local cert_path="${cert_dir}/cert.pem"
    local key_path="${cert_dir}/key.pem"

    echo ""
    echo "Certificat SSL:"
    if [ -d "$cert_dir" ]; then
        if [ -f "$cert_path" ] && [ -f "$key_path" ]; then
            echo -e "  Certificat: ${GREEN}✓${NC} $cert_path"
            echo -e "  Clé:        ${GREEN}✓${NC} $key_path"
            
            # Infos du certificat
            local expiry=$(openssl x509 -in "$cert_path" -noout -enddate 2>/dev/null | cut -d= -f2)
            if [ -n "$expiry" ]; then
                echo "  Expiration: $expiry"
            fi
        else
            echo -e "  ${YELLOW}⚠${NC} Répertoire existe mais certificats incomplets"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Pas de certificat SSL"
    fi

    echo ""
}

# Commande: list
cmd_list() {
    log_header "Domaines configurés"

    echo "Sites disponibles (${NGINX_AVAILABLE}):"
    if [ -d "$NGINX_AVAILABLE" ]; then
        shopt -s nullglob
        for conf in "$NGINX_AVAILABLE"/*.conf; do
            [ -e "$conf" ] || continue
            local domain=$(basename "$conf" .conf)
            local enabled="${NGINX_ENABLED}/${domain}.conf"
            local cert_dir="${CERTS_DIR}/${domain}"
            
            local status=""
            [ -L "$enabled" ] && status="${GREEN}[activé]${NC}" || status="${YELLOW}[désactivé]${NC}"
            [ -d "$cert_dir" ] && status="$status ${BLUE}[SSL]${NC}"
            
            echo -e "  - $domain $status"
        done
        shopt -u nullglob
    else
        echo "  Aucun"
    fi

    echo ""
    echo "Certificats SSL (${CERTS_DIR}):"
    if [ -d "$CERTS_DIR" ]; then
        for cert_dir in "$CERTS_DIR"/*/; do
            [ -d "$cert_dir" ] || continue
            local domain=$(basename "$cert_dir")
            local cert_path="${cert_dir}cert.pem"
            
            if [ -f "$cert_path" ]; then
                local expiry=$(openssl x509 -in "$cert_path" -noout -enddate 2>/dev/null | cut -d= -f2)
                echo "  - $domain (expire: $expiry)"
            fi
        done
    else
        echo "  Aucun"
    fi

    echo ""
}

# Commande: reload
cmd_reload() {
    log_header "Rechargement de Nginx"

    log_info "Test de la configuration..."
    if nginx -t 2>&1; then
        log_success "Configuration valide"
    else
        log_error "Configuration invalide!"
        exit 1
    fi

    log_info "Rechargement..."
    if systemctl reload nginx 2>&1; then
        log_success "Nginx rechargé avec succès"
    else
        log_error "Échec du rechargement"
        exit 1
    fi
}

# Main
if [ $# -lt 1 ]; then
    show_help
    exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
    add)     cmd_add "$@" ;;
    remove)  cmd_remove "$@" ;;
    enable)  cmd_enable "$@" ;;
    disable) cmd_disable "$@" ;;
    cert)    cmd_cert "$@" ;;
    config)  cmd_config "$@" ;;
    status)  cmd_status "$@" ;;
    list)    cmd_list "$@" ;;
    reload)  cmd_reload "$@" ;;
    help|--help|-h) show_help ;;
    *)
        log_error "Commande inconnue: $COMMAND"
        show_help
        exit 1
        ;;
esac

exit 0
