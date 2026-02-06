#!/bin/bash

#===============================================================================
# TWOINE - Logs Viewer Script
# Affiche et gère les logs Twoine
#===============================================================================

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-logs"
LOG_DIR="/var/log/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE="all"
FOLLOW=false
LINES=50
SINCE=""
UNTIL=""
GREP_PATTERN=""
OUTPUT_FORMAT="text"

#-------------------------------------------------------------------------------
# FONCTIONS
#-------------------------------------------------------------------------------

print_usage() {
    echo "Usage: $SCRIPT_NAME [SERVICE] [OPTIONS]"
    echo ""
    echo "Services:"
    echo "  all         Tous les services Twoine (défaut)"
    echo "  api         Twoine API"
    echo "  worker      Twoine Worker"
    echo "  monitor     Twoine Supervisor"
    echo "  nginx       Nginx (access + error)"
    echo "  sites       Services des sites utilisateurs"
    echo ""
    echo "Options:"
    echo "  -f, --follow        Suivre les logs en temps réel"
    echo "  -n, --lines N       Nombre de lignes (défaut: 50)"
    echo "  --since TIME        Depuis (ex: '1 hour ago', '2024-01-15')"
    echo "  --until TIME        Jusqu'à"
    echo "  -g, --grep PATTERN  Filtrer par pattern"
    echo "  --json              Sortie JSON (journalctl)"
    echo "  -h, --help          Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $SCRIPT_NAME                    # 50 dernières lignes tous services"
    echo "  $SCRIPT_NAME api -f             # Suivre les logs API"
    echo "  $SCRIPT_NAME nginx -n 100       # 100 lignes Nginx"
    echo "  $SCRIPT_NAME all --since '1h'   # Logs dernière heure"
    echo "  $SCRIPT_NAME api -g 'error'     # Filtrer les erreurs"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            all|api|worker|monitor|nginx|sites)
                SERVICE="$1"
                shift
                ;;
            -f|--follow)
                FOLLOW=true
                shift
                ;;
            -n|--lines)
                LINES="$2"
                shift 2
                ;;
            --since)
                SINCE="$2"
                shift 2
                ;;
            --until)
                UNTIL="$2"
                shift 2
                ;;
            -g|--grep)
                GREP_PATTERN="$2"
                shift 2
                ;;
            --json)
                OUTPUT_FORMAT="json"
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Option inconnue: $1" >&2
                print_usage
                exit 1
                ;;
        esac
    done
}

build_journalctl_args() {
    local args=""
    
    [ "$FOLLOW" = true ] && args="$args -f"
    [ -n "$LINES" ] && [ "$FOLLOW" = false ] && args="$args -n $LINES"
    [ -n "$SINCE" ] && args="$args --since '$SINCE'"
    [ -n "$UNTIL" ] && args="$args --until '$UNTIL'"
    [ "$OUTPUT_FORMAT" = "json" ] && args="$args -o json"
    
    echo "$args"
}

view_journalctl_logs() {
    local unit="$1"
    local args=$(build_journalctl_args)
    
    if [ -n "$GREP_PATTERN" ]; then
        eval "journalctl -u $unit $args --no-pager" | grep --color=auto -i "$GREP_PATTERN"
    else
        eval "journalctl -u $unit $args"
    fi
}

view_file_logs() {
    local file="$1"
    
    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}Fichier non trouvé: $file${NC}" >&2
        return 1
    fi
    
    if [ "$FOLLOW" = true ]; then
        if [ -n "$GREP_PATTERN" ]; then
            tail -f "$file" | grep --color=auto -i "$GREP_PATTERN"
        else
            tail -f "$file"
        fi
    else
        if [ -n "$GREP_PATTERN" ]; then
            tail -n "$LINES" "$file" | grep --color=auto -i "$GREP_PATTERN"
        else
            tail -n "$LINES" "$file"
        fi
    fi
}

show_api_logs() {
    echo -e "${CYAN}═══ Logs Twoine API ═══${NC}"
    
    # Essayer journalctl d'abord
    if systemctl list-unit-files | grep -q "twoine-api.service"; then
        view_journalctl_logs "twoine-api"
    elif systemctl list-unit-files | grep -q "twoine.service"; then
        view_journalctl_logs "twoine"
    else
        # Fallback vers fichiers
        if [ -f "$LOG_DIR/app/twoine.log" ]; then
            view_file_logs "$LOG_DIR/app/twoine.log"
        else
            echo -e "${YELLOW}Aucun log API trouvé${NC}"
        fi
    fi
}

show_worker_logs() {
    echo -e "${CYAN}═══ Logs Twoine Worker ═══${NC}"
    
    if systemctl list-unit-files | grep -q "twoine-worker.service"; then
        view_journalctl_logs "twoine-worker"
    else
        echo -e "${YELLOW}Service twoine-worker non installé${NC}"
    fi
}

show_monitor_logs() {
    echo -e "${CYAN}═══ Logs Twoine Supervisor ═══${NC}"
    
    if systemctl list-unit-files | grep -q "twoine-supervisor.service"; then
        view_journalctl_logs "twoine-supervisor"
    else
        echo -e "${YELLOW}Service twoine-supervisor non installé${NC}"
    fi
}

show_nginx_logs() {
    echo -e "${CYAN}═══ Logs Nginx ═══${NC}"
    
    if [ "$FOLLOW" = true ]; then
        # Suivre les deux fichiers en même temps
        tail -f "$LOG_DIR/nginx/access.log" "$LOG_DIR/nginx/error.log" 2>/dev/null || \
        tail -f /var/log/nginx/access.log /var/log/nginx/error.log 2>/dev/null
    else
        echo -e "${BLUE}--- Access Log ---${NC}"
        if [ -f "$LOG_DIR/nginx/access.log" ]; then
            view_file_logs "$LOG_DIR/nginx/access.log"
        elif [ -f /var/log/nginx/access.log ]; then
            view_file_logs /var/log/nginx/access.log
        fi
        
        echo ""
        echo -e "${BLUE}--- Error Log ---${NC}"
        if [ -f "$LOG_DIR/nginx/error.log" ]; then
            view_file_logs "$LOG_DIR/nginx/error.log"
        elif [ -f /var/log/nginx/error.log ]; then
            view_file_logs /var/log/nginx/error.log
        fi
    fi
}

show_sites_logs() {
    echo -e "${CYAN}═══ Logs Services Sites ═══${NC}"
    
    local site_services
    site_services=$(systemctl list-units --type=service --no-legend | grep "twoine-site-" | awk '{print $1}')
    
    if [ -z "$site_services" ]; then
        echo -e "${YELLOW}Aucun service de site actif${NC}"
        return 0
    fi
    
    for service in $site_services; do
        echo ""
        echo -e "${BLUE}--- $service ---${NC}"
        view_journalctl_logs "$service"
    done
}

show_all_logs() {
    if [ "$FOLLOW" = true ]; then
        # Mode follow: suivre tous les services Twoine
        echo -e "${CYAN}═══ Logs Twoine (tous services) - Ctrl+C pour quitter ═══${NC}"
        journalctl -u 'twoine*' -f
    else
        show_api_logs
        echo ""
        show_worker_logs
        echo ""
        show_monitor_logs
    fi
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    
    case "$SERVICE" in
        all)
            show_all_logs
            ;;
        api)
            show_api_logs
            ;;
        worker)
            show_worker_logs
            ;;
        monitor)
            show_monitor_logs
            ;;
        nginx)
            show_nginx_logs
            ;;
        sites)
            show_sites_logs
            ;;
    esac
}

main "$@"
