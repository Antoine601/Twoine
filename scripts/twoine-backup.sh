#!/bin/bash

#===============================================================================
# TWOINE - Backup Script
# Crée des sauvegardes complètes de Twoine
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-backup"
INSTALL_DIR="/opt/twoine"
APP_DIR="/opt/twoine/app"
SITES_DIR="/var/www/twoine"
BACKUP_DIR="/opt/twoine/backups"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
QUIET=false
BACKUP_DB=true
BACKUP_CONFIG=true
BACKUP_SITES=false
RETENTION_DAYS=30
COMPRESS=true

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
    echo "  -q, --quiet           Mode silencieux"
    echo "  --no-db               Ne pas sauvegarder la base de données"
    echo "  --no-config           Ne pas sauvegarder la configuration"
    echo "  --include-sites       Inclure les fichiers des sites utilisateurs"
    echo "  --no-compress         Ne pas compresser l'archive"
    echo "  -r, --retention N     Jours de rétention (défaut: 30)"
    echo "  -o, --output DIR      Répertoire de destination"
    echo "  -h, --help            Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $SCRIPT_NAME                         # Backup standard"
    echo "  $SCRIPT_NAME --include-sites         # Avec fichiers sites"
    echo "  $SCRIPT_NAME -o /mnt/backup          # Vers répertoire externe"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -q|--quiet)
                QUIET=true
                shift
                ;;
            --no-db)
                BACKUP_DB=false
                shift
                ;;
            --no-config)
                BACKUP_CONFIG=false
                shift
                ;;
            --include-sites)
                BACKUP_SITES=true
                shift
                ;;
            --no-compress)
                COMPRESS=false
                shift
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            -o|--output)
                BACKUP_DIR="$2"
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

check_disk_space() {
    local required_mb=500
    local available_mb
    
    available_mb=$(df -BM "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/M//' || echo "0")
    
    if [ "$available_mb" -lt "$required_mb" ]; then
        log_error "Espace disque insuffisant (${available_mb}MB disponibles, ${required_mb}MB requis)"
        exit 1
    fi
}

backup_database() {
    if [ "$BACKUP_DB" = false ]; then
        log_info "Sauvegarde DB ignorée (--no-db)"
        return 0
    fi
    
    log_info "Sauvegarde de la base de données MongoDB..."
    
    local db_backup_dir="$BACKUP_DIR/db_$TIMESTAMP"
    
    if mongodump --db twoine --out "$db_backup_dir" --quiet 2>/dev/null; then
        log_success "Base de données sauvegardée: $db_backup_dir"
        
        # Compresser si demandé
        if [ "$COMPRESS" = true ]; then
            tar -czf "$db_backup_dir.tar.gz" -C "$BACKUP_DIR" "db_$TIMESTAMP"
            rm -rf "$db_backup_dir"
            log_success "Archive créée: $db_backup_dir.tar.gz"
        fi
    else
        log_error "Échec de la sauvegarde MongoDB"
        return 1
    fi
}

backup_config() {
    if [ "$BACKUP_CONFIG" = false ]; then
        log_info "Sauvegarde config ignorée (--no-config)"
        return 0
    fi
    
    log_info "Sauvegarde de la configuration..."
    
    local config_backup="$BACKUP_DIR/config_$TIMESTAMP"
    mkdir -p "$config_backup"
    
    # Fichier .env
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$config_backup/"
        log_info "  .env sauvegardé"
    fi
    
    # Configuration Nginx
    if [ -d /etc/nginx/sites-available ]; then
        mkdir -p "$config_backup/nginx"
        cp /etc/nginx/sites-available/twoine* "$config_backup/nginx/" 2>/dev/null || true
        cp /etc/nginx/conf.d/twoine* "$config_backup/nginx/" 2>/dev/null || true
        log_info "  Configuration Nginx sauvegardée"
    fi
    
    # Services systemd
    mkdir -p "$config_backup/systemd"
    cp /etc/systemd/system/twoine*.service "$config_backup/systemd/" 2>/dev/null || true
    log_info "  Services systemd sauvegardés"
    
    # Certificats SSL (sans la clé privée pour sécurité)
    if [ -f "$INSTALL_DIR/ssl/twoine.crt" ]; then
        mkdir -p "$config_backup/ssl"
        cp "$INSTALL_DIR/ssl/twoine.crt" "$config_backup/ssl/"
        log_info "  Certificat SSL sauvegardé"
    fi
    
    # Hash Git actuel
    if [ -d "$APP_DIR/.git" ]; then
        cd "$APP_DIR"
        git rev-parse HEAD > "$config_backup/git_hash"
        git describe --tags 2>/dev/null > "$config_backup/git_version" || true
        log_info "  Version Git sauvegardée"
    fi
    
    # Compresser
    if [ "$COMPRESS" = true ]; then
        tar -czf "$config_backup.tar.gz" -C "$BACKUP_DIR" "config_$TIMESTAMP"
        rm -rf "$config_backup"
        log_success "Configuration sauvegardée: $config_backup.tar.gz"
    else
        log_success "Configuration sauvegardée: $config_backup"
    fi
}

backup_sites() {
    if [ "$BACKUP_SITES" = false ]; then
        log_info "Sauvegarde sites ignorée (utiliser --include-sites)"
        return 0
    fi
    
    if [ ! -d "$SITES_DIR" ]; then
        log_warning "Répertoire sites non trouvé: $SITES_DIR"
        return 0
    fi
    
    log_info "Sauvegarde des fichiers sites..."
    
    local sites_backup="$BACKUP_DIR/sites_$TIMESTAMP"
    
    # Calculer la taille
    local size
    size=$(du -sh "$SITES_DIR" 2>/dev/null | awk '{print $1}')
    log_info "  Taille à sauvegarder: $size"
    
    if [ "$COMPRESS" = true ]; then
        tar -czf "$sites_backup.tar.gz" -C "$(dirname "$SITES_DIR")" "$(basename "$SITES_DIR")"
        log_success "Sites sauvegardés: $sites_backup.tar.gz"
    else
        cp -r "$SITES_DIR" "$sites_backup"
        log_success "Sites sauvegardés: $sites_backup"
    fi
}

cleanup_old_backups() {
    log_info "Nettoyage des anciennes sauvegardes (>$RETENTION_DAYS jours)..."
    
    local deleted=0
    
    # Supprimer les fichiers
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted++))
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    # Supprimer les répertoires
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        ((deleted++))
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name "*_20*" -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [ $deleted -gt 0 ]; then
        log_success "$deleted ancien(s) backup(s) supprimé(s)"
    else
        log_info "Aucun ancien backup à supprimer"
    fi
}

create_manifest() {
    log_info "Création du manifeste..."
    
    cat > "$BACKUP_DIR/manifest_$TIMESTAMP.txt" << MANIFEST
# Twoine Backup Manifest
# Timestamp: $TIMESTAMP
# Date: $(date -Iseconds)

## Contenu
MANIFEST
    
    [ "$BACKUP_DB" = true ] && echo "- Base de données MongoDB" >> "$BACKUP_DIR/manifest_$TIMESTAMP.txt"
    [ "$BACKUP_CONFIG" = true ] && echo "- Configuration" >> "$BACKUP_DIR/manifest_$TIMESTAMP.txt"
    [ "$BACKUP_SITES" = true ] && echo "- Fichiers sites" >> "$BACKUP_DIR/manifest_$TIMESTAMP.txt"
    
    cat >> "$BACKUP_DIR/manifest_$TIMESTAMP.txt" << MANIFEST

## Fichiers
$(ls -la "$BACKUP_DIR"/*_$TIMESTAMP* 2>/dev/null || echo "Aucun fichier")

## Version Twoine
$(cat "$APP_DIR/package.json" 2>/dev/null | grep '"version"' || echo "Inconnue")

## Restauration
Pour restaurer: twoine-rollback $TIMESTAMP
MANIFEST
    
    log_success "Manifeste créé: manifest_$TIMESTAMP.txt"
}

print_summary() {
    [ "$QUIET" = true ] && return
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ BACKUP TERMINÉ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Timestamp: $TIMESTAMP"
    echo "  Répertoire: $BACKUP_DIR"
    echo ""
    echo "  Fichiers créés:"
    ls -lh "$BACKUP_DIR"/*_$TIMESTAMP* 2>/dev/null | awk '{print "    " $9 " (" $5 ")"}'
    echo ""
    echo "  Restauration: twoine-rollback $TIMESTAMP"
    echo ""
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    
    [ "$QUIET" = false ] && echo ""
    [ "$QUIET" = false ] && echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo -e "${CYAN}  TWOINE - Backup${NC}"
    [ "$QUIET" = false ] && echo -e "${CYAN}  $TIMESTAMP${NC}"
    [ "$QUIET" = false ] && echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    [ "$QUIET" = false ] && echo ""
    
    # Créer le répertoire de backup
    mkdir -p "$BACKUP_DIR"
    
    # Vérifications
    check_disk_space
    
    # Exécuter les sauvegardes
    backup_database
    backup_config
    backup_sites
    
    # Nettoyage
    cleanup_old_backups
    
    # Manifeste
    create_manifest
    
    # Résumé
    print_summary
    
    exit 0
}

main "$@"
