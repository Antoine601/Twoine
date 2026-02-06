#!/bin/bash
#===============================================================================
# TWOINE - Domain Enable
# Active un site Nginx (crée le lien symbolique et recharge Nginx)
#
# Usage: ./domain-enable.sh <domain>
#
# Exemple: ./domain-enable.sh example.com
#===============================================================================

set -euo pipefail

# Configuration
NGINX_AVAILABLE="${TWOINE_NGINX_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_ENABLED="${TWOINE_NGINX_ENABLED:-/etc/nginx/sites-enabled}"

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

# Vérification des arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <domain>"
    exit 1
fi

DOMAIN="$1"

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

log_info "Activation du site: $DOMAIN"

# Vérifier que la config existe
if [ ! -f "$AVAILABLE_PATH" ]; then
    log_error "Configuration non trouvée: $AVAILABLE_PATH"
    log_error "Créez d'abord la configuration avec: domain-nginx-config.sh $DOMAIN <port>"
    exit 1
fi

# Vérifier si déjà activé
if [ -L "$ENABLED_PATH" ]; then
    log_warning "Le site est déjà activé"
    # Vérifier que le lien pointe vers le bon fichier
    CURRENT_TARGET=$(readlink -f "$ENABLED_PATH" 2>/dev/null || true)
    if [ "$CURRENT_TARGET" = "$AVAILABLE_PATH" ]; then
        log_info "Le lien symbolique est correct"
    else
        log_warning "Le lien pointe vers un fichier différent, mise à jour..."
        rm -f "$ENABLED_PATH"
    fi
fi

# Créer le lien symbolique
if [ ! -L "$ENABLED_PATH" ]; then
    ln -s "$AVAILABLE_PATH" "$ENABLED_PATH"
    log_success "Lien symbolique créé"
fi

# Tester la configuration Nginx
log_info "Test de la configuration Nginx..."
if ! nginx -t 2>&1; then
    log_error "Configuration Nginx invalide!"
    log_error "Suppression du lien symbolique..."
    rm -f "$ENABLED_PATH"
    exit 1
fi

log_success "Configuration Nginx valide"

# Recharger Nginx
log_info "Rechargement de Nginx..."
if systemctl reload nginx 2>&1; then
    log_success "Nginx rechargé avec succès"
else
    log_error "Échec du rechargement de Nginx"
    log_error "Rollback: suppression du lien symbolique..."
    rm -f "$ENABLED_PATH"
    systemctl reload nginx 2>/dev/null || true
    exit 1
fi

echo ""
log_success "Site $DOMAIN activé avec succès!"
exit 0
