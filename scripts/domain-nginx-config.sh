#!/bin/bash
#===============================================================================
# TWOINE - Domain Nginx Configuration
# Crée la configuration Nginx pour un domaine
#
# Usage: ./domain-nginx-config.sh <domain> <port> [--ssl] [--path-prefix=/]
#
# Exemple: ./domain-nginx-config.sh example.com 3000 --ssl
#===============================================================================

set -euo pipefail

# Configuration
NGINX_AVAILABLE="${TWOINE_NGINX_AVAILABLE:-/etc/nginx/sites-available}"
NGINX_ENABLED="${TWOINE_NGINX_ENABLED:-/etc/nginx/sites-enabled}"
CERTS_DIR="${TWOINE_CERTS_DIR:-/etc/twoine/certs}"
LOGS_DIR="${TWOINE_NGINX_LOGS:-/var/log/nginx}"

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

# Valeurs par défaut
SSL_ENABLED=false
PATH_PREFIX="/"
TARGET_ADDRESS="127.0.0.1"

# Parse des arguments
if [ $# -lt 2 ]; then
    log_error "Usage: $0 <domain> <port> [--ssl] [--path-prefix=/] [--target-address=127.0.0.1]"
    log_error "Exemple: $0 example.com 3000 --ssl"
    exit 1
fi

DOMAIN="$1"
PORT="$2"
shift 2

# Parse des options
while [[ $# -gt 0 ]]; do
    case $1 in
        --ssl)
            SSL_ENABLED=true
            shift
            ;;
        --path-prefix=*)
            PATH_PREFIX="${1#*=}"
            shift
            ;;
        --target-address=*)
            TARGET_ADDRESS="${1#*=}"
            shift
            ;;
        *)
            log_error "Option inconnue: $1"
            exit 1
            ;;
    esac
done

# Validation du domaine
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
    log_error "Nom de domaine invalide: $DOMAIN"
    exit 1
fi

# Vérification des caractères interdits
if [[ "$DOMAIN" == *";"* ]] || [[ "$DOMAIN" == *"|"* ]] || [[ "$DOMAIN" == *".."* ]] || [[ "$DOMAIN" == *" "* ]]; then
    log_error "Le domaine contient des caractères interdits"
    exit 1
fi

# Validation du port
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    log_error "Port invalide: $PORT (doit être entre 1 et 65535)"
    exit 1
fi

# Convertir en minuscules
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')

# Chemins des fichiers
CONFIG_PATH="${NGINX_AVAILABLE}/${DOMAIN}.conf"
CERT_PATH="${CERTS_DIR}/${DOMAIN}/cert.pem"
KEY_PATH="${CERTS_DIR}/${DOMAIN}/key.pem"

log_info "Création de la configuration Nginx pour: $DOMAIN"
log_info "Port cible: $PORT"
log_info "SSL: $SSL_ENABLED"

# Vérifier les certificats si SSL activé
if [ "$SSL_ENABLED" = true ]; then
    if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
        log_error "Certificats SSL non trouvés pour $DOMAIN"
        log_error "Certificat attendu: $CERT_PATH"
        log_error "Clé attendue: $KEY_PATH"
        log_error "Générez d'abord le certificat avec: domain-cert-generate.sh $DOMAIN"
        exit 1
    fi
    log_info "Certificats SSL trouvés"
fi

# Backup si config existe
if [ -f "$CONFIG_PATH" ]; then
    BACKUP_PATH="${CONFIG_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$CONFIG_PATH" "$BACKUP_PATH"
    log_info "Config existante sauvegardée: $BACKUP_PATH"
fi

# Générer la configuration
log_info "Génération de la configuration..."

cat > "$CONFIG_PATH" << EOF
# Configuration Nginx pour ${DOMAIN}
# Généré par Twoine - Ne pas modifier manuellement
# Date: $(date -Iseconds)

EOF

if [ "$SSL_ENABLED" = true ]; then
    # Configuration avec SSL (HTTP redirect + HTTPS)
    cat >> "$CONFIG_PATH" << EOF
# Redirection HTTP vers HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Redirection vers HTTPS
    return 301 https://\$server_name\$request_uri;
}

# Serveur HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # Certificat SSL
    ssl_certificate     ${CERT_PATH};
    ssl_certificate_key ${KEY_PATH};

    # Paramètres SSL recommandés
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # Headers de sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log ${LOGS_DIR}/${DOMAIN}.access.log;
    error_log ${LOGS_DIR}/${DOMAIN}.error.log;

    # Reverse proxy
    location ${PATH_PREFIX} {
        proxy_pass http://${TARGET_ADDRESS}:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_connect_timeout 60;
        proxy_send_timeout 60;
    }
}
EOF
else
    # Configuration HTTP uniquement
    cat >> "$CONFIG_PATH" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Logs
    access_log ${LOGS_DIR}/${DOMAIN}.access.log;
    error_log ${LOGS_DIR}/${DOMAIN}.error.log;

    # Reverse proxy
    location ${PATH_PREFIX} {
        proxy_pass http://${TARGET_ADDRESS}:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_connect_timeout 60;
        proxy_send_timeout 60;
    }
}
EOF
fi

log_success "Configuration créée: $CONFIG_PATH"

# Tester la configuration
log_info "Test de la configuration Nginx..."
if nginx -t 2>&1; then
    log_success "Configuration Nginx valide"
else
    log_error "Configuration Nginx invalide!"
    log_error "Restauration du backup si disponible..."
    if [ -f "$BACKUP_PATH" ]; then
        mv "$BACKUP_PATH" "$CONFIG_PATH"
        log_info "Backup restauré"
    else
        rm -f "$CONFIG_PATH"
        log_info "Configuration supprimée"
    fi
    exit 1
fi

echo ""
log_success "Configuration Nginx créée avec succès!"
echo ""
echo "=== Prochaines étapes ==="
echo "1. Activer le site: ln -s $CONFIG_PATH ${NGINX_ENABLED}/${DOMAIN}.conf"
echo "2. Recharger Nginx: systemctl reload nginx"
echo ""

exit 0
