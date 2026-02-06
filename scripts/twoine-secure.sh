#!/bin/bash

#===============================================================================
# TWOINE - Security Hardening Script
# Sécurise le serveur pour un environnement de production
#===============================================================================

set -e

#-------------------------------------------------------------------------------
# CONFIGURATION
#-------------------------------------------------------------------------------

SCRIPT_NAME="twoine-secure"
INSTALL_DIR="/opt/twoine"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
INTERACTIVE=true
SKIP_SSH=false
SKIP_FIREWALL=false

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
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}▶ $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

execute() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
        return 0
    fi
    "$@"
}

confirm() {
    if [ "$INTERACTIVE" = false ]; then
        return 0
    fi
    
    local message="$1"
    read -p "$message [y/N]: " response
    [[ "$response" =~ ^[Yy]$ ]]
}

print_usage() {
    echo "Usage: $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --dry-run        Simuler sans appliquer"
    echo "  -y, --yes            Mode non-interactif"
    echo "  --skip-ssh           Ne pas modifier la config SSH"
    echo "  --skip-firewall      Ne pas configurer UFW"
    echo "  -h, --help           Afficher cette aide"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -y|--yes)
                INTERACTIVE=false
                shift
                ;;
            --skip-ssh)
                SKIP_SSH=true
                shift
                ;;
            --skip-firewall)
                SKIP_FIREWALL=true
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

#-------------------------------------------------------------------------------
# FIREWALL (UFW)
#-------------------------------------------------------------------------------

configure_firewall() {
    if [ "$SKIP_FIREWALL" = true ]; then
        log_warning "Configuration firewall ignorée (--skip-firewall)"
        return 0
    fi
    
    log_step "Configuration du Firewall (UFW)"
    
    # Installer UFW si nécessaire
    if ! command -v ufw &>/dev/null; then
        log_info "Installation de UFW..."
        execute apt-get install -y ufw
    fi
    
    log_info "Configuration des règles UFW..."
    
    # Reset des règles
    execute ufw --force reset
    
    # Politique par défaut
    execute ufw default deny incoming
    execute ufw default allow outgoing
    
    # SSH
    execute ufw allow 22/tcp comment 'SSH'
    
    # HTTP/HTTPS
    execute ufw allow 80/tcp comment 'HTTP'
    execute ufw allow 443/tcp comment 'HTTPS'
    
    # Activer UFW
    execute ufw --force enable
    
    log_success "Firewall configuré"
    
    # Afficher les règles
    echo ""
    ufw status numbered
}

#-------------------------------------------------------------------------------
# SSH HARDENING
#-------------------------------------------------------------------------------

configure_ssh() {
    if [ "$SKIP_SSH" = true ]; then
        log_warning "Configuration SSH ignorée (--skip-ssh)"
        return 0
    fi
    
    log_step "Sécurisation SSH"
    
    local sshd_config="/etc/ssh/sshd_config"
    local backup_file="/etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Backup
    if [ "$DRY_RUN" = false ]; then
        cp "$sshd_config" "$backup_file"
        log_info "Backup créé: $backup_file"
    fi
    
    # Vérifier si des clés SSH sont configurées
    local has_keys=false
    for user_home in /home/* /root; do
        if [ -f "$user_home/.ssh/authorized_keys" ] && [ -s "$user_home/.ssh/authorized_keys" ]; then
            has_keys=true
            break
        fi
    done
    
    if [ "$has_keys" = false ]; then
        log_warning "Aucune clé SSH détectée!"
        echo ""
        echo -e "${YELLOW}ATTENTION: Désactiver l'authentification par mot de passe${NC}"
        echo -e "${YELLOW}sans clé SSH configurée vous bloquera l'accès au serveur!${NC}"
        echo ""
        
        if ! confirm "Continuer quand même ?"; then
            log_info "Configuration SSH annulée"
            return 0
        fi
    fi
    
    log_info "Application des paramètres de sécurité SSH..."
    
    if [ "$DRY_RUN" = false ]; then
        # Créer une configuration sécurisée
        cat > /etc/ssh/sshd_config.d/99-twoine-security.conf << 'SSHCONF'
# Twoine SSH Security Configuration
# Generated by twoine-secure

# Désactiver l'authentification par mot de passe
PasswordAuthentication no
PermitEmptyPasswords no

# Authentification par clé uniquement
PubkeyAuthentication yes

# Root login avec clé uniquement
PermitRootLogin prohibit-password

# Limiter les tentatives
MaxAuthTries 3
MaxSessions 5

# Timeouts
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2

# Désactiver les fonctionnalités inutiles
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTunnel no

# Protocole et algorithmes sécurisés
Protocol 2
KexAlgorithms curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com

# Logging
LogLevel VERBOSE
SSHCONF
        
        # Tester la configuration
        if sshd -t 2>/dev/null; then
            log_success "Configuration SSH valide"
            execute systemctl reload sshd
            log_success "SSH rechargé"
        else
            log_error "Configuration SSH invalide, restauration..."
            rm -f /etc/ssh/sshd_config.d/99-twoine-security.conf
            return 1
        fi
    else
        log_info "[DRY-RUN] Créerait /etc/ssh/sshd_config.d/99-twoine-security.conf"
    fi
}

#-------------------------------------------------------------------------------
# FAIL2BAN
#-------------------------------------------------------------------------------

configure_fail2ban() {
    log_step "Configuration de Fail2ban"
    
    # Installer si nécessaire
    if ! command -v fail2ban-client &>/dev/null; then
        log_info "Installation de Fail2ban..."
        execute apt-get install -y fail2ban
    fi
    
    log_info "Configuration des jails Fail2ban..."
    
    if [ "$DRY_RUN" = false ]; then
        cat > /etc/fail2ban/jail.d/twoine.conf << 'F2BCONF'
# Twoine Fail2ban Configuration

[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 24h

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/twoine/nginx/error.log
maxretry = 10
bantime = 1h

[twoine-auth]
enabled = true
port = http,https
filter = twoine-auth
logpath = /var/log/twoine/app/*.log
maxretry = 5
bantime = 1h
F2BCONF

        # Créer le filtre pour Twoine
        cat > /etc/fail2ban/filter.d/twoine-auth.conf << 'FILTER'
[Definition]
failregex = ^.*Failed login attempt from <HOST>.*$
            ^.*Authentication failed for .* from <HOST>.*$
            ^.*Invalid token from <HOST>.*$
ignoreregex =
FILTER

        execute systemctl enable fail2ban
        execute systemctl restart fail2ban
    fi
    
    log_success "Fail2ban configuré"
}

#-------------------------------------------------------------------------------
# PERMISSIONS SYSTÈME
#-------------------------------------------------------------------------------

secure_permissions() {
    log_step "Sécurisation des permissions"
    
    # Répertoire Twoine
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Sécurisation de $INSTALL_DIR..."
        execute chown -R twoine:twoine "$INSTALL_DIR"
        execute chmod 750 "$INSTALL_DIR"
        
        if [ -d "$INSTALL_DIR/config" ]; then
            execute chmod 700 "$INSTALL_DIR/config"
        fi
        
        if [ -d "$INSTALL_DIR/ssl" ]; then
            execute chmod 700 "$INSTALL_DIR/ssl"
            if [ -f "$INSTALL_DIR/ssl/twoine.key" ]; then
                execute chmod 600 "$INSTALL_DIR/ssl/twoine.key"
            fi
        fi
        
        if [ -f "$INSTALL_DIR/app/.env" ]; then
            execute chmod 600 "$INSTALL_DIR/app/.env"
        fi
        
        log_success "Permissions Twoine sécurisées"
    fi
    
    # Sites utilisateurs
    if [ -d "/var/www/twoine" ]; then
        log_info "Sécurisation de /var/www/twoine..."
        execute chown twoine:twoine /var/www/twoine
        execute chmod 750 /var/www/twoine
        log_success "Permissions sites sécurisées"
    fi
    
    # Logs
    if [ -d "/var/log/twoine" ]; then
        log_info "Sécurisation de /var/log/twoine..."
        execute chown -R twoine:twoine /var/log/twoine
        execute chmod 750 /var/log/twoine
        log_success "Permissions logs sécurisées"
    fi
}

#-------------------------------------------------------------------------------
# MONGODB SÉCURITÉ
#-------------------------------------------------------------------------------

secure_mongodb() {
    log_step "Sécurisation MongoDB"
    
    # Vérifier que MongoDB écoute uniquement sur localhost
    if grep -q "bindIp: 127.0.0.1" /etc/mongod.conf 2>/dev/null || \
       grep -q "bind_ip = 127.0.0.1" /etc/mongod.conf 2>/dev/null; then
        log_success "MongoDB écoute sur localhost uniquement"
    else
        log_warning "Vérifiez que MongoDB est configuré pour localhost uniquement"
        
        if [ "$DRY_RUN" = false ] && confirm "Configurer MongoDB pour localhost ?"; then
            # Backup
            cp /etc/mongod.conf /etc/mongod.conf.backup
            
            # S'assurer que bindIp est défini
            if grep -q "^  bindIp:" /etc/mongod.conf; then
                sed -i 's/^  bindIp:.*/  bindIp: 127.0.0.1/' /etc/mongod.conf
            elif grep -q "^net:" /etc/mongod.conf; then
                sed -i '/^net:/a\  bindIp: 127.0.0.1' /etc/mongod.conf
            fi
            
            execute systemctl restart mongod
            log_success "MongoDB configuré pour localhost"
        fi
    fi
}

#-------------------------------------------------------------------------------
# NGINX SECURITY HEADERS
#-------------------------------------------------------------------------------

secure_nginx() {
    log_step "Sécurisation Nginx"
    
    log_info "Création de la configuration de sécurité Nginx..."
    
    if [ "$DRY_RUN" = false ]; then
        cat > /etc/nginx/conf.d/security.conf << 'NGINXSEC'
# Twoine Nginx Security Configuration

# Hide Nginx version
server_tokens off;

# Prevent clickjacking
add_header X-Frame-Options "SAMEORIGIN" always;

# Prevent MIME type sniffing
add_header X-Content-Type-Options "nosniff" always;

# XSS Protection
add_header X-XSS-Protection "1; mode=block" always;

# Referrer Policy
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Content Security Policy (basic)
# add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

# HSTS (uncomment after HTTPS is properly configured)
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Limit request methods
# if ($request_method !~ ^(GET|HEAD|POST|PUT|DELETE)$) {
#     return 444;
# }
NGINXSEC
        
        if nginx -t 2>/dev/null; then
            execute systemctl reload nginx
            log_success "Configuration Nginx sécurisée"
        else
            log_error "Configuration Nginx invalide"
            rm -f /etc/nginx/conf.d/security.conf
        fi
    fi
}

#-------------------------------------------------------------------------------
# AUTOMATIC UPDATES
#-------------------------------------------------------------------------------

configure_auto_updates() {
    log_step "Configuration des mises à jour automatiques"
    
    if ! dpkg -l | grep -q unattended-upgrades; then
        log_info "Installation de unattended-upgrades..."
        execute apt-get install -y unattended-upgrades
    fi
    
    if [ "$DRY_RUN" = false ]; then
        cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'AUTOUPDATE'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
AUTOUPDATE

        cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOUPGRADE'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
AUTOUPGRADE
    fi
    
    log_success "Mises à jour automatiques configurées"
}

#-------------------------------------------------------------------------------
# CHECKLIST
#-------------------------------------------------------------------------------

print_security_checklist() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  CHECKLIST SÉCURITÉ PRODUCTION${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    local checks=(
        "UFW firewall actif"
        "SSH: authentification par clé uniquement"
        "SSH: root login désactivé ou restreint"
        "Fail2ban actif"
        "MongoDB écoute sur localhost uniquement"
        "Certificats SSL configurés"
        "Headers de sécurité Nginx"
        "Fichiers .env en permissions 600"
        "Aucun service Twoine en root"
        "Mises à jour automatiques actives"
        "Rotation des logs configurée"
        "Backups automatiques"
    )
    
    for check in "${checks[@]}"; do
        echo "  [ ] $check"
    done
    
    echo ""
    echo "Vérifiez manuellement chaque point et cochez-le."
    echo "Exécutez 'twoine-validate' pour une vérification automatique."
    echo ""
}

#-------------------------------------------------------------------------------
# MAIN
#-------------------------------------------------------------------------------

main() {
    parse_arguments "$@"
    check_root
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  TWOINE - Sécurisation Production${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo ""
        echo -e "${YELLOW}>>> MODE SIMULATION <<<${NC}"
    fi
    
    configure_firewall
    configure_ssh
    configure_fail2ban
    secure_permissions
    secure_mongodb
    secure_nginx
    configure_auto_updates
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ SÉCURISATION TERMINÉE${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    
    print_security_checklist
}

main "$@"
