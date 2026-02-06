#!/bin/bash

#===============================================================================
# TWOINE - DNS & Domain Management Module
# Version: 1.0.0
# Description: Gestion des domaines, DNS, hostname pour l'installation Twoine
#===============================================================================

#-------------------------------------------------------------------------------
# CONSTANTES
#-------------------------------------------------------------------------------

DNS_CHECK_TIMEOUT=5
DNS_RESOLVERS=("8.8.8.8" "1.1.1.1" "9.9.9.9")
IP_SERVICES=("https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com")

#-------------------------------------------------------------------------------
# RÉCUPÉRATION IP PUBLIQUE
#-------------------------------------------------------------------------------

get_public_ip() {
    local ip=""
    local service
    
    for service in "${IP_SERVICES[@]}"; do
        ip=$(curl -s --max-time 5 "$service" 2>/dev/null | tr -d '[:space:]')
        
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    
    return 1
}

get_local_ip() {
    hostname -I | awk '{print $1}'
}

validate_ipv4() {
    local ip="$1"
    local valid_regex='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
    
    if [[ ! "$ip" =~ $valid_regex ]]; then
        return 1
    fi
    
    local IFS='.'
    read -ra octets <<< "$ip"
    
    for octet in "${octets[@]}"; do
        if [ "$octet" -gt 255 ]; then
            return 1
        fi
    done
    
    return 0
}

#-------------------------------------------------------------------------------
# RÉSOLUTION DNS
#-------------------------------------------------------------------------------

resolve_domain() {
    local domain="$1"
    local resolved_ip=""
    local resolver
    
    for resolver in "${DNS_RESOLVERS[@]}"; do
        resolved_ip=$(dig +short +time=$DNS_CHECK_TIMEOUT "@$resolver" "$domain" A 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        
        if [ -n "$resolved_ip" ]; then
            echo "$resolved_ip"
            return 0
        fi
    done
    
    resolved_ip=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -1)
    
    if [ -n "$resolved_ip" ]; then
        echo "$resolved_ip"
        return 0
    fi
    
    return 1
}

check_domain_propagation() {
    local domain="$1"
    local expected_ip="$2"
    local success_count=0
    local resolver
    local resolved_ip
    
    for resolver in "${DNS_RESOLVERS[@]}"; do
        resolved_ip=$(dig +short +time=$DNS_CHECK_TIMEOUT "@$resolver" "$domain" A 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
        
        if [ "$resolved_ip" = "$expected_ip" ]; then
            ((success_count++))
        fi
    done
    
    echo "$success_count/${#DNS_RESOLVERS[@]}"
    
    if [ "$success_count" -eq "${#DNS_RESOLVERS[@]}" ]; then
        return 0
    else
        return 1
    fi
}

#-------------------------------------------------------------------------------
# VALIDATION DOMAINE
#-------------------------------------------------------------------------------

validate_domain_format() {
    local domain="$1"
    
    local domain_regex='^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
    
    if [[ "$domain" =~ $domain_regex ]]; then
        return 0
    else
        return 1
    fi
}

validate_domain_dns() {
    local domain="$1"
    local server_ip="$2"
    local resolved_ip
    
    resolved_ip=$(resolve_domain "$domain")
    
    if [ -z "$resolved_ip" ]; then
        echo "UNRESOLVED"
        return 1
    fi
    
    if [ "$resolved_ip" = "$server_ip" ]; then
        echo "MATCH"
        return 0
    else
        echo "MISMATCH:$resolved_ip"
        return 2
    fi
}

#-------------------------------------------------------------------------------
# GESTION HOSTNAME
#-------------------------------------------------------------------------------

get_current_hostname() {
    hostname
}

get_current_fqdn() {
    hostname -f 2>/dev/null || hostname
}

set_hostname() {
    local new_hostname="$1"
    local set_fqdn="${2:-false}"
    
    if [ -z "$new_hostname" ]; then
        return 1
    fi
    
    hostnamectl set-hostname "$new_hostname"
    
    local short_hostname
    short_hostname=$(echo "$new_hostname" | cut -d'.' -f1)
    
    if ! grep -q "127.0.1.1" /etc/hosts; then
        echo "127.0.1.1    $new_hostname $short_hostname" >> /etc/hosts
    else
        sed -i "s/^127\.0\.1\.1.*/127.0.1.1    $new_hostname $short_hostname/" /etc/hosts
    fi
    
    return 0
}

validate_hostname_format() {
    local hostname="$1"
    
    local hostname_regex='^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
    
    if [[ "$hostname" =~ $hostname_regex ]] && [ ${#hostname} -le 253 ]; then
        return 0
    else
        return 1
    fi
}

#-------------------------------------------------------------------------------
# CERTIFICATS SSL AUTO-SIGNÉS
#-------------------------------------------------------------------------------

generate_self_signed_cert() {
    local domain="$1"
    local cert_dir="$2"
    local days="${3:-365}"
    
    local cn="$domain"
    [ -z "$cn" ] && cn="localhost"
    
    mkdir -p "$cert_dir"
    
    local san="DNS:$cn,DNS:localhost,IP:127.0.0.1"
    
    local server_ip
    server_ip=$(get_public_ip) && san="$san,IP:$server_ip"
    
    openssl req -x509 -nodes -days "$days" -newkey rsa:2048 \
        -keyout "$cert_dir/twoine.key" \
        -out "$cert_dir/twoine.crt" \
        -subj "/C=XX/ST=State/L=City/O=Twoine/OU=Platform/CN=$cn" \
        -addext "subjectAltName=$san" \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        chmod 600 "$cert_dir/twoine.key"
        chmod 644 "$cert_dir/twoine.crt"
        return 0
    else
        return 1
    fi
}

verify_ssl_cert() {
    local cert_path="$1"
    
    if [ ! -f "$cert_path" ]; then
        echo "NOT_FOUND"
        return 1
    fi
    
    local expiry
    expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
    
    if [ -z "$expiry" ]; then
        echo "INVALID"
        return 2
    fi
    
    local expiry_epoch
    local now_epoch
    expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null)
    now_epoch=$(date +%s)
    
    if [ "$expiry_epoch" -lt "$now_epoch" ]; then
        echo "EXPIRED"
        return 3
    fi
    
    local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))
    echo "VALID:$days_remaining"
    return 0
}

#-------------------------------------------------------------------------------
# GÉNÉRATION CONFIG NGINX PLATEFORME
#-------------------------------------------------------------------------------

generate_nginx_platform_config() {
    local domain="$1"
    local port="$2"
    local ssl_cert="$3"
    local ssl_key="$4"
    local log_dir="$5"
    local admin_port="${6:-443}"
    
    local server_name="_"
    [ -n "$domain" ] && server_name="$domain"
    
    cat << NGINX_PLATFORM
# ============================================================================
# TWOINE PLATFORM - Nginx Configuration
# Generated: $(date -Iseconds)
# Domain: ${domain:-"IP-based access"}
# ============================================================================

upstream twoine_platform {
    server 127.0.0.1:${port};
    keepalive 64;
}

# Rate Limiting Zones
limit_req_zone \$binary_remote_addr zone=twoine_api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=twoine_login:10m rate=5r/m;

# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    # Let's Encrypt ACME Challenge (pour future configuration)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS Platform Server
server {
    listen ${admin_port} ssl http2;
    listen [::]:${admin_port} ssl http2;
    server_name ${server_name};

    # SSL Configuration
    ssl_certificate ${ssl_cert};
    ssl_certificate_key ${ssl_key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:TwoineSSL:10m;
    ssl_session_tickets off;

    # OCSP Stapling (pour certificats Let's Encrypt)
    # ssl_stapling on;
    # ssl_stapling_verify on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;

    # Logging
    access_log ${log_dir}/nginx/platform-access.log;
    error_log ${log_dir}/nginx/platform-error.log;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml application/rss+xml application/atom+xml image/svg+xml;

    # Client Settings
    client_max_body_size 50M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    # Proxy Settings
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # API Endpoints with Rate Limiting
    location /api/auth/ {
        limit_req zone=twoine_login burst=3 nodelay;
        limit_req_status 429;
        
        proxy_pass http://twoine_platform;
    }

    location /api/ {
        limit_req zone=twoine_api burst=20 nodelay;
        limit_req_status 429;
        
        proxy_pass http://twoine_platform;
    }

    # WebSocket Support (pour futures fonctionnalités temps réel)
    location /ws/ {
        proxy_pass http://twoine_platform;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # Static Assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg|eot)$ {
        proxy_pass http://twoine_platform;
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Main Application
    location / {
        proxy_pass http://twoine_platform;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
    }

    # Health Check (interne)
    location /health {
        access_log off;
        proxy_pass http://twoine_platform/api/health;
    }

    # Block sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINX_PLATFORM
}

#-------------------------------------------------------------------------------
# GÉNÉRATION CONFIG NGINX SITE HÉBERGÉ (TEMPLATE)
#-------------------------------------------------------------------------------

generate_nginx_site_template() {
    cat << 'NGINX_SITE_TEMPLATE'
# ============================================================================
# TWOINE HOSTED SITE - Nginx Configuration Template
# Variables to replace:
#   {{SITE_ID}}       - Unique site identifier
#   {{DOMAIN}}        - Site domain name
#   {{UPSTREAM_PORT}} - Backend port for this site
#   {{SSL_CERT}}      - Path to SSL certificate
#   {{SSL_KEY}}       - Path to SSL private key
#   {{LOG_DIR}}       - Site log directory
#   {{ROOT_DIR}}      - Site document root (for static files)
# ============================================================================

upstream site_{{SITE_ID}} {
    server 127.0.0.1:{{UPSTREAM_PORT}};
    keepalive 32;
}

# HTTP -> HTTPS Redirect
server {
    listen 80;
    listen [::]:80;
    server_name {{DOMAIN}} www.{{DOMAIN}};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{DOMAIN}} www.{{DOMAIN}};

    # SSL
    ssl_certificate {{SSL_CERT}};
    ssl_certificate_key {{SSL_KEY}};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:Site{{SITE_ID}}SSL:10m;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log {{LOG_DIR}}/access.log;
    error_log {{LOG_DIR}}/error.log;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Client
    client_max_body_size 100M;

    # Root for static files
    root {{ROOT_DIR}}/public;
    index index.html index.htm;

    # Try static files first, then proxy to backend
    location / {
        try_files $uri $uri/ @backend;
    }

    location @backend {
        proxy_pass http://site_{{SITE_ID}};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }

    # Static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Block hidden files
    location ~ /\. {
        deny all;
    }
}
NGINX_SITE_TEMPLATE
}

#-------------------------------------------------------------------------------
# FONCTIONS INTERACTIVES INSTALLATION
#-------------------------------------------------------------------------------

prompt_domain_configuration() {
    local result_var="$1"
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Configuration du domaine Twoine${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Twoine peut être accessible de deux façons :"
    echo "  1. Via un nom de domaine (ex: twoine.exemple.com)"
    echo "  2. Via l'IP du serveur (ex: https://203.0.113.50)"
    echo ""
    
    read -p "Voulez-vous utiliser un nom de domaine pour accéder à Twoine ? [o/N]: " use_domain
    
    if [[ "$use_domain" =~ ^[OoYy]$ ]]; then
        configure_with_domain "$result_var"
    else
        configure_without_domain "$result_var"
    fi
}

configure_with_domain() {
    local result_var="$1"
    local domain=""
    local server_ip=""
    local dns_result=""
    
    server_ip=$(get_public_ip)
    if [ -z "$server_ip" ]; then
        echo -e "${RED}[ERREUR]${NC} Impossible de déterminer l'IP publique du serveur."
        echo "Vérifiez votre connexion internet."
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}IP publique détectée : ${GREEN}$server_ip${NC}"
    echo ""
    
    while true; do
        read -p "Entrez le nom de domaine pour Twoine : " domain
        
        if [ -z "$domain" ]; then
            echo -e "${YELLOW}[AVERTISSEMENT]${NC} Domaine vide. Retour au mode IP."
            configure_without_domain "$result_var"
            return $?
        fi
        
        if ! validate_domain_format "$domain"; then
            echo -e "${RED}[ERREUR]${NC} Format de domaine invalide."
            echo "Exemples valides : twoine.exemple.com, panel.monsite.fr"
            continue
        fi
        
        echo ""
        echo -e "${BLUE}[INFO]${NC} Vérification DNS pour $domain..."
        
        dns_result=$(validate_domain_dns "$domain" "$server_ip")
        
        case "$dns_result" in
            "MATCH")
                echo -e "${GREEN}[OK]${NC} Le domaine $domain pointe vers $server_ip"
                break
                ;;
            "UNRESOLVED")
                echo ""
                echo -e "${RED}[ERREUR]${NC} Le domaine $domain ne peut pas être résolu."
                echo ""
                echo "Actions requises :"
                echo "  1. Créez un enregistrement DNS de type A :"
                echo "     Nom    : $domain"
                echo "     Type   : A"
                echo "     Valeur : $server_ip"
                echo ""
                echo "  2. Attendez la propagation DNS (5-60 minutes)"
                echo "  3. Relancez l'installation"
                echo ""
                read -p "Réessayer maintenant ? [o/N]: " retry
                if [[ ! "$retry" =~ ^[OoYy]$ ]]; then
                    echo "Passage en mode IP..."
                    configure_without_domain "$result_var"
                    return $?
                fi
                ;;
            MISMATCH:*)
                local wrong_ip="${dns_result#MISMATCH:}"
                echo ""
                echo -e "${RED}[ERREUR]${NC} Le domaine $domain pointe vers $wrong_ip"
                echo "           mais ce serveur a l'IP $server_ip"
                echo ""
                echo "Actions requises :"
                echo "  1. Modifiez l'enregistrement DNS de type A :"
                echo "     Nom    : $domain"
                echo "     Type   : A"
                echo "     Valeur : $server_ip  (au lieu de $wrong_ip)"
                echo ""
                echo "  2. Attendez la propagation DNS"
                echo "  3. Relancez l'installation"
                echo ""
                read -p "Réessayer maintenant ? [o/N]: " retry
                if [[ ! "$retry" =~ ^[OoYy]$ ]]; then
                    echo "Passage en mode IP..."
                    configure_without_domain "$result_var"
                    return $?
                fi
                ;;
        esac
    done
    
    propagation=$(check_domain_propagation "$domain" "$server_ip")
    echo -e "${BLUE}[INFO]${NC} Propagation DNS : $propagation serveurs OK"
    
    eval "$result_var='$domain'"
    return 0
}

configure_without_domain() {
    local result_var="$1"
    local server_ip
    
    server_ip=$(get_public_ip)
    if [ -z "$server_ip" ]; then
        server_ip=$(get_local_ip)
    fi
    
    echo ""
    echo -e "${BLUE}[INFO]${NC} Twoine sera accessible via : https://$server_ip"
    echo -e "${YELLOW}[NOTE]${NC} Un certificat auto-signé sera généré."
    echo "        Vous pourrez configurer un domaine plus tard."
    echo ""
    
    eval "$result_var=''"
    return 0
}

#-------------------------------------------------------------------------------
# GESTION HOSTNAME INTERACTIVE
#-------------------------------------------------------------------------------

prompt_hostname_configuration() {
    local domain="$1"
    local current_hostname
    
    current_hostname=$(get_current_hostname)
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Configuration du Hostname${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "Hostname actuel : ${GREEN}$current_hostname${NC}"
    
    if [ -n "$domain" ]; then
        echo -e "Domaine Twoine  : ${GREEN}$domain${NC}"
        echo ""
        
        if [ "$current_hostname" != "$domain" ]; then
            read -p "Voulez-vous synchroniser le hostname avec le domaine ? [O/n]: " sync_hostname
            
            if [[ ! "$sync_hostname" =~ ^[Nn]$ ]]; then
                echo -e "${BLUE}[INFO]${NC} Modification du hostname en $domain..."
                set_hostname "$domain"
                echo -e "${GREEN}[OK]${NC} Hostname modifié"
            fi
        else
            echo -e "${GREEN}[OK]${NC} Hostname déjà synchronisé avec le domaine"
        fi
    else
        echo ""
        read -p "Voulez-vous modifier le hostname ? [o/N]: " change_hostname
        
        if [[ "$change_hostname" =~ ^[OoYy]$ ]]; then
            read -p "Nouveau hostname : " new_hostname
            
            if validate_hostname_format "$new_hostname"; then
                set_hostname "$new_hostname"
                echo -e "${GREEN}[OK]${NC} Hostname modifié en $new_hostname"
            else
                echo -e "${RED}[ERREUR]${NC} Format de hostname invalide"
            fi
        fi
    fi
}

#-------------------------------------------------------------------------------
# DIAGNOSTIC DNS
#-------------------------------------------------------------------------------

diagnose_dns() {
    local domain="$1"
    
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  DIAGNOSTIC DNS pour $domain"
    echo "════════════════════════════════════════════════════════"
    echo ""
    
    echo "1. IP publique du serveur :"
    local server_ip
    server_ip=$(get_public_ip)
    if [ -n "$server_ip" ]; then
        echo "   $server_ip"
    else
        echo "   [ERREUR] Impossible de détecter"
    fi
    echo ""
    
    echo "2. Résolution DNS du domaine :"
    for resolver in "${DNS_RESOLVERS[@]}"; do
        local result
        result=$(dig +short +time=3 "@$resolver" "$domain" A 2>/dev/null | head -1)
        printf "   %-15s -> %s\n" "$resolver" "${result:-"(pas de réponse)"}"
    done
    echo ""
    
    echo "3. Résolution locale :"
    local local_result
    local_result=$(getent hosts "$domain" 2>/dev/null | awk '{print $1}')
    echo "   ${local_result:-"(pas de résolution locale)"}"
    echo ""
    
    echo "4. Test de connexion :"
    if timeout 5 bash -c "echo >/dev/tcp/$domain/80" 2>/dev/null; then
        echo "   Port 80  : OUVERT"
    else
        echo "   Port 80  : FERMÉ ou FILTRÉ"
    fi
    if timeout 5 bash -c "echo >/dev/tcp/$domain/443" 2>/dev/null; then
        echo "   Port 443 : OUVERT"
    else
        echo "   Port 443 : FERMÉ ou FILTRÉ"
    fi
    echo ""
    
    echo "5. Enregistrement DNS requis :"
    echo "   Type  : A"
    echo "   Nom   : $domain"
    echo "   Valeur: $server_ip"
    echo ""
    
    echo "6. Commandes de diagnostic :"
    echo "   dig $domain A"
    echo "   nslookup $domain"
    echo "   ping $domain"
    echo ""
}

#-------------------------------------------------------------------------------
# EXPORT DES FONCTIONS
#-------------------------------------------------------------------------------

export -f get_public_ip
export -f get_local_ip
export -f validate_ipv4
export -f resolve_domain
export -f check_domain_propagation
export -f validate_domain_format
export -f validate_domain_dns
export -f get_current_hostname
export -f get_current_fqdn
export -f set_hostname
export -f validate_hostname_format
export -f generate_self_signed_cert
export -f verify_ssl_cert
export -f generate_nginx_platform_config
export -f generate_nginx_site_template
export -f prompt_domain_configuration
export -f prompt_hostname_configuration
export -f diagnose_dns
