#!/bin/bash
#===============================================================================
# TWOINE - Domain Disable
# Désactive un site Nginx (supprime le lien symbolique et recharge Nginx)
#
# Usage: ./domain-disable.sh <domain>
#
# Exemple: ./domain-disable.sh example.com
#===============================================================================

set -euo pipefail

# Configuration
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

# Chemin
ENABLED_PATH="${NGINX_ENABLED}/${DOMAIN}.conf"

log_info "Désactivation du site: $DOMAIN"

# Vérifier si le site est activé
if [ ! -L "$ENABLED_PATH" ] && [ ! -f "$ENABLED_PATH" ]; then
    log_warning "Le site n'est pas activé ou n'existe pas"
    exit 0
fi

# Supprimer le lien symbolique
rm -f "$ENABLED_PATH"
log_success "Lien symbolique supprimé"

# Tester la configuration Nginx
log_info "Test de la configuration Nginx..."
if ! nginx -t 2>&1; then
    log_error "Configuration Nginx invalide après désactivation!"
    log_error "Vérifiez la configuration manuellement"
    exit 1
fi

log_success "Configuration Nginx valide"

# Recharger Nginx
log_info "Rechargement de Nginx..."
if systemctl reload nginx 2>&1; then
    log_success "Nginx rechargé avec succès"
else
    log_error "Échec du rechargement de Nginx"
    exit 1
fi

echo ""
log_success "Site $DOMAIN désactivé avec succès!"
exit 0
