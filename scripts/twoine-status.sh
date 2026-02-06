#!/bin/bash

#===============================================================================
# TWOINE - Status Script
# Affiche l'état de tous les services Twoine
#===============================================================================

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-status"
INSTALL_DIR="/opt/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

QUIET=false
JSON_OUTPUT=false
CHECK_HEALTH=true
DEBUG=false

#-------------------------------------------------------------------------------
# FONCTIONS
#-------------------------------------------------------------------------------

print_usage() {
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -q, --quiet       Mode silencieux (retourne uniquement le code de sortie)"
    echo "  -j, --json        Sortie en format JSON"
    echo "  --no-health       Ne pas vérifier la santé de l'API"
    echo "  -d, --debug       Afficher un diagnostic systemd rapide"
    echo "  -h, --help        Afficher cette aide"
    echo ""
    echo "Codes de sortie:"
    echo "  0 - Tous les services sont actifs"
    echo "  1 - Au moins un service est inactif"
    echo "  2 - Erreur critique"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -j|--json)
                JSON_OUTPUT=true
                shift
                ;;
            --no-health)
                CHECK_HEALTH=false
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
                echo "Option inconnue: $1" >&2
                print_usage
                exit 2
                ;;
        esac
    done
}

get_service_status() {
    local service="$1"
    
    if ! systemctl list-unit-files | grep -q "^${service}"; then
        echo "not_installed"
        return
    fi
    
    if systemctl is-active --quiet "$service"; then
        echo "active"
    elif systemctl is-failed --quiet "$service"; then
        echo "failed"
    else
        echo "inactive"
    fi
}

get_service_uptime() {
    local service="$1"
    
    if ! systemctl is-active --quiet "$service"; then
        echo "-"
        return
    fi
    
    local active_since
    active_since=$(systemctl show "$service" --property=ActiveEnterTimestamp --value 2>/dev/null)
    
    if [ -n "$active_since" ] && [ "$active_since" != "n/a" ]; then
        local now=$(date +%s)
        local started=$(date -d "$active_since" +%s 2>/dev/null || echo "0")
        
        if [ "$started" -gt 0 ]; then
            local uptime=$((now - started))
            
            if [ $uptime -lt 60 ]; then
                echo "${uptime}s"
            elif [ $uptime -lt 3600 ]; then
                echo "$((uptime / 60))m"
            elif [ $uptime -lt 86400 ]; then
                echo "$((uptime / 3600))h"
            else
                echo "$((uptime / 86400))d"
            fi
            return
        fi
    fi
    
    echo "?"
}

get_service_memory() {
    local service="$1"
    
    if ! systemctl is-active --quiet "$service"; then
        echo "-"
        return
    fi
    
    local memory
    memory=$(systemctl show "$service" --property=MemoryCurrent --value 2>/dev/null)
    
    if [ -n "$memory" ] && [ "$memory" != "[not set]" ] && [ "$memory" -gt 0 ] 2>/dev/null; then
        local mb=$((memory / 1024 / 1024))
        echo "${mb}M"
    else
        echo "?"
    fi
}

get_port_status() {
    local port="$1"
    
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
        echo "listening"
    else
        echo "closed"
    fi
}

check_api_health() {
    local endpoint="${1:-http://localhost:3000/api/health}"
    local timeout="${2:-5}"
    
    local response
    response=$(curl -sf --max-time "$timeout" "$endpoint" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "healthy"
    else
        echo "unhealthy"
    fi
}

check_mongodb_connection() {
    if mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
        echo "connected"
    else
        echo "disconnected"
    fi
}

print_status_line() {
    local service="$1"
    local display_name="$2"
    local port="$3"
    
    local status=$(get_service_status "$service")
    local uptime=$(get_service_uptime "$service")
    local memory=$(get_service_memory "$service")
    
    local status_color
    local status_icon
    
    case "$status" in
        active)
            status_color="${GREEN}"
            status_icon="●"
            ;;
        failed)
            status_color="${RED}"
            status_icon="✗"
            ;;
        inactive)
            status_color="${YELLOW}"
            status_icon="○"
            ;;
        not_installed)
            status_color="${BLUE}"
            status_icon="-"
            ;;
    esac
    
    local port_info=""
    if [ -n "$port" ] && [ "$status" = "active" ]; then
        local port_status=$(get_port_status "$port")
        if [ "$port_status" = "listening" ]; then
            port_info=":${port}"
        else
            port_info=":${port}${RED}!${NC}"
        fi
    fi
    
    printf "  ${status_color}${status_icon}${NC} %-20s %-12s %-8s %-8s %s\n" \
        "$display_name" "$status" "$uptime" "$memory" "$port_info"
}

output_json() {
    local services=()
    
    for service in "mongod" "twoine-api" "twoine-worker" "twoine-supervisor" "nginx"; do
        local status=$(get_service_status "$service")
        local uptime=$(get_service_uptime "$service")
        services+=("{\"name\":\"$service\",\"status\":\"$status\",\"uptime\":\"$uptime\"}")
    done
    
    local api_health="unknown"
    local mongo_status="unknown"
    
    if [ "$CHECK_HEALTH" = true ]; then
        api_health=$(check_api_health)
        mongo_status=$(check_mongodb_connection)
    fi
    
    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"services\": [$(IFS=,; echo "${services[*]}")],"
    echo "  \"health\": {"
    echo "    \"api\": \"$api_health\","
    echo "    \"mongodb\": \"$mongo_status\""
    echo "  }"
    echo "}"
}

count_site_services() {
    local count
    count=$(systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -c "twoine-site-" || true)
    [ -z "$count" ] && count=0
    echo "$count"
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    
    # Mode JSON
    if [ "$JSON_OUTPUT" = true ]; then
        output_json
        exit 0
    fi
    
    # Mode silencieux
    if [ "$QUIET" = true ]; then
        local failed=0
        for service in "mongod" "twoine-api" "nginx"; do
            if ! systemctl is-active --quiet "$service" 2>/dev/null; then
                ((failed++))
            fi
        done
        [ $failed -eq 0 ] && exit 0 || exit 1
    fi
    
    # Affichage normal
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TWOINE - État des Services${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # En-tête
    printf "  ${BOLD}%-22s %-12s %-8s %-8s %s${NC}\n" "SERVICE" "STATUS" "UPTIME" "MEMORY" "PORT"
    echo "  ─────────────────────────────────────────────────────────────"
    
    # Services principaux
    print_status_line "mongod" "MongoDB" "27017"
    print_status_line "twoine-api" "Twoine API" "3000"
    print_status_line "twoine-worker" "Twoine Worker" ""
    print_status_line "twoine-supervisor" "Twoine Supervisor" ""
    print_status_line "nginx" "Nginx" "443"
    
    # Ancien service (legacy)
    if systemctl list-unit-files | grep -q "^twoine.service"; then
        print_status_line "twoine" "Twoine (legacy)" "3000"
    fi
    
    echo ""
    
    # Services de sites
    local site_count=$(count_site_services)
    if [ "$site_count" -gt 0 ]; then
        echo -e "  ${BOLD}Services de sites:${NC} $site_count actif(s)"
        echo ""
    fi
    
    # Health checks
    if [ "$CHECK_HEALTH" = true ]; then
        echo -e "  ${BOLD}Health Checks:${NC}"
        echo "  ─────────────────────────────────────────────────────────────"
        
        local api_health=$(check_api_health)
        if [ "$api_health" = "healthy" ]; then
            echo -e "  ${GREEN}●${NC} API Health          healthy"
        else
            echo -e "  ${RED}✗${NC} API Health          unhealthy"
        fi
        
        local mongo_status=$(check_mongodb_connection)
        if [ "$mongo_status" = "connected" ]; then
            echo -e "  ${GREEN}●${NC} MongoDB             connected"
        else
            echo -e "  ${RED}✗${NC} MongoDB             disconnected"
        fi
        
        # Test HTTPS
        if curl -sfk --max-time 3 https://localhost/api/health >/dev/null 2>&1; then
            echo -e "  ${GREEN}●${NC} HTTPS               working"
        else
            echo -e "  ${YELLOW}○${NC} HTTPS               not responding"
        fi
        
        echo ""
    fi
    

    if [ "$DEBUG" = true ]; then
        echo ""
        echo -e "  ${BOLD}Diagnostic rapide:${NC}"
        echo "  ─────────────────────────────────────────────────────────────"
        systemctl status twoine-api --no-pager --lines=3 2>/dev/null || true
        systemctl status twoine-supervisor --no-pager --lines=3 2>/dev/null || true
    fi

    # Résumé
    echo -e "  ${BOLD}Résumé:${NC}"
    echo "  ─────────────────────────────────────────────────────────────"
    
    local total=0
    local active=0
    local failed=0
    
    for service in "mongod" "twoine-api" "twoine-worker" "twoine-supervisor" "nginx"; do
        if systemctl list-unit-files | grep -q "^${service}"; then
            ((total++))
            local status=$(get_service_status "$service")
            case "$status" in
                active) ((active++)) ;;
                failed) ((failed++)) ;;
            esac
        fi
    done
    
    if [ $failed -eq 0 ] && [ $active -eq $total ]; then
        echo -e "  ${GREEN}✓${NC} Tous les services sont actifs ($active/$total)"
        echo ""
        exit 0
    elif [ $failed -gt 0 ]; then
        echo -e "  ${RED}✗${NC} $failed service(s) en échec, $active/$total actifs"
        echo ""
        echo "  Commandes utiles:"
        echo "    journalctl -u twoine-api -n 50   # Voir les logs"
        echo "    twoine-start                     # Redémarrer les services"
        echo ""
        exit 1
    else
        echo -e "  ${YELLOW}!${NC} $active/$total services actifs"
        echo ""
        exit 1
    fi
}

main "$@"
