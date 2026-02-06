#!/bin/bash
# =============================================================================
# TWOINE - SFTP Password Reset Script
# Resets the password for an existing SFTP user
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    echo "Usage: $0 <site_name> [new_password]"
    echo ""
    echo "Arguments:"
    echo "  site_name     Name of the site (e.g., 'mysite')"
    echo "  new_password  Optional: New password (generated if not provided)"
    echo ""
    echo "This script will reset the SFTP password for user 'site_<site_name>'"
    exit 1
}

# Check arguments
if [ $# -lt 1 ]; then
    usage
fi

SITE_NAME="$1"
NEW_PASSWORD="${2:-}"

# Validate site name
if ! [[ "$SITE_NAME" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
    log_error "Invalid site name format"
    exit 1
fi

# Derived values
USERNAME="site_${SITE_NAME}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# =============================================================================
# STEP 1: Check if user exists
# =============================================================================
if ! id "$USERNAME" &>/dev/null; then
    log_error "User '${USERNAME}' does not exist"
    echo "{\"success\":false,\"error\":\"User does not exist\"}"
    exit 1
fi

# =============================================================================
# STEP 2: Generate password if not provided
# =============================================================================
if [ -z "$NEW_PASSWORD" ]; then
    log_info "Generating random password..."
    NEW_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
fi

# =============================================================================
# STEP 3: Set the new password
# =============================================================================
log_info "Setting new password for '${USERNAME}'..."
echo "${USERNAME}:${NEW_PASSWORD}" | chpasswd

# =============================================================================
# OUTPUT
# =============================================================================
echo ""
echo "=============================================="
echo -e "${GREEN}Password Reset Successfully${NC}"
echo "=============================================="
echo "Username:     ${USERNAME}"
echo "New Password: ${NEW_PASSWORD}"
echo "=============================================="

# Output JSON for programmatic use
echo ""
echo "{\"success\":true,\"username\":\"${USERNAME}\",\"password\":\"${NEW_PASSWORD}\"}"
