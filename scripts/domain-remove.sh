#!/bin/bash
#===============================================================================
# TWOINE - Domain Remove
# Supprime complètement un domaine (config nginx + certificats)
#
# Usage: ./domain-remove.sh <domain> [--force]
#
# Exemple: ./domain-remove.sh example.com
#===============================================================================

set -euo pipefail

# Configuration
NGINX_AVAILABLE="${TWOINE_NGINX_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_ENABLED="${TWOINE_NGINX_ENABLED:-/etc/nginx/sites-enabled}"
CERTS_DIR="${TWOINE_CERTS_DIR:-/etc/twoine/certs}"
BACKUP_DIR="${TWOINE_BACKUP_DIR:-/var/backups/twoine/domains}"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Fonctions de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Options
FORCE=false

# Vérification des arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <domain> [--force]"
    exit 1
fi

DOMAIN="$1"
shift

# Parse des options
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE=true
            shift
            ;;
        *)
            log_error "Option inconnue: $1"
            exit 1
            ;;
    esac
done

# Validation du domaine
if [[ "$DOMAIN" == *";"* ]] || [[ "$DOMAIN" == *"|"* ]] || [[ "$DOMAIN" == *".."* ]] || [[ "$DOMAIN" == *" "* ]]; then
    log_error "Le domaine contient des caractères interdits"
    exit 1
fi

# Convertir en minuscules
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')

# Chemins
AVAILABLE_PATH="${NGINX_AVAILABLE}/${DOMAIN}.conf"
ENABLED_PATH="${NGINX_ENABLED}/${DOMAIN}.conf"
CERT_DIR="${CERTS_DIR}/${DOMAIN}"

log_info "Suppression du domaine: $DOMAIN"

# Confirmation si pas --force
if [ "$FORCE" = false ]; then
    echo ""
    echo "Cette opération va supprimer:"
    [ -f "$AVAILABLE_PATH" ] && echo "  - Configuration Nginx: $AVAILABLE_PATH"
    [ -L "$ENABLED_PATH" ] && echo "  - Lien symbolique: $ENABLED_PATH"
    [ -d "$CERT_DIR" ] && echo "  - Certificats SSL: $CERT_DIR"
    echo ""
    read -p "Êtes-vous sûr de vouloir continuer? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Opération annulée"
        exit 0
    fi
fi

# Créer le répertoire de backup
DOMAIN_BACKUP="${BACKUP_DIR}/${DOMAIN}_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DOMAIN_BACKUP"

# 1. Désactiver le site (supprimer le lien symbolique)
if [ -L "$ENABLED_PATH" ] || [ -f "$ENABLED_PATH" ]; then
    log_info "Désactivation du site..."
    rm -f "$ENABLED_PATH"
    log_success "Site désactivé"
fi

# 2. Sauvegarder et supprimer la config Nginx
if [ -f "$AVAILABLE_PATH" ]; then
    log_info "Sauvegarde de la configuration Nginx..."
    cp "$AVAILABLE_PATH" "$DOMAIN_BACKUP/nginx.conf"
    log_info "Suppression de la configuration Nginx..."
    rm -f "$AVAILABLE_PATH"
    log_success "Configuration Nginx supprimée"
fi

# 3. Sauvegarder et supprimer les certificats
if [ -d "$CERT_DIR" ]; then
    log_info "Sauvegarde des certificats..."
    cp -r "$CERT_DIR" "$DOMAIN_BACKUP/certs"
    log_info "Suppression des certificats..."
    rm -rf "$CERT_DIR"
    log_success "Certificats supprimés"
fi

# 4. Tester la configuration Nginx
log_info "Test de la configuration Nginx..."
if ! nginx -t 2>&1; then
    log_error "Configuration Nginx invalide après suppression!"
    log_error "Les fichiers ont été sauvegardés dans: $DOMAIN_BACKUP"
    log_error "Restaurez manuellement si nécessaire"
    exit 1
fi

log_success "Configuration Nginx valide"

# 5. Recharger Nginx
log_info "Rechargement de Nginx..."
if systemctl reload nginx 2>&1; then
    log_success "Nginx rechargé avec succès"
else
    log_warning "Échec du rechargement de Nginx (le service n'est peut-être pas actif)"
fi

echo ""
log_success "Domaine $DOMAIN supprimé avec succès!"
echo ""
echo "=== Backup ==="
echo "Les fichiers ont été sauvegardés dans: $DOMAIN_BACKUP"
echo ""

exit 0
