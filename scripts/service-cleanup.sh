#!/bin/bash
# ============================================================================
# TWOINE - Service Cleanup Script
# Supprime tous les services d'un site lors de sa suppression
# ============================================================================
# Usage:
#   ./service-cleanup.sh <site_name> [--force]
# ============================================================================

set -euo pipefail

# Configuration
SYSTEMD_DIR="/etc/systemd/system"
SITES_DIR="${SITES_DIR:-/var/www/sites}"
LOG_FILE="/var/log/twoine/service-cleanup.log"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

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
        *)       echo "[INFO] $message" ;;
    esac
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log ERROR "This script must be run as root"
        exit 1
    fi
}

validate_site_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
        log ERROR "Invalid site name: $name"
        exit 1
    fi
}

cleanup_site_services() {
    local site_name="$1"
    local force="${2:-false}"
    
    validate_site_name "$site_name"
    
    log INFO "Cleaning up services for site: $site_name"
    
    # Trouver tous les services du site
    local services=$(systemctl list-units --type=service --all --no-legend "twoine-${site_name}-*" 2>/dev/null | awk '{print $1}' | sed 's/\.service$//')
    
    if [[ -z "$services" ]]; then
        # Vérifier aussi les fichiers unit non chargés
        services=$(ls -1 "${SYSTEMD_DIR}/twoine-${site_name}-"*.service 2>/dev/null | xargs -I {} basename {} .service || true)
    fi
    
    if [[ -z "$services" ]]; then
        log INFO "No services found for site: $site_name"
        return 0
    fi
    
    local count=0
    local failed=0
    
    for service in $services; do
        log INFO "Processing service: $service"
        
        # Arrêter le service
        if systemctl is-active --quiet "${service}.service" 2>/dev/null; then
            log INFO "Stopping service: $service"
            if ! systemctl stop "${service}.service" 2>/dev/null; then
                if [[ "$force" == "true" || "$force" == "--force" ]]; then
                    log WARNING "Failed to stop $service gracefully, killing..."
                    systemctl kill "${service}.service" 2>/dev/null || true
                else
                    log ERROR "Failed to stop service: $service"
                    ((failed++))
                    continue
                fi
            fi
        fi
        
        # Désactiver le service
        systemctl disable "${service}.service" 2>/dev/null || true
        
        # Supprimer le fichier unit
        if [[ -f "${SYSTEMD_DIR}/${service}.service" ]]; then
            rm -f "${SYSTEMD_DIR}/${service}.service"
            log INFO "Removed unit file: ${service}.service"
        fi
        
        ((count++))
    done
    
    # Recharger systemd
    systemctl daemon-reload
    
    log SUCCESS "Cleaned up $count services for site: $site_name"
    
    if [[ $failed -gt 0 ]]; then
        log WARNING "$failed services failed to cleanup"
        return 1
    fi
    
    return 0
}

usage() {
    cat << EOF
TWOINE Service Cleanup

Usage: $0 <site_name> [--force]

Arguments:
    site_name   Name of the site to cleanup services for
    --force     Force cleanup even if services fail to stop gracefully

Examples:
    $0 mysite
    $0 mysite --force

EOF
    exit 1
}

main() {
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    
    local site_name="${1:-}"
    local force="${2:-false}"
    
    if [[ -z "$site_name" || "$site_name" == "-h" || "$site_name" == "--help" ]]; then
        usage
    fi
    
    check_root
    cleanup_site_services "$site_name" "$force"
}

main "$@"
