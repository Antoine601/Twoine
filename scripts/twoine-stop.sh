#!/bin/bash

#===============================================================================
# TWOINE - Stop Script
# Arrête tous les services Twoine proprement
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-stop"
INSTALL_DIR="/opt/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

QUIET=false
SERVICES_ONLY=false
FORCE=false
GRACEFUL_TIMEOUT=30

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
    echo "  -s, --services    Arrêter uniquement les services Twoine (pas MongoDB/Nginx)"
    echo "  -f, --force       Forcer l'arrêt immédiat (kill)"
    echo "  -t, --timeout N   Timeout graceful en secondes (défaut: 30)"
    echo "  -h, --help        Afficher cette aide"
    echo ""
    echo "Services arrêtés (ordre inverse):"
    echo "  1. nginx (si non --services)"
    echo "  2. twoine-supervisor"
    echo "  3. twoine-worker"
    echo "  4. twoine-api"
    echo "  5. mongod (si non --services)"
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
            -f|--force)
                FORCE=true
                shift
                ;;
            -t|--timeout)
                GRACEFUL_TIMEOUT="$2"
                shift 2
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

stop_service() {
    local service="$1"
    local display_name="${2:-$service}"
    
    if ! systemctl is-active --quiet "$service"; then
        log_info "$display_name déjà arrêté"
        return 0
    fi
    
    log_info "Arrêt de $display_name..."
    
    if [ "$FORCE" = true ]; then
        systemctl kill "$service" 2>/dev/null || true
        sleep 1
    fi
    
    if systemctl stop "$service" 2>/dev/null; then
        log_success "$display_name arrêté"
        return 0
    else
        log_warning "Timeout lors de l'arrêt de $display_name, forçage..."
        systemctl kill "$service" 2>/dev/null || true
        return 0
    fi
}

wait_for_stop() {
    local service="$1"
    local timeout="${2:-$GRACEFUL_TIMEOUT}"
    local count=0
    
    while [ $count -lt $timeout ]; do
        if ! systemctl is-active --quiet "$service"; then
            return 0
        fi
        sleep 1
        ((count++))
    done
    
    return 1
}

stop_site_services() {
    log_info "Arrêt des services de sites utilisateurs..."
    
    local site_services
    site_services=$(systemctl list-units --type=service --state=running --no-legend | grep "twoine-site-" | awk '{print $1}' || true)
    
    if [ -n "$site_services" ]; then
        for service in $site_services; do
            log_info "  Arrêt de $service..."
            systemctl stop "$service" 2>/dev/null || true
        done
        log_success "Services de sites arrêtés"
    else
        log_info "Aucun service de site actif"
    fi
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    check_root
    
    [ "$QUIET" = false ] && echo ""
    [ "$QUIET" = false ] && echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo -e "${YELLOW}  TWOINE - Arrêt des services${NC}"
    [ "$QUIET" = false ] && echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo ""
    
    local errors=0
    
    # 1. Arrêter d'abord les services des sites utilisateurs
    stop_site_services
    
    # 2. Nginx (si nécessaire) - garder actif pour les autres sites
    # Note: On ne touche pas à Nginx sauf demande explicite
    if [ "$SERVICES_ONLY" = false ]; then
        log_info "Nginx reste actif (autres sites potentiels)"
    fi
    
    # 3. Monitor (supervision)
    if systemctl list-unit-files | grep -q "twoine-supervisor.service"; then
        stop_service "twoine-supervisor" "Twoine Supervisor" || ((errors++))
    fi
    
    # 4. Worker (tâches de fond)
    if systemctl list-unit-files | grep -q "twoine-worker.service"; then
        stop_service "twoine-worker" "Twoine Worker" || ((errors++))
    fi
    
    # 5. API principale
    stop_service "twoine-api" "Twoine API" || ((errors++))
    
    # Ancien service twoine.service si existe
    if systemctl list-unit-files | grep -q "^twoine.service"; then
        stop_service "twoine" "Twoine (legacy)" || true
    fi
    
    # 6. MongoDB (si nécessaire et demandé)
    if [ "$SERVICES_ONLY" = false ]; then
        log_warning "MongoDB reste actif (données persistantes)"
        log_info "Pour arrêter MongoDB: systemctl stop mongod"
    fi
    
    # Résultat
    [ "$QUIET" = false ] && echo ""
    
    if [ $errors -eq 0 ]; then
        log_success "Tous les services Twoine sont arrêtés"
        exit 0
    else
        log_error "$errors service(s) en erreur lors de l'arrêt"
        exit 1
    fi
}

main "$@"
