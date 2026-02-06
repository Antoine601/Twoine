#!/bin/bash
# =============================================================================
# TWOINE - SFTP User Creation Script
# Creates a chrooted SFTP user for a site with proper permissions
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SITES_DIR="${SITES_DIR:-/var/www/sites}"
SFTP_GROUP="sftpusers"
MIN_UID=2000
MAX_UID=65000

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    echo "Usage: $0 <site_name> [password]"
    echo ""
    echo "Arguments:"
    echo "  site_name    Name of the site (e.g., 'mysite')"
    echo "  password     Optional: SFTP password (generated if not provided)"
    echo ""
    echo "Environment Variables:"
    echo "  SITES_DIR    Base directory for sites (default: /var/www/sites)"
    echo ""
    echo "This script will:"
    echo "  1. Create Linux user 'site_<site_name>'"
    echo "  2. Configure chroot SFTP access"
    echo "  3. Set up proper directory permissions"
    echo "  4. Output the generated/provided password"
    exit 1
}

# Check arguments
if [ $# -lt 1 ]; then
    usage
fi

SITE_NAME="$1"
SFTP_PASSWORD="${2:-}"

# Validate site name
if ! [[ "$SITE_NAME" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
    log_error "Invalid site name. Must start with letter, contain only lowercase letters, numbers, hyphens, underscores (3-30 chars)"
    exit 1
fi

# Derived values
USERNAME="site_${SITE_NAME}"
HOME_DIR="${SITES_DIR}/${SITE_NAME}"
UPLOADS_DIR="${HOME_DIR}/uploads"
DATA_DIR="${HOME_DIR}/data"
SERVICES_DIR="${HOME_DIR}/services"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# =============================================================================
# STEP 1: Ensure SFTP group exists
# =============================================================================
log_info "Checking SFTP group '${SFTP_GROUP}'..."

if ! getent group "$SFTP_GROUP" > /dev/null 2>&1; then
    log_info "Creating SFTP group '${SFTP_GROUP}'..."
    groupadd "$SFTP_GROUP"
fi

# =============================================================================
# STEP 2: Check if user already exists
# =============================================================================
if id "$USERNAME" &>/dev/null; then
    log_warn "User '${USERNAME}' already exists"
    EXISTING_UID=$(id -u "$USERNAME")
    EXISTING_GID=$(id -g "$USERNAME")
    log_info "Existing UID: ${EXISTING_UID}, GID: ${EXISTING_GID}"
else
    # =============================================================================
    # STEP 3: Find next available UID
    # =============================================================================
    log_info "Finding next available UID..."
    
    NEXT_UID=$MIN_UID
    while getent passwd "$NEXT_UID" > /dev/null 2>&1; do
        ((NEXT_UID++))
        if [ $NEXT_UID -gt $MAX_UID ]; then
            log_error "No available UIDs in range ${MIN_UID}-${MAX_UID}"
            exit 1
        fi
    done
    
    log_info "Using UID: ${NEXT_UID}"
    
    # =============================================================================
    # STEP 4: Create the user
    # =============================================================================
    log_info "Creating user '${USERNAME}'..."
    
    useradd \
        --uid "$NEXT_UID" \
        --gid "$SFTP_GROUP" \
        --home-dir "$HOME_DIR" \
        --no-create-home \
        --shell /usr/sbin/nologin \
        --comment "Twoine SFTP: ${SITE_NAME}" \
        "$USERNAME"
    
    log_info "User created successfully"
fi

# =============================================================================
# STEP 5: Generate or set password
# =============================================================================
if [ -z "$SFTP_PASSWORD" ]; then
    log_info "Generating random password..."
    SFTP_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
fi

log_info "Setting password for '${USERNAME}'..."
echo "${USERNAME}:${SFTP_PASSWORD}" | chpasswd

# =============================================================================
# STEP 6: Create directory structure
# =============================================================================
log_info "Creating directory structure..."

# Root directory (owned by root for chroot)
mkdir -p "$HOME_DIR"
chown root:root "$HOME_DIR"
chmod 755 "$HOME_DIR"

# User-writable directories
for dir in "$UPLOADS_DIR" "$DATA_DIR" "$SERVICES_DIR"; do
    mkdir -p "$dir"
    chown "${USERNAME}:${SFTP_GROUP}" "$dir"
    chmod 755 "$dir"
done

# Create logs and tmp directories
mkdir -p "${HOME_DIR}/logs" "${HOME_DIR}/tmp"
chown "${USERNAME}:${SFTP_GROUP}" "${HOME_DIR}/logs" "${HOME_DIR}/tmp"
chmod 755 "${HOME_DIR}/logs"
chmod 700 "${HOME_DIR}/tmp"

# =============================================================================
# STEP 7: Set ACL for Twoine access
# =============================================================================
log_info "Setting ACL permissions..."

if command -v setfacl &> /dev/null; then
    # Allow twoine user to read all files
    setfacl -R -m u:twoine:rx "$HOME_DIR" 2>/dev/null || true
    setfacl -R -d -m u:twoine:rx "$HOME_DIR" 2>/dev/null || true
    
    # Allow twoine to write to logs
    setfacl -R -m u:twoine:rwx "${HOME_DIR}/logs" 2>/dev/null || true
else
    log_warn "setfacl not available, skipping ACL setup"
fi

# =============================================================================
# STEP 8: Lock the user from SSH shell access (SFTP only)
# =============================================================================
log_info "Ensuring user has no shell access..."
usermod --shell /usr/sbin/nologin "$USERNAME"

# =============================================================================
# OUTPUT
# =============================================================================
echo ""
echo "=============================================="
echo -e "${GREEN}SFTP User Created Successfully${NC}"
echo "=============================================="
echo "Username:   ${USERNAME}"
echo "Password:   ${SFTP_PASSWORD}"
echo "Home Dir:   ${HOME_DIR}"
echo "SFTP Host:  $(hostname -f 2>/dev/null || hostname)"
echo "SFTP Port:  22"
echo ""
echo "Connection: sftp ${USERNAME}@$(hostname -f 2>/dev/null || hostname)"
echo "=============================================="

# Output JSON for programmatic use
cat << EOF

{"success":true,"username":"${USERNAME}","password":"${SFTP_PASSWORD}","homeDir":"${HOME_DIR}","uid":"$(id -u ${USERNAME})","gid":"$(id -g ${USERNAME})"}
EOF
