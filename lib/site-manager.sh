#!/bin/bash

#===============================================================================
# TWOINE - Site Manager Shell Library
# Version: 1.0.0
# Description: Fonctions bash pour la gestion des sites et utilisateurs Linux
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

TWOINE_SITES_DIR="${TWOINE_SITES_DIR:-/var/www/sites}"
TWOINE_LOG_DIR="${TWOINE_LOG_DIR:-/var/log/twoine}"
SYSTEMD_DIR="/etc/systemd/system"

# Plage UID pour les utilisateurs de sites (évite les conflits)
SITE_UID_MIN=10000
SITE_UID_MAX=19999

#-------------------------------------------------------------------------------
# LOGGING
#-------------------------------------------------------------------------------

log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_success() {
    echo "[OK] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

#-------------------------------------------------------------------------------
# VALIDATION
#-------------------------------------------------------------------------------

validate_site_name() {
    local name="$1"
    
    if [[ ! "$name" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
        log_error "Invalid site name: $name"
        log_error "Must start with letter, contain only lowercase letters, numbers, hyphens, underscores (3-30 chars)"
        return 1
    fi
    
    return 0
}

validate_service_name() {
    local name="$1"
    
    if [[ ! "$name" =~ ^[a-z][a-z0-9_-]{1,29}$ ]]; then
        log_error "Invalid service name: $name"
        return 1
    fi
    
    return 0
}

#-------------------------------------------------------------------------------
# USER MANAGEMENT
#-------------------------------------------------------------------------------

get_next_uid() {
    local uid=$SITE_UID_MIN
    
    while getent passwd "$uid" >/dev/null 2>&1; do
        ((uid++))
        if [ "$uid" -gt "$SITE_UID_MAX" ]; then
            log_error "No available UID in range $SITE_UID_MIN-$SITE_UID_MAX"
            return 1
        fi
    done
    
    echo "$uid"
}

create_site_user() {
    local site_name="$1"
    local username="site_${site_name}"
    local home_dir="${TWOINE_SITES_DIR}/${site_name}"
    
    # Validation
    if ! validate_site_name "$site_name"; then
        return 1
    fi
    
    # Vérifier si l'utilisateur existe
    if id "$username" >/dev/null 2>&1; then
        log_info "User $username already exists"
        return 0
    fi
    
    # Obtenir un UID disponible
    local uid
    uid=$(get_next_uid) || return 1
    
    log_info "Creating user $username (UID: $uid)..."
    
    # Créer le groupe
    groupadd --gid "$uid" "$username" 2>/dev/null || true
    
    # Créer l'utilisateur système
    useradd \
        --system \
        --uid "$uid" \
        --gid "$uid" \
        --home-dir "$home_dir" \
        --shell /usr/sbin/nologin \
        --comment "Twoine Site: $site_name" \
        "$username"
    
    log_success "User $username created"
    
    # Retourner l'UID
    echo "$uid"
}

delete_site_user() {
    local site_name="$1"
    local username="site_${site_name}"
    
    if ! id "$username" >/dev/null 2>&1; then
        log_info "User $username does not exist"
        return 0
    fi
    
    log_info "Deleting user $username..."
    
    # Tuer tous les processus de l'utilisateur
    pkill -u "$username" 2>/dev/null || true
    sleep 1
    pkill -9 -u "$username" 2>/dev/null || true
    
    # Supprimer l'utilisateur
    userdel "$username" 2>/dev/null || true
    
    # Supprimer le groupe si encore présent
    groupdel "$username" 2>/dev/null || true
    
    log_success "User $username deleted"
}

user_exists() {
    local site_name="$1"
    local username="site_${site_name}"
    
    id "$username" >/dev/null 2>&1
}

get_user_info() {
    local site_name="$1"
    local username="site_${site_name}"
    
    if ! id "$username" >/dev/null 2>&1; then
        echo "null"
        return 1
    fi
    
    local uid gid home
    uid=$(id -u "$username")
    gid=$(id -g "$username")
    home=$(getent passwd "$username" | cut -d: -f6)
    
    echo "{\"username\":\"$username\",\"uid\":$uid,\"gid\":$gid,\"home\":\"$home\"}"
}

#-------------------------------------------------------------------------------
# DIRECTORY MANAGEMENT
#-------------------------------------------------------------------------------

create_site_directories() {
    local site_name="$1"
    local username="site_${site_name}"
    local base_dir="${TWOINE_SITES_DIR}/${site_name}"
    
    if ! validate_site_name "$site_name"; then
        return 1
    fi
    
    log_info "Creating directory structure for site: $site_name"
    
    # Créer les répertoires
    local dirs=(
        "$base_dir"
        "$base_dir/services"
        "$base_dir/logs"
        "$base_dir/data"
        "$base_dir/tmp"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        log_info "  Created: $dir"
    done
    
    # Définir le propriétaire
    chown -R "$username:$username" "$base_dir"
    
    # Définir les permissions
    chmod 750 "$base_dir"
    chmod 750 "$base_dir/services"
    chmod 750 "$base_dir/logs"
    chmod 750 "$base_dir/data"
    chmod 700 "$base_dir/tmp"
    
    # ACL pour permettre à Twoine de lire
    if command -v setfacl >/dev/null 2>&1; then
        setfacl -R -m u:twoine:rx "$base_dir"
        setfacl -R -d -m u:twoine:rx "$base_dir"
    fi
    
    log_success "Directory structure created for $site_name"
}

delete_site_directories() {
    local site_name="$1"
    local base_dir="${TWOINE_SITES_DIR}/${site_name}"
    
    if ! validate_site_name "$site_name"; then
        return 1
    fi
    
    # Vérification de sécurité
    if [[ ! "$base_dir" =~ ^${TWOINE_SITES_DIR}/[a-z] ]]; then
        log_error "Security: Invalid path $base_dir"
        return 1
    fi
    
    if [ ! -d "$base_dir" ]; then
        log_info "Directory $base_dir does not exist"
        return 0
    fi
    
    log_info "Deleting directory: $base_dir"
    rm -rf "$base_dir"
    log_success "Directory deleted"
}

create_service_directory() {
    local site_name="$1"
    local service_name="$2"
    local username="site_${site_name}"
    local service_dir="${TWOINE_SITES_DIR}/${site_name}/services/${service_name}"
    
    if ! validate_site_name "$site_name" || ! validate_service_name "$service_name"; then
        return 1
    fi
    
    log_info "Creating service directory: $service_dir"
    
    mkdir -p "$service_dir"
    chown "$username:$username" "$service_dir"
    chmod 750 "$service_dir"
    
    log_success "Service directory created"
}

#-------------------------------------------------------------------------------
# SYSTEMD MANAGEMENT
#-------------------------------------------------------------------------------

create_systemd_unit() {
    local site_name="$1"
    local service_name="$2"
    local unit_content="$3"
    local unit_name="twoine-${site_name}-${service_name}"
    local unit_path="${SYSTEMD_DIR}/${unit_name}.service"
    
    if ! validate_site_name "$site_name" || ! validate_service_name "$service_name"; then
        return 1
    fi
    
    log_info "Creating systemd unit: $unit_name"
    
    # Écrire le fichier unit
    echo "$unit_content" > "$unit_path"
    chmod 644 "$unit_path"
    chown root:root "$unit_path"
    
    log_success "Systemd unit created: $unit_path"
}

delete_systemd_unit() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    local unit_path="${SYSTEMD_DIR}/${unit_name}.service"
    
    if [ -f "$unit_path" ]; then
        log_info "Deleting systemd unit: $unit_name"
        rm -f "$unit_path"
        log_success "Systemd unit deleted"
    fi
}

reload_systemd() {
    log_info "Reloading systemd daemon..."
    systemctl daemon-reload
    log_success "Systemd reloaded"
}

enable_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    log_info "Enabling service: $unit_name"
    systemctl enable "${unit_name}.service"
    log_success "Service enabled"
}

disable_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    log_info "Disabling service: $unit_name"
    systemctl disable "${unit_name}.service" 2>/dev/null || true
    log_success "Service disabled"
}

start_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    log_info "Starting service: $unit_name"
    systemctl start "${unit_name}.service"
    log_success "Service started"
}

stop_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    log_info "Stopping service: $unit_name"
    systemctl stop "${unit_name}.service" 2>/dev/null || true
    log_success "Service stopped"
}

restart_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    log_info "Restarting service: $unit_name"
    systemctl restart "${unit_name}.service"
    log_success "Service restarted"
}

get_service_status() {
    local site_name="$1"
    local service_name="$2"
    local unit_name="twoine-${site_name}-${service_name}"
    
    local active enabled pid memory
    
    active=$(systemctl is-active "${unit_name}.service" 2>/dev/null || echo "unknown")
    enabled=$(systemctl is-enabled "${unit_name}.service" 2>/dev/null || echo "unknown")
    
    if [ "$active" = "active" ]; then
        pid=$(systemctl show "${unit_name}.service" --property=MainPID --value 2>/dev/null || echo "0")
        memory=$(systemctl show "${unit_name}.service" --property=MemoryCurrent --value 2>/dev/null || echo "0")
    else
        pid="0"
        memory="0"
    fi
    
    echo "{\"active\":\"$active\",\"enabled\":\"$enabled\",\"pid\":$pid,\"memory\":$memory}"
}

list_site_services() {
    local site_name="$1"
    local prefix="twoine-${site_name}-"
    
    systemctl list-units --type=service --all --no-pager --plain 2>/dev/null | \
        grep "^${prefix}" | \
        awk '{print $1}' | \
        sed "s/^${prefix}//" | \
        sed 's/\.service$//'
}

#-------------------------------------------------------------------------------
# COMPLETE SITE LIFECYCLE
#-------------------------------------------------------------------------------

setup_site() {
    local site_name="$1"
    
    log_info "=========================================="
    log_info "Setting up site: $site_name"
    log_info "=========================================="
    
    # 1. Créer l'utilisateur
    create_site_user "$site_name" || return 1
    
    # 2. Créer les répertoires
    create_site_directories "$site_name" || return 1
    
    log_success "Site $site_name setup complete"
}

teardown_site() {
    local site_name="$1"
    local force="${2:-false}"
    
    log_info "=========================================="
    log_info "Tearing down site: $site_name"
    log_info "=========================================="
    
    # 1. Arrêter et supprimer tous les services
    local services
    services=$(list_site_services "$site_name")
    
    for service in $services; do
        stop_service "$site_name" "$service"
        disable_service "$site_name" "$service"
        delete_systemd_unit "$site_name" "$service"
    done
    
    reload_systemd
    
    # 2. Supprimer l'utilisateur
    delete_site_user "$site_name"
    
    # 3. Supprimer les répertoires (si force)
    if [ "$force" = "true" ]; then
        delete_site_directories "$site_name"
    fi
    
    log_success "Site $site_name teardown complete"
}

setup_service() {
    local site_name="$1"
    local service_name="$2"
    local unit_content="$3"
    local start_now="${4:-false}"
    
    log_info "=========================================="
    log_info "Setting up service: $site_name/$service_name"
    log_info "=========================================="
    
    # 1. Créer le répertoire du service
    create_service_directory "$site_name" "$service_name" || return 1
    
    # 2. Créer le fichier unit systemd
    create_systemd_unit "$site_name" "$service_name" "$unit_content" || return 1
    
    # 3. Recharger systemd
    reload_systemd
    
    # 4. Activer le service
    enable_service "$site_name" "$service_name"
    
    # 5. Démarrer si demandé
    if [ "$start_now" = "true" ]; then
        start_service "$site_name" "$service_name"
    fi
    
    log_success "Service $service_name setup complete"
}

teardown_service() {
    local site_name="$1"
    local service_name="$2"
    
    log_info "=========================================="
    log_info "Tearing down service: $site_name/$service_name"
    log_info "=========================================="
    
    # 1. Arrêter le service
    stop_service "$site_name" "$service_name"
    
    # 2. Désactiver le service
    disable_service "$site_name" "$service_name"
    
    # 3. Supprimer le fichier unit
    delete_systemd_unit "$site_name" "$service_name"
    
    # 4. Recharger systemd
    reload_systemd
    
    log_success "Service $service_name teardown complete"
}

#-------------------------------------------------------------------------------
# ENVIRONMENT FILE MANAGEMENT
#-------------------------------------------------------------------------------

create_env_file() {
    local site_name="$1"
    local service_name="$2"
    local env_content="$3"
    local username="site_${site_name}"
    local env_path="${TWOINE_SITES_DIR}/${site_name}/services/${service_name}/.env"
    
    log_info "Creating .env file: $env_path"
    
    echo "$env_content" > "$env_path"
    chown "$username:$username" "$env_path"
    chmod 600 "$env_path"
    
    log_success ".env file created"
}

#-------------------------------------------------------------------------------
# PORT MANAGEMENT
#-------------------------------------------------------------------------------

check_port_available() {
    local port="$1"
    
    if ss -tuln | grep -q ":${port} "; then
        return 1
    fi
    
    return 0
}

get_port_user() {
    local port="$1"
    
    local pid
    pid=$(ss -tulnp | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1)
    
    if [ -n "$pid" ]; then
        ps -o user= -p "$pid" 2>/dev/null
    fi
}

#-------------------------------------------------------------------------------
# EXPORTS
#-------------------------------------------------------------------------------

export -f log_info log_error log_success
export -f validate_site_name validate_service_name
export -f create_site_user delete_site_user user_exists get_user_info
export -f create_site_directories delete_site_directories create_service_directory
export -f create_systemd_unit delete_systemd_unit reload_systemd
export -f enable_service disable_service start_service stop_service restart_service
export -f get_service_status list_site_services
export -f setup_site teardown_site setup_service teardown_service
export -f create_env_file check_port_available get_port_user
