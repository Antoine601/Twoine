#!/bin/bash
# =============================================================================
# TWOINE - SFTP User Deletion Script
# Removes a chrooted SFTP user and optionally their data
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SITES_DIR="${SITES_DIR:-/var/www/sites}"

# Functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    echo "Usage: $0 <site_name> [--delete-files]"
    echo ""
    echo "Arguments:"
    echo "  site_name       Name of the site (e.g., 'mysite')"
    echo "  --delete-files  Also delete the site's files (DANGEROUS)"
    echo ""
    echo "This script will:"
    echo "  1. Kill all processes owned by the user"
    echo "  2. Remove Linux user 'site_<site_name>'"
    echo "  3. Optionally delete site files"
    exit 1
}

# Check arguments
if [ $# -lt 1 ]; then
    usage
fi

SITE_NAME="$1"
DELETE_FILES=false

if [ "${2:-}" = "--delete-files" ]; then
    DELETE_FILES=true
fi

# Validate site name
if ! [[ "$SITE_NAME" =~ ^[a-z][a-z0-9_-]{2,29}$ ]]; then
    log_error "Invalid site name format"
    exit 1
fi

# Derived values
USERNAME="site_${SITE_NAME}"
HOME_DIR="${SITES_DIR}/${SITE_NAME}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# =============================================================================
# STEP 1: Check if user exists
# =============================================================================
if ! id "$USERNAME" &>/dev/null; then
    log_warn "User '${USERNAME}' does not exist"
else
    # =============================================================================
    # STEP 2: Kill all user processes
    # =============================================================================
    log_info "Terminating all processes owned by '${USERNAME}'..."
    pkill -u "$USERNAME" 2>/dev/null || true
    sleep 1
    pkill -9 -u "$USERNAME" 2>/dev/null || true
    
    # =============================================================================
    # STEP 3: Remove the user
    # =============================================================================
    log_info "Removing user '${USERNAME}'..."
    userdel "$USERNAME" 2>/dev/null || log_warn "Failed to delete user (may already be removed)"
fi

# =============================================================================
# STEP 4: Optionally delete files
# =============================================================================
if [ "$DELETE_FILES" = true ]; then
    if [ -d "$HOME_DIR" ]; then
        # Safety check
        if [[ "$HOME_DIR" != ${SITES_DIR}/* ]]; then
            log_error "Security: Refusing to delete directory outside sites dir"
            exit 1
        fi
        
        log_warn "Deleting site files at '${HOME_DIR}'..."
        rm -rf "$HOME_DIR"
        log_info "Files deleted"
    else
        log_warn "Directory '${HOME_DIR}' does not exist"
    fi
else
    log_info "Files preserved at '${HOME_DIR}'"
fi

# =============================================================================
# OUTPUT
# =============================================================================
echo ""
echo "=============================================="
echo -e "${GREEN}SFTP User Removed Successfully${NC}"
echo "=============================================="
echo "Username:     ${USERNAME}"
echo "Files Deleted: ${DELETE_FILES}"
echo "=============================================="

# Output JSON for programmatic use
echo ""
echo "{\"success\":true,\"username\":\"${USERNAME}\",\"filesDeleted\":${DELETE_FILES}}"
