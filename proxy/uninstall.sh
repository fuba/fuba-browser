#!/bin/bash
# fuba-proxy uninstaller
# Removes fuba-proxy services, configuration, and optionally packages
# Supports: Debian/Ubuntu, Rocky Linux/RHEL/AlmaLinux
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

# --- OS Detection ---
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    case "${ID}" in
      debian|ubuntu)
        OS_FAMILY="debian"
        ;;
      rocky|rhel|almalinux|centos|ol)
        OS_FAMILY="rhel"
        ;;
      *)
        OS_FAMILY="unknown"
        log_warn "Unknown OS: ${ID}. Package removal may not work."
        ;;
    esac
  else
    OS_FAMILY="unknown"
    log_warn "Cannot detect OS. Package removal may not work."
  fi
}

detect_os

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

# --- Close firewall port (RHEL family with firewalld) ---
if [[ "${OS_FAMILY}" == "rhel" ]]; then
  if systemctl is-active --quiet firewalld 2>/dev/null; then
    log_info "Closing port 3129/tcp in firewalld..."
    firewall-cmd --permanent --remove-port=3129/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
  fi
fi

# --- Remove SELinux contexts (RHEL family) ---
if [[ "${OS_FAMILY}" == "rhel" ]]; then
  if command -v getenforce &>/dev/null && [[ "$(getenforce 2>/dev/null)" != "Disabled" ]]; then
    log_info "Removing SELinux policies..."
    semanage fcontext -d -t squid_cache_t "${SPOOL_DIR}(/.*)?" 2>/dev/null || true
    semanage fcontext -d -t squid_conf_t "${CONF_DIR}(/.*)?" 2>/dev/null || true
    semanage fcontext -d -t squid_log_t "${LOG_DIR}(/.*)?" 2>/dev/null || true
    semanage port -d -t stunnel_port_t -p tcp 3129 2>/dev/null || true
  fi
fi

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
  if [[ "${OS_FAMILY}" == "debian" ]]; then
    apt-get remove -y -qq squid stunnel4
    apt-get autoremove -y -qq
  elif [[ "${OS_FAMILY}" == "rhel" ]]; then
    dnf remove -y -q squid stunnel
  else
    log_warn "Cannot remove packages: unknown OS family"
  fi
else
  if [[ "${OS_FAMILY}" == "debian" ]]; then
    log_info "Packages (squid, stunnel4) were kept. Set REMOVE_PACKAGES=true to remove them."
  elif [[ "${OS_FAMILY}" == "rhel" ]]; then
    log_info "Packages (squid, stunnel) were kept. Set REMOVE_PACKAGES=true to remove them."
  fi
fi

log_info "fuba-proxy uninstalled successfully"
