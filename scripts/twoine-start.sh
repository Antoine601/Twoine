#!/bin/bash

#===============================================================================
# TWOINE - Start Script
# Démarre tous les services Twoine dans l'ordre correct
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-start"
INSTALL_DIR="/opt/twoine"
LOG_DIR="/var/log/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

QUIET=false
SERVICES_ONLY=false
DEBUG=false

#-------------------------------------------------------------------------------
# FONCTIONS
#-------------------------------------------------------------------------------

log_info() {
    [ "$QUIET" = false ] && echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    [ "$QUIET" = false ] && echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    [ "$QUIET" = false ] && echo -e "${YELLOW}[WARN]${NC} $1"
}

print_usage() {
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -q, --quiet       Mode silencieux"
    echo "  -s, --services    Démarrer uniquement les services Twoine (pas MongoDB/Nginx)"
    echo "  -d, --debug       Afficher les erreurs systemd en cas d'échec"
    echo "  -h, --help        Afficher cette aide"
    echo ""
    echo "Services démarrés:"
    echo "  1. mongod (si non --services)"
    echo "  2. twoine-api"
    echo "  3. twoine-worker"
    echo "  4. twoine-supervisor"
    echo "  5. nginx (si non --services)"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -s|--services)
                SERVICES_ONLY=true
                shift
                ;;
            -d|--debug)
                DEBUG=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Option inconnue: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en tant que root"
        exit 1
    fi
}

start_service() {
    local service="$1"
    local display_name="${2:-$service}"
    
    if systemctl is-active --quiet "$service"; then
        log_info "$display_name déjà en cours d'exécution"
        return 0
    fi
    
    log_info "Démarrage de $display_name..."
    
    if systemctl start "$service"; then
        sleep 1
        if systemctl is-active --quiet "$service"; then
            log_success "$display_name démarré"
            return 0
        else
            log_error "$display_name n'a pas pu démarrer"
            return 1
        fi
    else
        log_error "Échec du démarrage de $display_name"
        if [ "$DEBUG" = true ]; then
            systemctl status "$service" --no-pager --lines=10 2>/dev/null || true
            journalctl -u "$service" -n 20 --no-pager 2>/dev/null || true
        fi
        return 1
    fi
}

wait_for_service() {
    local service="$1"
    local max_wait="${2:-30}"
    local wait_count=0
    
    while [ $wait_count -lt $max_wait ]; do
        if systemctl is-active --quiet "$service"; then
            return 0
        fi
        sleep 1
        ((wait_count++))
    done
    
    return 1
}

check_api_health() {
    local max_attempts=10
    local attempt=0
    
    log_info "Vérification de la santé de l'API..."
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
            log_success "API répond correctement"
            return 0
        fi
        sleep 2
        ((attempt++))
    done
    
    log_warning "L'API ne répond pas encore (peut prendre quelques secondes)"
    return 1
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    check_root
    
    [ "$QUIET" = false ] && echo ""
    [ "$QUIET" = false ] && echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo -e "${GREEN}  TWOINE - Démarrage des services${NC}"
    [ "$QUIET" = false ] && echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo ""
    
    local errors=0
    
    # 1. MongoDB (si nécessaire)
    if [ "$SERVICES_ONLY" = false ]; then
        start_service "mongod" "MongoDB" || ((errors++))
        wait_for_service "mongod" 10
    fi
    
    # 2. Services Twoine principaux
    start_service "twoine-api" "Twoine API" || ((errors++))
    
    # Attendre que l'API soit prête avant de démarrer les autres services
    sleep 2
    
    # 3. Worker (tâches de fond)
    if systemctl list-unit-files | grep -q "twoine-worker.service"; then
        start_service "twoine-worker" "Twoine Worker" || ((errors++))
    fi
    
    # 4. Monitor (supervision)
    if systemctl list-unit-files | grep -q "twoine-supervisor.service"; then
        start_service "twoine-supervisor" "Twoine Supervisor" || ((errors++))
    fi
    
    # 5. Nginx (si nécessaire)
    if [ "$SERVICES_ONLY" = false ]; then
        start_service "nginx" "Nginx" || ((errors++))
    fi
    
    # Vérification finale
    [ "$QUIET" = false ] && echo ""
    
    if [ $errors -eq 0 ]; then
        check_api_health || true
        [ "$QUIET" = false ] && echo ""
        log_success "Tous les services sont démarrés"
        exit 0
    else
        log_error "$errors service(s) en erreur"
        [ "$QUIET" = false ] && echo ""
        [ "$QUIET" = false ] && echo "Utilisez 'twoine-status' pour plus de détails"
        exit 1
    fi
}

main "$@"
