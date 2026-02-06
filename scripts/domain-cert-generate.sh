#!/bin/bash
#===============================================================================
# TWOINE - Domain Certificate Generator
# Génère un certificat SSL auto-signé pour un domaine
#
# Usage: ./domain-cert-generate.sh <domain>
#
# Exemple: ./domain-cert-generate.sh example.com
#===============================================================================

set -euo pipefail

# Configuration
CERTS_DIR="${TWOINE_CERTS_DIR:-/etc/twoine/certs}"
CERT_VALIDITY_DAYS="${TWOINE_CERT_VALIDITY:-365}"
KEY_SIZE="${TWOINE_KEY_SIZE:-2048}"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions de log
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Vérification des arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <domain>"
    log_error "Exemple: $0 example.com"
    exit 1
fi

DOMAIN="$1"

# Validation du domaine (caractères autorisés)
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
    log_error "Nom de domaine invalide: $DOMAIN"
    exit 1
fi

# Vérification des caractères interdits
if [[ "$DOMAIN" == *";"* ]] || [[ "$DOMAIN" == *"|"* ]] || [[ "$DOMAIN" == *".."* ]] || [[ "$DOMAIN" == *" "* ]]; then
    log_error "Le domaine contient des caractères interdits (; | .. ou espaces)"
    exit 1
fi

# Convertir en minuscules
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')

# Chemins des fichiers
DOMAIN_DIR="${CERTS_DIR}/${DOMAIN}"
CERT_PATH="${DOMAIN_DIR}/cert.pem"
KEY_PATH="${DOMAIN_DIR}/key.pem"

log_info "Génération du certificat SSL auto-signé pour: $DOMAIN"
log_info "Répertoire: $DOMAIN_DIR"

# Vérifier si le certificat existe déjà
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
    log_warning "Un certificat existe déjà pour ce domaine"
    read -p "Voulez-vous le remplacer? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Opération annulée"
        exit 0
    fi
    
    # Backup de l'ancien certificat
    BACKUP_DIR="${DOMAIN_DIR}/backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    mv "$CERT_PATH" "$BACKUP_DIR/" 2>/dev/null || true
    mv "$KEY_PATH" "$BACKUP_DIR/" 2>/dev/null || true
    log_info "Ancien certificat sauvegardé dans: $BACKUP_DIR"
fi

# Créer le répertoire
mkdir -p "$DOMAIN_DIR"

# Générer le certificat avec OpenSSL
log_info "Génération du certificat RSA ${KEY_SIZE} bits, validité ${CERT_VALIDITY_DAYS} jours..."

openssl req -x509 -nodes -days "$CERT_VALIDITY_DAYS" -newkey "rsa:${KEY_SIZE}" \
    -keyout "$KEY_PATH" \
    -out "$CERT_PATH" \
    -subj "/CN=${DOMAIN}/O=Twoine/C=FR" \
    -addext "subjectAltName=DNS:${DOMAIN}" \
    2>/dev/null

if [ $? -ne 0 ]; then
    log_error "Échec de la génération du certificat"
    exit 1
fi

# Définir les permissions
chmod 600 "$KEY_PATH"
chmod 644 "$CERT_PATH"

# Vérifier le certificat généré
log_info "Vérification du certificat..."
CERT_INFO=$(openssl x509 -in "$CERT_PATH" -noout -subject -enddate 2>/dev/null)

if [ $? -eq 0 ]; then
    log_success "Certificat généré avec succès!"
    echo ""
    echo "=== Informations du certificat ==="
    echo "$CERT_INFO"
    echo ""
    echo "=== Chemins des fichiers ==="
    echo "Certificat: $CERT_PATH"
    echo "Clé privée: $KEY_PATH"
    echo ""
else
    log_error "Le certificat généré semble invalide"
    exit 1
fi

log_success "Terminé!"
exit 0
