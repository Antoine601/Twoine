#!/bin/bash

#===============================================================================
# TWOINE - Validation Script
# Vérifie que tous les composants de production fonctionnent correctement
#===============================================================================

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-validate"
INSTALL_DIR="/opt/twoine"
APP_DIR="/opt/twoine/app"
SITES_DIR="/var/www/twoine"
LOG_DIR="/var/log/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

ERRORS=0
WARNINGS=0
VERBOSE=false
FIX_MODE=false
QUIET=false
IS_ROOT=false

#-------------------------------------------------------------------------------
# FONCTIONS
#-------------------------------------------------------------------------------

print_usage() {
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose    Afficher les détails"
    echo "  -f, --fix        Tenter de corriger les problèmes automatiquement"
    echo "  -q, --quiet      Mode silencieux (uniquement code de sortie)"
    echo "  -h, --help       Afficher cette aide"
    echo ""
    echo "Codes de sortie:"
    echo "  0 - Toutes les validations passent"
    echo "  1 - Des erreurs critiques ont été détectées"
    echo "  2 - Des avertissements ont été détectés"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -f|--fix)
                FIX_MODE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Option inconnue: $1" >&2
                print_usage
                exit 1
                ;;
        esac
    done
}

check_pass() {
    local name="$1"
    [ "$QUIET" != true ] && echo -e "  ${GREEN}✓${NC} $name"
}

check_fail() {
    local name="$1"
    local critical="${2:-true}"
    
    if [ "$critical" = true ]; then
        [ "$QUIET" != true ] && echo -e "  ${RED}✗${NC} $name"
        ((ERRORS++))
    else
        [ "$QUIET" != true ] && echo -e "  ${YELLOW}!${NC} $name"
        ((WARNINGS++))
    fi
}

check_info() {
    local name="$1"
    [ "$VERBOSE" = true ] && echo -e "  ${BLUE}ℹ${NC} $name"
}

section() {
    [ "$QUIET" != true ] && echo ""
    [ "$QUIET" != true ] && echo -e "${BOLD}$1${NC}"
    [ "$QUIET" != true ] && echo "────────────────────────────────────────────"
}

create_env_file() {
    local env_file="$APP_DIR/.env"
    local env_example="$APP_DIR/.env.example"

    mkdir -p "$APP_DIR" 2>/dev/null || true

    if [ -f "$env_example" ]; then
        cp "$env_example" "$env_file" || return 1
    else
        cat > "$env_file" << 'EOF'
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/twoine
JWT_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING_MINIMUM_32_CHARS
JWT_REFRESH_SECRET=CHANGE_THIS_TO_ANOTHER_SECURE_RANDOM_STRING_32_CHARS
EOF
    fi

    chmod 600 "$env_file" 2>/dev/null || true
    chown twoine:twoine "$env_file" 2>/dev/null || true
    return 0
}

#-------------------------------------------------------------------------------
# CHECKS - SYSTÈME
#-------------------------------------------------------------------------------

check_os() {
    section "Système"
    
    # Vérifier Ubuntu
    if [ -f /etc/os-release ]; then
        source /etc/os-release
        if [ "$ID" = "ubuntu" ] && [ "$VERSION_ID" = "22.04" ]; then
            check_pass "Ubuntu 22.04 LTS"
        else
            check_fail "Ubuntu 22.04 requis (détecté: $ID $VERSION_ID)" false
        fi
    else
        check_fail "Impossible de déterminer l'OS"
    fi
    
    # Vérifier l'utilisateur twoine
    if id "twoine" &>/dev/null; then
        check_pass "Utilisateur système 'twoine'"
    else
        check_fail "Utilisateur 'twoine' manquant"
        if [ "$FIX_MODE" = true ]; then
            useradd -r -m -d /home/twoine -s /bin/bash twoine && check_info "Utilisateur créé"
        fi
    fi
    
    # Vérifier les groupes
    if groups twoine 2>/dev/null | grep -q "www-data"; then
        check_pass "Utilisateur twoine dans groupe www-data"
    else
        check_fail "twoine non membre de www-data" false
        if [ "$FIX_MODE" = true ]; then
            usermod -aG www-data twoine && check_info "Groupe ajouté"
        fi
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - SERVICES
#-------------------------------------------------------------------------------

check_services() {
    section "Services"
    
    # MongoDB
    if systemctl is-active --quiet mongod; then
        check_pass "MongoDB actif"
    else
        check_fail "MongoDB inactif"
        if [ "$FIX_MODE" = true ]; then
            systemctl start mongod && check_info "MongoDB démarré"
        fi
    fi
    
    # Twoine API
    if systemctl is-active --quiet twoine-api 2>/dev/null || systemctl is-active --quiet twoine 2>/dev/null; then
        check_pass "Twoine API actif"
    else
        check_fail "Twoine API inactif"
        if [ "$FIX_MODE" = true ]; then
            systemctl start twoine-api 2>/dev/null || systemctl start twoine && check_info "API démarrée"
        fi
    fi
    
    # Twoine Worker (optionnel)
    if systemctl list-unit-files | grep -q "twoine-worker.service"; then
        if systemctl is-active --quiet twoine-worker; then
            check_pass "Twoine Worker actif"
        else
            check_fail "Twoine Worker inactif" false
        fi
    fi
    
    # Twoine Supervisor (optionnel)
    if systemctl list-unit-files | grep -q "twoine-supervisor.service"; then
        if systemctl is-active --quiet twoine-supervisor; then
            check_pass "Twoine Supervisor actif"
        else
            check_fail "Twoine Supervisor inactif" false
        fi
    fi
    
    # Nginx
    if systemctl is-active --quiet nginx; then
        check_pass "Nginx actif"
    else
        check_fail "Nginx inactif"
        if [ "$FIX_MODE" = true ]; then
            systemctl start nginx && check_info "Nginx démarré"
        fi
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - CONNECTIVITÉ
#-------------------------------------------------------------------------------

check_connectivity() {
    section "Connectivité"
    
    # API Health
    if curl -sf --max-time 5 http://localhost:3000/api/health >/dev/null 2>&1; then
        check_pass "API répond (localhost:3000)"
    else
        check_fail "API ne répond pas"
    fi
    
    # HTTPS
    if curl -sfk --max-time 5 https://localhost/api/health >/dev/null 2>&1; then
        check_pass "HTTPS fonctionne"
    else
        check_fail "HTTPS ne fonctionne pas" false
    fi
    
    # MongoDB connection
    if mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
        check_pass "MongoDB accessible"
    else
        check_fail "MongoDB inaccessible"
    fi
    
    # DNS (si domaine configuré)
    if [ -f "$APP_DIR/.env" ]; then
        local domain
        domain=$(grep "^DOMAIN=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2)
        if [ -n "$domain" ]; then
            if host "$domain" >/dev/null 2>&1; then
                check_pass "DNS résolution ($domain)"
            else
                check_fail "DNS ne résout pas $domain" false
            fi
        fi
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - PORTS
#-------------------------------------------------------------------------------

check_ports() {
    section "Ports"
    
    # Port 80
    if ss -tlnp | grep -q ":80 "; then
        check_pass "Port 80 (HTTP) écoute"
    else
        check_fail "Port 80 n'écoute pas" false
    fi
    
    # Port 443
    if ss -tlnp | grep -q ":443 "; then
        check_pass "Port 443 (HTTPS) écoute"
    else
        check_fail "Port 443 n'écoute pas"
    fi
    
    # Port 3000 (interne uniquement)
    if ss -tlnp | grep -q "127.0.0.1:3000"; then
        check_pass "Port 3000 (API interne) écoute sur localhost"
    elif ss -tlnp | grep -q ":3000 "; then
        check_fail "Port 3000 exposé publiquement (devrait être localhost)" false
    else
        check_fail "Port 3000 n'écoute pas"
    fi
    
    # Port 27017 (MongoDB - interne)
    if ss -tlnp | grep -q "127.0.0.1:27017"; then
        check_pass "MongoDB écoute sur localhost uniquement"
    elif ss -tlnp | grep -q ":27017 "; then
        check_fail "MongoDB exposé publiquement (RISQUE SÉCURITÉ)"
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - PERMISSIONS
#-------------------------------------------------------------------------------

check_permissions() {
    section "Permissions"
    
    # /opt/twoine
    if [ -d "$INSTALL_DIR" ]; then
        local owner=$(stat -c '%U' "$INSTALL_DIR")
        if [ "$owner" = "twoine" ]; then
            check_pass "$INSTALL_DIR propriété de twoine"
        else
            check_fail "$INSTALL_DIR propriété de $owner (devrait être twoine)"
            if [ "$FIX_MODE" = true ]; then
                chown twoine:twoine "$INSTALL_DIR" && check_info "Propriétaire corrigé"
            fi
        fi
    else
        check_fail "$INSTALL_DIR n'existe pas"
    fi
    
    # .env permissions
    if [ -f "$APP_DIR/.env" ]; then
        local perms=$(stat -c '%a' "$APP_DIR/.env")
        if [ "$perms" = "600" ]; then
            check_pass ".env permissions 600"
        else
            check_fail ".env permissions $perms (devrait être 600)"
            if [ "$FIX_MODE" = true ]; then
                chmod 600 "$APP_DIR/.env" && check_info "Permissions .env corrigées"
            fi
        fi
    else
        check_fail "Fichier .env manquant"
        if [ "$FIX_MODE" = true ]; then
            if [ "$IS_ROOT" = true ] && create_env_file; then
                check_info ".env créé automatiquement"
                check_pass ".env créé"
                ((ERRORS--))
            else
                check_fail "Impossible de créer .env automatiquement (exécuter en root)" false
            fi
        fi
    fi
    
    # SSL key permissions
    if [ -f "$INSTALL_DIR/ssl/twoine.key" ]; then
        local perms=$(stat -c '%a' "$INSTALL_DIR/ssl/twoine.key")
        if [ "$perms" = "600" ] || [ "$perms" = "640" ]; then
            check_pass "Clé SSL permissions sécurisées"
        else
            check_fail "Clé SSL permissions $perms (devrait être 600)"
            if [ "$FIX_MODE" = true ]; then
                chmod 600 "$INSTALL_DIR/ssl/twoine.key" && check_info "Permissions clé corrigées"
            fi
        fi
    fi
    
    # Sites directory
    if [ -d "$SITES_DIR" ]; then
        local owner=$(stat -c '%U' "$SITES_DIR")
        if [ "$owner" = "twoine" ]; then
            check_pass "$SITES_DIR propriété de twoine"
        else
            check_fail "$SITES_DIR propriété de $owner"
        fi
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - SÉCURITÉ
#-------------------------------------------------------------------------------

check_security() {
    section "Sécurité"
    
    # UFW
    if command -v ufw &>/dev/null; then
        local ufw_output
        ufw_output=$(ufw status 2>/dev/null || true)

        if echo "$ufw_output" | grep -q "Status: active"; then
            check_pass "UFW firewall actif"
        elif [ -z "$ufw_output" ] && [ "$IS_ROOT" != true ]; then
            check_fail "Statut UFW non vérifiable sans root (utiliser sudo)" false
        else
            check_fail "UFW firewall inactif" false
        fi
    else
        check_fail "UFW non installé" false
    fi
    
    # Aucun service applicatif Twoine en root
    if pgrep -u root -f "node .*\/opt\/twoine\/app|node .*src\/(app|worker|monitor)\.js" >/dev/null 2>&1; then
        check_fail "Processus applicatif Twoine tourne en root"
    else
        check_pass "Aucun processus applicatif Twoine en root"
    fi
    
    # JWT Secret
    if [ -f "$APP_DIR/.env" ]; then
        local jwt_secret
        jwt_secret=$(grep "^JWT_SECRET=" "$APP_DIR/.env" 2>/dev/null | cut -d'=' -f2)
        if [ -n "$jwt_secret" ] && [ ${#jwt_secret} -ge 32 ]; then
            check_pass "JWT secret configuré (longueur OK)"
        else
            check_fail "JWT secret trop court ou manquant"
        fi
    fi
    
    # SSH password auth
    if grep -q "^PasswordAuthentication no" /etc/ssh/sshd_config 2>/dev/null; then
        check_pass "SSH: authentification par mot de passe désactivée"
    else
        check_fail "SSH: authentification par mot de passe active" false
    fi
    
    # Fail2ban
    if systemctl is-active --quiet fail2ban 2>/dev/null; then
        check_pass "Fail2ban actif"
    else
        check_fail "Fail2ban non actif" false
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - CONFIGURATION
#-------------------------------------------------------------------------------

check_configuration() {
    section "Configuration"
    
    # Fichier .env existe
    if [ -f "$APP_DIR/.env" ]; then
        check_pass "Fichier .env présent"
        
        # Variables requises
        for var in "NODE_ENV" "PORT" "MONGODB_URI" "JWT_SECRET"; do
            if grep -q "^${var}=" "$APP_DIR/.env"; then
                check_info "$var configuré"
            else
                check_fail "Variable $var manquante dans .env"
            fi
        done
    else
        check_fail "Fichier .env manquant" false
    fi
    
    # Nginx config
    if [ -f /etc/nginx/sites-enabled/twoine ] || [ -f /etc/nginx/sites-enabled/twoine-platform ]; then
        check_pass "Configuration Nginx active"
        
        local nginx_test_output
        nginx_test_output=$(nginx -t 2>&1 || true)
        if echo "$nginx_test_output" | grep -q "successful"; then
            check_pass "Configuration Nginx valide"
        elif [ "$IS_ROOT" != true ] && echo "$nginx_test_output" | grep -qiE "permission denied|need to be root"; then
            check_fail "Validation Nginx complète non disponible sans root" false
        else
            check_fail "Configuration Nginx invalide"
        fi
    else
        check_fail "Configuration Nginx Twoine manquante"
    fi
    
    # SSL certificats
    if [ -f "$INSTALL_DIR/ssl/twoine.crt" ] && [ -f "$INSTALL_DIR/ssl/twoine.key" ]; then
        check_pass "Certificats SSL présents"
        
        # Vérifier expiration
        local expiry
        expiry=$(openssl x509 -enddate -noout -in "$INSTALL_DIR/ssl/twoine.crt" 2>/dev/null | cut -d= -f2)
        if [ -n "$expiry" ]; then
            local expiry_ts=$(date -d "$expiry" +%s 2>/dev/null)
            local now_ts=$(date +%s)
            local days_left=$(( (expiry_ts - now_ts) / 86400 ))
            
            if [ $days_left -gt 30 ]; then
                check_pass "Certificat SSL valide ($days_left jours restants)"
            elif [ $days_left -gt 0 ]; then
                check_fail "Certificat SSL expire bientôt ($days_left jours)" false
            else
                check_fail "Certificat SSL expiré"
            fi
        fi
    else
        check_fail "Certificats SSL manquants"
    fi
}

#-------------------------------------------------------------------------------
# CHECKS - STOCKAGE
#-------------------------------------------------------------------------------

check_storage() {
    section "Stockage"
    
    # Espace disque
    local available_gb
    available_gb=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    
    if [ "$available_gb" -gt 5 ]; then
        check_pass "Espace disque OK (${available_gb}GB disponibles)"
    elif [ "$available_gb" -gt 1 ]; then
        check_fail "Espace disque faible (${available_gb}GB)" false
    else
        check_fail "Espace disque critique (${available_gb}GB)"
    fi
    
    # Inodes
    local inodes_available
    inodes_available=$(df -i / | awk 'NR==2 {print $4}')
    if [ "$inodes_available" -gt 100000 ]; then
        check_pass "Inodes disponibles OK"
    else
        check_fail "Inodes faibles" false
    fi
    
    # Logs rotation
    if [ -f /etc/logrotate.d/twoine ]; then
        check_pass "Rotation des logs configurée"
    else
        check_fail "Rotation des logs non configurée" false
    fi
}

#-------------------------------------------------------------------------------
# RÉSUMÉ
#-------------------------------------------------------------------------------

print_summary() {
    [ "$QUIET" = true ] && return
    
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    
    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}  ✓ TOUTES LES VALIDATIONS PASSENT${NC}"
        echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "  Twoine est prêt pour la production!"
    elif [ $ERRORS -eq 0 ]; then
        echo -e "${YELLOW}  ! VALIDATIONS PASSENT AVEC AVERTISSEMENTS${NC}"
        echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "  $WARNINGS avertissement(s) détecté(s)"
        echo "  Ces points méritent attention mais ne bloquent pas le fonctionnement."
    else
        echo -e "${RED}  ✗ DES ERREURS CRITIQUES ONT ÉTÉ DÉTECTÉES${NC}"
        echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "  $ERRORS erreur(s) critique(s)"
        echo "  $WARNINGS avertissement(s)"
        echo ""
        echo "  Actions recommandées:"
        echo "    - Corriger les erreurs en rouge"
        echo "    - Relancer: sudo $SCRIPT_NAME --fix"
    fi
    
    echo ""
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"

    if [ "$EUID" -eq 0 ]; then
        IS_ROOT=true
    fi

    if [ "$FIX_MODE" = true ] && [ "$IS_ROOT" != true ]; then
        [ "$QUIET" != true ] && echo -e "${YELLOW}[WARN]${NC} --fix nécessite root pour corriger les services, permissions et firewall"
    fi

    [ "$QUIET" != true ] && echo ""
    [ "$QUIET" != true ] && echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    [ "$QUIET" != true ] && echo -e "${CYAN}  TWOINE - Validation Production${NC}"
    [ "$QUIET" != true ] && echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    [ "$QUIET" != true ] && echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    
    check_os
    check_services
    check_connectivity
    check_ports
    check_permissions
    check_security
    check_configuration
    check_storage
    
    print_summary
    
    if [ $ERRORS -gt 0 ]; then
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        exit 2
    else
        exit 0
    fi
}

main "$@"
