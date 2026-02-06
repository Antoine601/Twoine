#!/bin/bash
# =============================================================================
# TWOINE - SFTP User Enable/Disable Script
# Enables or disables SFTP access for a user without deleting them
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
    echo "Usage: $0 <site_name> <enable|disable>"
    echo ""
    echo "Arguments:"
    echo "  site_name  Name of the site (e.g., 'mysite')"
    echo "  action     'enable' or 'disable'"
    echo ""
    echo "This script will enable/disable SFTP access for user 'site_<site_name>'"
    exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
    usage
fi

SITE_NAME="$1"
ACTION="$2"

# Validate site name
if ! [[ "$SITE_NAME" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
    log_error "Invalid site name format"
    exit 1
fi

# Validate action
if [[ "$ACTION" != "enable" && "$ACTION" != "disable" ]]; then
    log_error "Action must be 'enable' or 'disable'"
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
# STEP 2: Enable or disable the account
# =============================================================================
if [ "$ACTION" = "disable" ]; then
    log_info "Disabling SFTP access for '${USERNAME}'..."
    
    # Lock the account (prevents password login)
    passwd -l "$USERNAME"
    
    # Kill any existing sessions
    pkill -u "$USERNAME" 2>/dev/null || true
    
    ENABLED=false
    log_info "SFTP access disabled"
else
    log_info "Enabling SFTP access for '${USERNAME}'..."
    
    # Unlock the account
    passwd -u "$USERNAME"
    
    ENABLED=true
    log_info "SFTP access enabled"
fi

# =============================================================================
# OUTPUT
# =============================================================================
echo ""
echo "=============================================="
echo -e "${GREEN}SFTP Access ${ACTION}d Successfully${NC}"
echo "=============================================="
echo "Username: ${USERNAME}"
echo "Enabled:  ${ENABLED}"
echo "=============================================="

# Output JSON for programmatic use
echo ""
echo "{\"success\":true,\"username\":\"${USERNAME}\",\"enabled\":${ENABLED}}"
