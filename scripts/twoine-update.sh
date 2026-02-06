#!/bin/bash

#===============================================================================
# TWOINE - Update Script
# Met à jour Twoine avec sauvegarde et possibilité de rollback
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-update"
INSTALL_DIR="/opt/twoine"
APP_DIR="/opt/twoine/app"
BACKUP_DIR="/opt/twoine/backups"
LOG_DIR="/var/log/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DRY_RUN=false
SKIP_BACKUP=false
SKIP_MIGRATION=false
FORCE=false
BRANCH="main"

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

log_step() {
    echo ""
    echo -e "${CYAN}[$1/$TOTAL_STEPS]${NC} $2"
    echo "────────────────────────────────────────────"
}

print_usage() {
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --dry-run        Simuler la mise à jour sans l'appliquer"
    echo "  -f, --force          Forcer la mise à jour même si déjà à jour"
    echo "  -b, --branch NAME    Branche Git à utiliser (défaut: main)"
    echo "  --skip-backup        Ne pas créer de sauvegarde"
    echo "  --skip-migration     Ne pas exécuter les migrations"
    echo "  -h, --help           Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $SCRIPT_NAME                    # Mise à jour standard"
    echo "  $SCRIPT_NAME --dry-run          # Voir ce qui serait fait"
    echo "  $SCRIPT_NAME --branch develop   # Mettre à jour depuis develop"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -b|--branch)
                BRANCH="$2"
                shift 2
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --skip-migration)
                SKIP_MIGRATION=true
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

check_installation() {
    if [ ! -d "$APP_DIR" ]; then
        log_error "Twoine n'est pas installé dans $APP_DIR"
        exit 1
    fi
    
    if [ ! -d "$APP_DIR/.git" ]; then
        log_error "Le répertoire Twoine n'est pas un dépôt Git"
        log_info "La mise à jour automatique nécessite une installation Git"
        exit 1
    fi
}

check_updates_available() {
    log_info "Vérification des mises à jour disponibles..."
    
    cd "$APP_DIR"
    
    git fetch origin "$BRANCH" --quiet 2>/dev/null || {
        log_error "Impossible de contacter le dépôt distant"
        exit 1
    }
    
    local local_commit=$(git rev-parse HEAD)
    local remote_commit=$(git rev-parse "origin/$BRANCH")
    
    if [ "$local_commit" = "$remote_commit" ] && [ "$FORCE" = false ]; then
        log_success "Twoine est déjà à jour"
        echo ""
        echo "Version actuelle: $(git describe --tags 2>/dev/null || git rev-parse --short HEAD)"
        exit 0
    fi
    
    # Afficher les changements
    local commits_behind=$(git rev-list --count HEAD.."origin/$BRANCH")
    log_info "$commits_behind commit(s) en retard sur origin/$BRANCH"
    
    echo ""
    echo "Changements à appliquer:"
    git log --oneline HEAD.."origin/$BRANCH" | head -10
    
    if [ $commits_behind -gt 10 ]; then
        echo "... et $((commits_behind - 10)) autres commits"
    fi
    echo ""
}

create_backup() {
    if [ "$SKIP_BACKUP" = true ]; then
        log_warning "Sauvegarde ignorée (--skip-backup)"
        return 0
    fi
    
    log_info "Création de la sauvegarde..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Sauvegarde du fichier .env
    if [ -f "$APP_DIR/.env" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Copierait .env vers $BACKUP_DIR/.env.$TIMESTAMP"
        else
            cp "$APP_DIR/.env" "$BACKUP_DIR/.env.$TIMESTAMP"
            log_success "Configuration sauvegardée"
        fi
    fi
    
    # Sauvegarde de la base de données
    log_info "Sauvegarde de la base de données MongoDB..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Exécuterait mongodump vers $BACKUP_DIR/db_$TIMESTAMP"
    else
        if mongodump --db twoine --out "$BACKUP_DIR/db_$TIMESTAMP" --quiet 2>/dev/null; then
            log_success "Base de données sauvegardée"
        else
            log_warning "Échec de la sauvegarde MongoDB (continuer avec précaution)"
        fi
    fi
    
    # Sauvegarde du code actuel (hash Git)
    local current_hash=$(cd "$APP_DIR" && git rev-parse HEAD)
    echo "$current_hash" > "$BACKUP_DIR/git_hash.$TIMESTAMP"
    
    log_success "Sauvegarde créée: $BACKUP_DIR/*.$TIMESTAMP"
}

stop_services() {
    log_info "Arrêt des services Twoine..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Arrêterait les services"
        return 0
    fi
    
    # Utiliser le script d'arrêt si disponible
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

update_code() {
    log_info "Mise à jour du code source..."
    
    cd "$APP_DIR"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Exécuterait git reset --hard origin/$BRANCH"
        return 0
    fi
    
    # Sauvegarder les modifications locales éventuelles
    git stash --quiet 2>/dev/null || true
    
    # Récupérer et appliquer les mises à jour
    git fetch origin "$BRANCH" --quiet
    git reset --hard "origin/$BRANCH"
    
    local new_version=$(git describe --tags 2>/dev/null || git rev-parse --short HEAD)
    log_success "Code mis à jour vers: $new_version"
}

update_dependencies() {
    log_info "Mise à jour des dépendances Node.js..."
    
    cd "$APP_DIR"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Exécuterait npm install --production"
        return 0
    fi
    
    # Nettoyer le cache npm si nécessaire
    npm cache clean --force 2>/dev/null || true
    
    # Installer les dépendances
    if npm install --production --silent 2>/dev/null; then
        log_success "Dépendances mises à jour"
    else
        log_warning "Problème lors de l'installation des dépendances"
        npm install --production
    fi
}

run_migrations() {
    if [ "$SKIP_MIGRATION" = true ]; then
        log_warning "Migrations ignorées (--skip-migration)"
        return 0
    fi
    
    log_info "Exécution des migrations..."
    
    cd "$APP_DIR"
    
    # Vérifier si un script de migration existe
    if [ -f "scripts/migrate.js" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Exécuterait node scripts/migrate.js"
        else
            if node scripts/migrate.js 2>/dev/null; then
                log_success "Migrations exécutées"
            else
                log_warning "Aucune migration à exécuter ou erreur mineure"
            fi
        fi
    elif [ -f "scripts/migrate.sh" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Exécuterait scripts/migrate.sh"
        else
            bash scripts/migrate.sh || log_warning "Migration partielle"
        fi
    else
        log_info "Aucun script de migration trouvé"
    fi
}

update_systemd_services() {
    log_info "Mise à jour des services systemd..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Rechargerait les services systemd"
        return 0
    fi
    
    # Copier les nouveaux fichiers de service si présents
    if [ -d "$APP_DIR/config/systemd" ]; then
        cp "$APP_DIR/config/systemd/"*.service /etc/systemd/system/ 2>/dev/null || true
    fi
    
    systemctl daemon-reload
    log_success "Services systemd rechargés"
}

start_services() {
    log_info "Démarrage des services Twoine..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Démarrerait les services"
        return 0
    fi
    
    # Utiliser le script de démarrage si disponible
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

verify_update() {
    log_info "Vérification de la mise à jour..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Vérifierait la santé de l'API"
        return 0
    fi
    
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
    
    log_error "L'API ne répond pas après la mise à jour"
    return 1
}

print_rollback_instructions() {
    echo ""
    echo -e "${YELLOW}En cas de problème, rollback possible:${NC}"
    echo "  twoine-rollback $TIMESTAMP"
    echo ""
}

cleanup_old_backups() {
    log_info "Nettoyage des anciennes sauvegardes (>30 jours)..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Supprimerait les backups >30 jours"
        return 0
    fi
    
    find "$BACKUP_DIR" -type f -mtime +30 -delete 2>/dev/null || true
    find "$BACKUP_DIR" -type d -empty -mtime +30 -delete 2>/dev/null || true
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

TOTAL_STEPS=8

main() {
    parse_arguments "$@"
    check_root
    check_installation
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TWOINE - Mise à jour${NC}"
    echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo ""
        echo -e "${YELLOW}>>> MODE SIMULATION - Aucune modification ne sera effectuée <<<${NC}"
    fi
    
    log_step 1 "Vérification des mises à jour"
    check_updates_available
    
    log_step 2 "Création de la sauvegarde"
    create_backup
    
    log_step 3 "Arrêt des services"
    stop_services
    
    log_step 4 "Mise à jour du code"
    update_code
    
    log_step 5 "Mise à jour des dépendances"
    update_dependencies
    
    log_step 6 "Exécution des migrations"
    run_migrations
    
    log_step 7 "Mise à jour des services systemd"
    update_systemd_services
    
    log_step 8 "Démarrage et vérification"
    start_services
    
    if verify_update; then
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ MISE À JOUR TERMINÉE AVEC SUCCÈS${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        
        local new_version=$(cd "$APP_DIR" && git describe --tags 2>/dev/null || git rev-parse --short HEAD)
        echo ""
        echo "  Version: $new_version"
        echo "  Backup:  $BACKUP_DIR/*.$TIMESTAMP"
        
        print_rollback_instructions
        cleanup_old_backups
        
        exit 0
    else
        echo ""
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  ✗ MISE À JOUR TERMINÉE AVEC ERREURS${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        
        print_rollback_instructions
        
        echo "Commandes de diagnostic:"
        echo "  twoine-status"
        echo "  journalctl -u twoine-api -n 50"
        echo ""
        
        exit 1
    fi
}

main "$@"
