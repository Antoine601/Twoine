#!/bin/bash

#===============================================================================
# TWOINE - Rollback Script
# Restaure une version précédente de Twoine
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-rollback"
INSTALL_DIR="/opt/twoine"
APP_DIR="/opt/twoine/app"
BACKUP_DIR="/opt/twoine/backups"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TIMESTAMP=""
RESTORE_DB=true
RESTORE_ENV=true
RESTORE_CODE=true

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

print_usage() {
    echo "Usage: $SCRIPT_NAME <TIMESTAMP> [OPTIONS]"
    echo ""
    echo "Arguments:"
    echo "  TIMESTAMP           Timestamp du backup à restaurer (ex: 20240115_143022)"
    echo ""
    echo "Options:"
    echo "  --no-db             Ne pas restaurer la base de données"
    echo "  --no-env            Ne pas restaurer le fichier .env"
    echo "  --no-code           Ne pas restaurer le code (git reset)"
    echo "  -l, --list          Lister les backups disponibles"
    echo "  -h, --help          Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $SCRIPT_NAME 20240115_143022           # Rollback complet"
    echo "  $SCRIPT_NAME 20240115_143022 --no-db   # Sans restaurer la DB"
    echo "  $SCRIPT_NAME --list                    # Voir les backups"
}

list_backups() {
    echo ""
    echo -e "${CYAN}Backups disponibles:${NC}"
    echo "────────────────────────────────────────────"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_warning "Aucun répertoire de backup trouvé"
        exit 0
    fi
    
    # Trouver les timestamps uniques
    local timestamps
    timestamps=$(ls -1 "$BACKUP_DIR" 2>/dev/null | grep -oE '[0-9]{8}_[0-9]{6}' | sort -u | tail -20)
    
    if [ -z "$timestamps" ]; then
        log_warning "Aucun backup trouvé"
        exit 0
    fi
    
    printf "%-20s %-10s %-10s %-10s %s\n" "TIMESTAMP" "ENV" "DB" "GIT" "DATE"
    echo "────────────────────────────────────────────────────────────"
    
    for ts in $timestamps; do
        local has_env="✗"
        local has_db="✗"
        local has_git="✗"
        local date_str=""
        
        [ -f "$BACKUP_DIR/.env.$ts" ] && has_env="✓"
        [ -d "$BACKUP_DIR/db_$ts" ] && has_db="✓"
        [ -f "$BACKUP_DIR/git_hash.$ts" ] && has_git="✓"
        
        # Extraire la date du timestamp
        local year="${ts:0:4}"
        local month="${ts:4:2}"
        local day="${ts:6:2}"
        local hour="${ts:9:2}"
        local min="${ts:11:2}"
        date_str="$day/$month/$year $hour:$min"
        
        printf "%-20s %-10s %-10s %-10s %s\n" "$ts" "$has_env" "$has_db" "$has_git" "$date_str"
    done
    
    echo ""
    echo "Usage: $SCRIPT_NAME <TIMESTAMP>"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-db)
                RESTORE_DB=false
                shift
                ;;
            --no-env)
                RESTORE_ENV=false
                shift
                ;;
            --no-code)
                RESTORE_CODE=false
                shift
                ;;
            -l|--list)
                list_backups
                exit 0
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            -*)
                log_error "Option inconnue: $1"
                print_usage
                exit 1
                ;;
            *)
                if [ -z "$TIMESTAMP" ]; then
                    TIMESTAMP="$1"
                else
                    log_error "Argument inattendu: $1"
                    print_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    if [ -z "$TIMESTAMP" ]; then
        log_error "Timestamp requis"
        echo ""
        print_usage
        exit 1
    fi
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en tant que root"
        exit 1
    fi
}

validate_backup() {
    log_info "Validation du backup $TIMESTAMP..."
    
    local found=false
    
    if [ -f "$BACKUP_DIR/.env.$TIMESTAMP" ]; then
        log_info "  Fichier .env trouvé"
        found=true
    fi
    
    if [ -d "$BACKUP_DIR/db_$TIMESTAMP" ]; then
        log_info "  Backup MongoDB trouvé"
        found=true
    fi
    
    if [ -f "$BACKUP_DIR/git_hash.$TIMESTAMP" ]; then
        log_info "  Hash Git trouvé: $(cat "$BACKUP_DIR/git_hash.$TIMESTAMP")"
        found=true
    fi
    
    if [ "$found" = false ]; then
        log_error "Aucun backup trouvé pour le timestamp: $TIMESTAMP"
        echo ""
        echo "Utilisez '$SCRIPT_NAME --list' pour voir les backups disponibles"
        exit 1
    fi
    
    log_success "Backup validé"
}

confirm_rollback() {
    echo ""
    echo -e "${YELLOW}ATTENTION: Cette opération va:${NC}"
    [ "$RESTORE_ENV" = true ] && [ -f "$BACKUP_DIR/.env.$TIMESTAMP" ] && \
        echo "  - Restaurer le fichier .env"
    [ "$RESTORE_DB" = true ] && [ -d "$BACKUP_DIR/db_$TIMESTAMP" ] && \
        echo "  - Restaurer la base de données MongoDB (DONNÉES ACTUELLES ÉCRASÉES)"
    [ "$RESTORE_CODE" = true ] && [ -f "$BACKUP_DIR/git_hash.$TIMESTAMP" ] && \
        echo "  - Restaurer le code vers le commit $(cat "$BACKUP_DIR/git_hash.$TIMESTAMP" | cut -c1-8)"
    echo ""
    
    read -p "Continuer ? [y/N]: " confirm
    
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Rollback annulé"
        exit 0
    fi
}

stop_services() {
    log_info "Arrêt des services..."
    
    if [ -x "/usr/local/bin/twoine-stop" ]; then
        /usr/local/bin/twoine-stop --quiet --services || true
    else
        systemctl stop twoine-api 2>/dev/null || true
        systemctl stop twoine-worker 2>/dev/null || true
        systemctl stop twoine-supervisor 2>/dev/null || true
        systemctl stop twoine 2>/dev/null || true
    fi
    
    sleep 2
    log_success "Services arrêtés"
}

restore_env() {
    if [ "$RESTORE_ENV" = false ]; then
        log_info "Restauration .env ignorée (--no-env)"
        return 0
    fi
    
    if [ ! -f "$BACKUP_DIR/.env.$TIMESTAMP" ]; then
        log_warning "Fichier .env non trouvé dans le backup"
        return 0
    fi
    
    log_info "Restauration du fichier .env..."
    
    # Backup de l'actuel avant écrasement
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$APP_DIR/.env.pre-rollback"
    fi
    
    cp "$BACKUP_DIR/.env.$TIMESTAMP" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    chown twoine:twoine "$APP_DIR/.env"
    
    log_success "Fichier .env restauré"
}

restore_database() {
    if [ "$RESTORE_DB" = false ]; then
        log_info "Restauration DB ignorée (--no-db)"
        return 0
    fi
    
    if [ ! -d "$BACKUP_DIR/db_$TIMESTAMP" ]; then
        log_warning "Backup MongoDB non trouvé"
        return 0
    fi
    
    log_info "Restauration de la base de données MongoDB..."
    
    if mongorestore --db twoine --drop "$BACKUP_DIR/db_$TIMESTAMP/twoine" --quiet 2>/dev/null; then
        log_success "Base de données restaurée"
    else
        log_error "Échec de la restauration MongoDB"
        return 1
    fi
}

restore_code() {
    if [ "$RESTORE_CODE" = false ]; then
        log_info "Restauration code ignorée (--no-code)"
        return 0
    fi
    
    if [ ! -f "$BACKUP_DIR/git_hash.$TIMESTAMP" ]; then
        log_warning "Hash Git non trouvé dans le backup"
        return 0
    fi
    
    local target_hash
    target_hash=$(cat "$BACKUP_DIR/git_hash.$TIMESTAMP")
    
    log_info "Restauration du code vers $target_hash..."
    
    cd "$APP_DIR"
    
    # Vérifier que le commit existe
    if ! git cat-file -e "$target_hash" 2>/dev/null; then
        log_error "Le commit $target_hash n'existe pas dans l'historique"
        log_info "Essai de récupération depuis origin..."
        git fetch origin --all --quiet 2>/dev/null || true
        
        if ! git cat-file -e "$target_hash" 2>/dev/null; then
            log_error "Impossible de trouver le commit $target_hash"
            return 1
        fi
    fi
    
    # Reset vers le commit
    git reset --hard "$target_hash"
    
    # Réinstaller les dépendances
    log_info "Réinstallation des dépendances..."
    npm install --production --silent 2>/dev/null || npm install --production
    
    log_success "Code restauré vers $(git rev-parse --short HEAD)"
}

start_services() {
    log_info "Démarrage des services..."
    
    if [ -x "/usr/local/bin/twoine-start" ]; then
        /usr/local/bin/twoine-start --quiet --services
    else
        systemctl start twoine-api 2>/dev/null || systemctl start twoine 2>/dev/null || true
        systemctl start twoine-worker 2>/dev/null || true
        systemctl start twoine-supervisor 2>/dev/null || true
    fi
    
    sleep 3
    log_success "Services démarrés"
}

verify_rollback() {
    log_info "Vérification du rollback..."
    
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
            log_success "API répond correctement"
            return 0
        fi
        sleep 2
        ((attempt++))
    done
    
    log_warning "L'API ne répond pas encore"
    return 1
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    check_root
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TWOINE - Rollback vers $TIMESTAMP${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    validate_backup
    confirm_rollback
    
    echo ""
    log_info "Démarrage du rollback..."
    
    stop_services
    restore_env
    restore_database
    restore_code
    start_services
    
    if verify_rollback; then
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ ROLLBACK TERMINÉ AVEC SUCCÈS${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        exit 0
    else
        echo ""
        echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}  ! ROLLBACK TERMINÉ - VÉRIFICATION REQUISE${NC}"
        echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Commandes de diagnostic:"
        echo "  twoine-status"
        echo "  journalctl -u twoine-api -n 50"
        echo ""
        exit 1
    fi
}

main "$@"
