#!/bin/bash
# fuba-proxy uninstaller
# Removes fuba-proxy services, configuration, and optionally packages
#
# Usage:
#   sudo ./uninstall.sh                    # Remove config and services
#   sudo REMOVE_PACKAGES=true ./uninstall.sh  # Also remove squid/stunnel packages

set -euo pipefail

CONF_DIR="/etc/fuba-proxy"
LOG_DIR="/var/log/fuba-proxy"
SPOOL_DIR="/var/spool/fuba-proxy"
REMOVE_PACKAGES="${REMOVE_PACKAGES:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

if [[ $EUID -ne 0 ]]; then
  log_error "This script must be run as root (sudo)"
  exit 1
fi

# --- Stop and disable services ---
log_info "Stopping services..."
systemctl stop fuba-proxy-tls 2>/dev/null || true
systemctl stop fuba-proxy 2>/dev/null || true
systemctl disable fuba-proxy-tls 2>/dev/null || true
systemctl disable fuba-proxy 2>/dev/null || true

# --- Remove systemd unit files ---
log_info "Removing systemd unit files..."
rm -f /etc/systemd/system/fuba-proxy.service
rm -f /etc/systemd/system/fuba-proxy-tls.service
systemctl daemon-reload

# --- Remove configuration ---
log_info "Removing configuration directory: ${CONF_DIR}"
rm -rf "${CONF_DIR}"

# --- Remove logs ---
log_info "Removing log directory: ${LOG_DIR}"
rm -rf "${LOG_DIR}"

# --- Remove cache ---
log_info "Removing cache directory: ${SPOOL_DIR}"
rm -rf "${SPOOL_DIR}"

# --- Remove runtime directory ---
rm -rf /run/fuba-proxy

# --- Optionally remove packages ---
if [[ "${REMOVE_PACKAGES}" == "true" ]]; then
  log_info "Removing squid and stunnel packages..."
  apt-get remove -y -qq squid stunnel4
  apt-get autoremove -y -qq
else
  log_info "Packages (squid, stunnel4) were kept. Set REMOVE_PACKAGES=true to remove them."
fi

log_info "fuba-proxy uninstalled successfully"
