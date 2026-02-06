#!/bin/bash
# ============================================================================
# TWOINE - Service Manager Script
# Gestion des services systemd pour les sites Twoine
# ============================================================================
# Usage:
#   ./service-manager.sh <action> <site_name> <service_name> [options]
#
# Actions:
#   create    - Crée un nouveau service systemd
#   delete    - Supprime un service
#   start     - Démarre un service
#   stop      - Arrête un service
#   restart   - Redémarre un service
#   status    - Affiche le statut d'un service
#   enable    - Active le démarrage automatique
#   disable   - Désactive le démarrage automatique
#   logs      - Affiche les logs d'un service
#   list      - Liste les services d'un site
# ============================================================================

set -euo pipefail

# Configuration
SYSTEMD_DIR="/etc/systemd/system"
SITES_DIR="${SITES_DIR:-/var/www/sites}"
LOG_FILE="/var/log/twoine/service-manager.log"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# FONCTIONS UTILITAIRES
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE" 2>/dev/null || true
    
    case "$level" in
        ERROR)   echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        WARNING) echo -e "${YELLOW}[WARNING]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        INFO)    echo -e "${BLUE}[INFO]${NC} $message" ;;
        *)       echo "$message" ;;
    esac
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

validate_name() {
    local name="$1"
    local type="$2"
    
    if [[ ! "$name" =~ ^[a-z][a-z0-9_-]{1,29}$ ]]; then
        log ERROR "Invalid $type name: $name"
        log ERROR "Must start with a letter, contain only lowercase letters, numbers, hyphens, underscores (2-30 chars)"
        exit 1
    fi
}

get_service_name() {
    local site_name="$1"
    local service_name="$2"
    echo "twoine-${site_name}-${service_name}"
}

service_exists() {
    local service_name="$1"
    [[ -f "${SYSTEMD_DIR}/${service_name}.service" ]]
}

# ============================================================================
# ACTIONS
# ============================================================================

action_create() {
    local site_name="$1"
    local service_name="$2"
    local start_command="${3:-}"
    local port="${4:-}"
    local service_type="${5:-node}"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    local linux_user="site_${site_name}"
    local site_dir="${SITES_DIR}/${site_name}"
    local working_dir="${site_dir}/services/${service_name}"
    local log_dir="${site_dir}/logs"
    local data_dir="${site_dir}/data"
    local tmp_dir="${site_dir}/tmp"
    local env_file="${working_dir}/.env"
    
    # Vérifier que le site existe
    if [[ ! -d "$site_dir" ]]; then
        log ERROR "Site directory not found: $site_dir"
        exit 1
    fi
    
    # Vérifier que l'utilisateur existe
    if ! id "$linux_user" &>/dev/null; then
        log ERROR "Linux user not found: $linux_user"
        exit 1
    fi
    
    # Vérifier si le service existe déjà
    if service_exists "$systemd_name"; then
        log ERROR "Service already exists: $systemd_name"
        exit 1
    fi
    
    # Créer le répertoire du service
    log INFO "Creating service directory: $working_dir"
    mkdir -p "$working_dir"
    chown "${linux_user}:${linux_user}" "$working_dir"
    chmod 750 "$working_dir"
    
    # Déterminer la commande de démarrage
    if [[ -z "$start_command" ]]; then
        case "$service_type" in
            node)   start_command="npm start" ;;
            python) start_command="python3 app.py" ;;
            php)    start_command="php -S 127.0.0.1:${port:-8000}" ;;
            *)      start_command="./start.sh" ;;
        esac
    fi
    
    # Générer le fichier unit
    log INFO "Creating systemd unit: ${systemd_name}.service"
    cat > "${SYSTEMD_DIR}/${systemd_name}.service" << EOF
[Unit]
Description=Twoine Service: ${site_name}/${service_name}
Documentation=https://github.com/Antoine601/Twoine
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=${linux_user}
Group=${linux_user}
WorkingDirectory=${working_dir}

ExecStart=${start_command}

Restart=always
RestartSec=5

TimeoutStartSec=30
TimeoutStopSec=30

Environment=NODE_ENV=production
Environment=PORT=${port:-3000}
EnvironmentFile=-${env_file}

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${working_dir} ${log_dir} ${data_dir} ${tmp_dir}
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
CapabilityBoundingSet=
AmbientCapabilities=

# Resource Limits
MemoryMax=256M
CPUQuota=50%
LimitNOFILE=65535
LimitNPROC=4096

# Logging
StandardOutput=append:${log_dir}/${service_name}.log
StandardError=append:${log_dir}/${service_name}-error.log

[Install]
WantedBy=multi-user.target
EOF

    chmod 644 "${SYSTEMD_DIR}/${systemd_name}.service"
    
    # Créer le fichier .env de base
    if [[ ! -f "$env_file" ]]; then
        log INFO "Creating environment file: $env_file"
        cat > "$env_file" << EOF
# Auto-generated by Twoine
# Site: ${site_name}
# Service: ${service_name}

NODE_ENV=production
PORT=${port:-3000}
EOF
        chown "${linux_user}:${linux_user}" "$env_file"
        chmod 600 "$env_file"
    fi
    
    # Recharger systemd
    log INFO "Reloading systemd daemon"
    systemctl daemon-reload
    
    # Activer le service
    log INFO "Enabling service"
    systemctl enable "${systemd_name}.service"
    
    log SUCCESS "Service created: $systemd_name"
    log INFO "Start with: systemctl start ${systemd_name}"
}

action_delete() {
    local site_name="$1"
    local service_name="$2"
    local force="${3:-false}"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log WARNING "Service does not exist: $systemd_name"
        return 0
    fi
    
    # Vérifier si le service tourne
    if systemctl is-active --quiet "${systemd_name}.service"; then
        if [[ "$force" != "true" && "$force" != "-f" ]]; then
            log ERROR "Service is running. Stop it first or use -f to force"
            exit 1
        fi
        log INFO "Stopping running service"
        systemctl stop "${systemd_name}.service"
    fi
    
    # Désactiver le service
    log INFO "Disabling service"
    systemctl disable "${systemd_name}.service" 2>/dev/null || true
    
    # Supprimer le fichier unit
    log INFO "Removing unit file"
    rm -f "${SYSTEMD_DIR}/${systemd_name}.service"
    
    # Recharger systemd
    systemctl daemon-reload
    
    log SUCCESS "Service deleted: $systemd_name"
}

action_start() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    log INFO "Starting service: $systemd_name"
    systemctl start "${systemd_name}.service"
    
    sleep 1
    
    if systemctl is-active --quiet "${systemd_name}.service"; then
        log SUCCESS "Service started: $systemd_name"
    else
        log ERROR "Service failed to start. Check logs with: journalctl -u ${systemd_name}"
        exit 1
    fi
}

action_stop() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    log INFO "Stopping service: $systemd_name"
    systemctl stop "${systemd_name}.service"
    
    log SUCCESS "Service stopped: $systemd_name"
}

action_restart() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    log INFO "Restarting service: $systemd_name"
    systemctl restart "${systemd_name}.service"
    
    sleep 1
    
    if systemctl is-active --quiet "${systemd_name}.service"; then
        log SUCCESS "Service restarted: $systemd_name"
    else
        log ERROR "Service failed to restart. Check logs with: journalctl -u ${systemd_name}"
        exit 1
    fi
}

action_status() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    echo ""
    echo "=== Service Status: $systemd_name ==="
    echo ""
    
    # Statut de base
    local active_state=$(systemctl is-active "${systemd_name}.service" 2>/dev/null || echo "unknown")
    local enabled_state=$(systemctl is-enabled "${systemd_name}.service" 2>/dev/null || echo "unknown")
    
    echo "Active:  $active_state"
    echo "Enabled: $enabled_state"
    
    # Détails si actif
    if [[ "$active_state" == "active" ]]; then
        local pid=$(systemctl show -p MainPID --value "${systemd_name}.service")
        local memory=$(systemctl show -p MemoryCurrent --value "${systemd_name}.service" 2>/dev/null || echo "N/A")
        local uptime=$(systemctl show -p ActiveEnterTimestamp --value "${systemd_name}.service")
        
        echo "PID:     $pid"
        if [[ "$memory" != "N/A" && "$memory" != "[not set]" ]]; then
            echo "Memory:  $(echo "scale=2; $memory / 1024 / 1024" | bc 2>/dev/null || echo "N/A") MB"
        fi
        echo "Started: $uptime"
    fi
    
    echo ""
    echo "=== Recent Logs ==="
    journalctl -u "${systemd_name}.service" -n 10 --no-pager 2>/dev/null || echo "No logs available"
    echo ""
}

action_enable() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    systemctl enable "${systemd_name}.service"
    log SUCCESS "Service enabled for auto-start: $systemd_name"
}

action_disable() {
    local site_name="$1"
    local service_name="$2"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    systemctl disable "${systemd_name}.service"
    log SUCCESS "Service disabled from auto-start: $systemd_name"
}

action_logs() {
    local site_name="$1"
    local service_name="$2"
    local lines="${3:-50}"
    local follow="${4:-false}"
    
    validate_name "$site_name" "site"
    validate_name "$service_name" "service"
    
    local systemd_name=$(get_service_name "$site_name" "$service_name")
    
    if ! service_exists "$systemd_name"; then
        log ERROR "Service does not exist: $systemd_name"
        exit 1
    fi
    
    if [[ "$follow" == "-f" || "$follow" == "true" ]]; then
        journalctl -u "${systemd_name}.service" -f
    else
        journalctl -u "${systemd_name}.service" -n "$lines" --no-pager
    fi
}

action_list() {
    local site_name="$1"
    
    if [[ -n "$site_name" ]]; then
        validate_name "$site_name" "site"
        echo ""
        echo "=== Services for site: $site_name ==="
        echo ""
        systemctl list-units --type=service --all "twoine-${site_name}-*" --no-pager 2>/dev/null \
            | grep "twoine-${site_name}-" \
            || echo "No services found"
    else
        echo ""
        echo "=== All Twoine Services ==="
        echo ""
        systemctl list-units --type=service --all "twoine-*" --no-pager 2>/dev/null \
            | grep "twoine-" \
            || echo "No services found"
    fi
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

usage() {
    cat << EOF
TWOINE Service Manager

Usage: $0 <action> <site_name> <service_name> [options]

Actions:
    create <site> <service> [start_cmd] [port] [type]
                        Create a new service
    delete <site> <service> [-f]
                        Delete a service (-f to force)
    start <site> <service>
                        Start a service
    stop <site> <service>
                        Stop a service
    restart <site> <service>
                        Restart a service
    status <site> <service>
                        Show service status
    enable <site> <service>
                        Enable auto-start
    disable <site> <service>
                        Disable auto-start
    logs <site> <service> [lines] [-f]
                        Show service logs
    list [site]         List all services (or for a specific site)

Examples:
    $0 create mysite frontend "npm start" 3000 node
    $0 start mysite frontend
    $0 logs mysite frontend 100 -f
    $0 list mysite

EOF
    exit 1
}

main() {
    # Créer le répertoire de logs si nécessaire
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    
    local action="${1:-}"
    
    if [[ -z "$action" ]]; then
        usage
    fi
    
    case "$action" in
        create)
            check_root
            action_create "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}"
            ;;
        delete)
            check_root
            action_delete "${2:-}" "${3:-}" "${4:-}"
            ;;
        start)
            check_root
            action_start "${2:-}" "${3:-}"
            ;;
        stop)
            check_root
            action_stop "${2:-}" "${3:-}"
            ;;
        restart)
            check_root
            action_restart "${2:-}" "${3:-}"
            ;;
        status)
            action_status "${2:-}" "${3:-}"
            ;;
        enable)
            check_root
            action_enable "${2:-}" "${3:-}"
            ;;
        disable)
            check_root
            action_disable "${2:-}" "${3:-}"
            ;;
        logs)
            action_logs "${2:-}" "${3:-}" "${4:-50}" "${5:-}"
            ;;
        list)
            action_list "${2:-}"
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            log ERROR "Unknown action: $action"
            usage
            ;;
    esac
}

main "$@"
