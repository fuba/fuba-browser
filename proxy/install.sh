#!/bin/bash
# fuba-proxy installer
# Installs and configures Squid + stunnel with mTLS on an exit server
# Supports: Debian/Ubuntu, Rocky Linux/RHEL/AlmaLinux
#
# Usage:
#   sudo ./install.sh                      # Default mode (all domains allowed)
#   sudo ALLOWLIST_MODE=true ./install.sh   # Allowlist mode (only listed domains)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_DIR="/etc/fuba-proxy"
TLS_DIR="${CONF_DIR}/tls"
CLIENTS_DIR="${CONF_DIR}/clients"
LOG_DIR="/var/log/fuba-proxy"
SPOOL_DIR="/var/spool/fuba-proxy"
ALLOWLIST_MODE="${ALLOWLIST_MODE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Check root
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
        log_error "Unsupported OS: ${ID}. Supported: debian, ubuntu, rocky, rhel, almalinux"
        exit 1
        ;;
    esac
  else
    log_error "Cannot detect OS: /etc/os-release not found"
    exit 1
  fi
  log_info "Detected OS family: ${OS_FAMILY} (${PRETTY_NAME:-${ID}})"
}

detect_os

# Set OS-specific variables
if [[ "${OS_FAMILY}" == "debian" ]]; then
  STUNNEL_PKG="stunnel4"
  SQUID_USER="proxy"
  STUNNEL_USER="stunnel4"
  STUNNEL_GROUP="stunnel4"
elif [[ "${OS_FAMILY}" == "rhel" ]]; then
  STUNNEL_PKG="stunnel"
  SQUID_USER="squid"
  STUNNEL_USER="nobody"
  STUNNEL_GROUP="nobody"
fi

# --- Step 1: Install packages ---
log_info "Installing squid and stunnel..."
if [[ "${OS_FAMILY}" == "debian" ]]; then
  apt-get update -qq
  apt-get install -y -qq squid "${STUNNEL_PKG}" openssl
elif [[ "${OS_FAMILY}" == "rhel" ]]; then
  dnf install -y -q squid "${STUNNEL_PKG}" openssl
fi

# --- Step 2: Create directories ---
log_info "Creating directories..."
mkdir -p "${CONF_DIR}" "${TLS_DIR}" "${CLIENTS_DIR}" "${LOG_DIR}" "${SPOOL_DIR}"

# --- Step 3: Copy configuration files ---
log_info "Copying configuration files..."
cp "${SCRIPT_DIR}/squid.conf" "${CONF_DIR}/squid.conf"
cp "${SCRIPT_DIR}/allowlist-acl.conf" "${CONF_DIR}/allowlist-acl.conf"
cp "${SCRIPT_DIR}/allowlist.txt" "${CONF_DIR}/allowlist.txt"

# Generate stunnel-server.conf with OS-appropriate user/group
log_info "Generating stunnel server config (user=${STUNNEL_USER}, group=${STUNNEL_GROUP})..."
sed -e "s/^setuid = .*/setuid = ${STUNNEL_USER}/" \
    -e "s/^setgid = .*/setgid = ${STUNNEL_GROUP}/" \
    "${SCRIPT_DIR}/stunnel-server.conf" > "${CONF_DIR}/stunnel-server.conf"

# --- Step 4: Configure allowlist mode ---
if [[ "${ALLOWLIST_MODE}" == "true" ]]; then
  log_info "Enabling allowlist mode..."
  # Uncomment the include directive in squid.conf
  sed -i 's|^# include /etc/fuba-proxy/allowlist-acl.conf|include /etc/fuba-proxy/allowlist-acl.conf|' "${CONF_DIR}/squid.conf"
  log_info "Allowlist mode enabled. Edit ${CONF_DIR}/allowlist.txt to manage allowed domains."
else
  log_info "Running in default mode (all non-private domains allowed)"
fi

# --- Step 5: Generate CA certificate ---
if [[ ! -f "${TLS_DIR}/ca.pem" ]]; then
  log_info "Generating CA certificate..."
  openssl req -new -x509 -days 3650 -nodes \
    -keyout "${TLS_DIR}/ca.key" \
    -out "${TLS_DIR}/ca.pem" \
    -subj "/CN=fuba-proxy CA/O=fuba-proxy"
  chmod 600 "${TLS_DIR}/ca.key"
  chmod 644 "${TLS_DIR}/ca.pem"
  log_info "CA certificate generated: ${TLS_DIR}/ca.pem"
else
  log_warn "CA certificate already exists, skipping generation"
fi

# --- Step 6: Generate server certificate ---
if [[ ! -f "${TLS_DIR}/server.pem" ]]; then
  log_info "Generating server certificate..."

  # Create server key
  openssl genrsa -out "${TLS_DIR}/server.key" 4096

  # Create CSR
  openssl req -new \
    -key "${TLS_DIR}/server.key" \
    -out "${TLS_DIR}/server.csr" \
    -subj "/CN=fuba-proxy server/O=fuba-proxy"

  # Sign with CA
  openssl x509 -req -days 3650 \
    -in "${TLS_DIR}/server.csr" \
    -CA "${TLS_DIR}/ca.pem" \
    -CAkey "${TLS_DIR}/ca.key" \
    -CAcreateserial \
    -out "${TLS_DIR}/server.pem"

  rm -f "${TLS_DIR}/server.csr"
  chmod 600 "${TLS_DIR}/server.key"
  chmod 644 "${TLS_DIR}/server.pem"
  log_info "Server certificate generated: ${TLS_DIR}/server.pem"
else
  log_warn "Server certificate already exists, skipping generation"
fi

# --- Step 7: Set permissions ---
log_info "Setting permissions..."
chown -R "${SQUID_USER}:${SQUID_USER}" "${LOG_DIR}" "${SPOOL_DIR}"
chown "root:${STUNNEL_GROUP}" "${TLS_DIR}/server.key" "${TLS_DIR}/server.pem" "${TLS_DIR}/ca.pem"
chmod 640 "${TLS_DIR}/server.key"

# --- Step 8: SELinux configuration (RHEL family) ---
if [[ "${OS_FAMILY}" == "rhel" ]]; then
  if command -v getenforce &>/dev/null && [[ "$(getenforce 2>/dev/null)" != "Disabled" ]]; then
    log_info "Configuring SELinux policies..."
    # Allow Squid to use our custom paths
    semanage fcontext -a -t squid_cache_t "${SPOOL_DIR}(/.*)?" 2>/dev/null || true
    semanage fcontext -a -t squid_conf_t "${CONF_DIR}(/.*)?" 2>/dev/null || true
    semanage fcontext -a -t squid_log_t "${LOG_DIR}(/.*)?" 2>/dev/null || true
    restorecon -Rv "${SPOOL_DIR}" "${CONF_DIR}" "${LOG_DIR}" 2>/dev/null || true
    # Allow stunnel to listen on port 3129
    semanage port -a -t stunnel_port_t -p tcp 3129 2>/dev/null || true
    log_info "SELinux policies applied"
  fi
fi

# --- Step 9: Initialize Squid cache ---
log_info "Initializing Squid cache directory..."
# Run squid -z as the squid user to create swap directories with correct ownership
# Squid 6.x requires swap dirs to exist before first start
if ! /usr/sbin/squid -f "${CONF_DIR}/squid.conf" -z; then
  log_warn "squid -z returned non-zero, retrying..."
  # Ensure spool directory ownership is correct and retry
  chown -R "${SQUID_USER}:${SQUID_USER}" "${SPOOL_DIR}"
  /usr/sbin/squid -f "${CONF_DIR}/squid.conf" -z
fi
# Verify swap directories were created
if [[ ! -d "${SPOOL_DIR}/00" ]]; then
  log_error "Squid cache initialization failed: ${SPOOL_DIR}/00 not found"
  exit 1
fi
log_info "Squid cache directory initialized"

# --- Step 10: Install and start systemd services ---
log_info "Installing systemd services..."

# Detect stunnel binary path (stunnel4 on Debian, stunnel on RHEL)
STUNNEL_BIN=""
for candidate in /usr/bin/stunnel /usr/bin/stunnel4; do
  if [[ -x "${candidate}" ]]; then
    STUNNEL_BIN="${candidate}"
    break
  fi
done
if [[ -z "${STUNNEL_BIN}" ]]; then
  log_error "stunnel binary not found"
  exit 1
fi
log_info "Using stunnel binary: ${STUNNEL_BIN}"

cp "${SCRIPT_DIR}/fuba-proxy.service" /etc/systemd/system/
# Replace placeholders with actual stunnel binary path and user/group
sed -e "s|__STUNNEL_BIN__|${STUNNEL_BIN}|g" \
    -e "s|__STUNNEL_USER__|${STUNNEL_USER}|g" \
    -e "s|__STUNNEL_GROUP__|${STUNNEL_GROUP}|g" \
  "${SCRIPT_DIR}/fuba-proxy-tls.service" > /etc/systemd/system/fuba-proxy-tls.service
systemctl daemon-reload
systemctl enable fuba-proxy fuba-proxy-tls
systemctl start fuba-proxy
systemctl start fuba-proxy-tls
log_info "Services started"

# --- Step 11: Open firewall port (RHEL family with firewalld) ---
if [[ "${OS_FAMILY}" == "rhel" ]]; then
  if systemctl is-active --quiet firewalld 2>/dev/null; then
    log_info "Opening port 3129/tcp in firewalld..."
    firewall-cmd --permanent --add-port=3129/tcp
    firewall-cmd --reload
    log_info "Firewall port 3129/tcp opened"
  fi
fi

# --- Step 12: Generate initial client certificate ---
if [[ -d "${CLIENTS_DIR}/default-client" ]]; then
  log_warn "Default client certificate already exists, skipping generation"
else
  log_info "Generating initial client certificate..."
  bash "${SCRIPT_DIR}/cert-gen.sh" default-client
fi

# --- Done ---
echo ""
log_info "============================================"
log_info "fuba-proxy installation complete!"
log_info "============================================"
echo ""
log_info "Squid is listening on 127.0.0.1:3128"
log_info "stunnel (mTLS) is listening on 0.0.0.0:3129"
echo ""
log_info "Allowlist mode: ${ALLOWLIST_MODE}"
if [[ "${ALLOWLIST_MODE}" == "true" ]]; then
  log_info "Edit allowed domains: ${CONF_DIR}/allowlist.txt"
  log_info "Then reload: systemctl reload fuba-proxy"
fi
echo ""
log_info "Client certificates: ${CLIENTS_DIR}/default-client/"
log_info "Generate more: ${SCRIPT_DIR}/cert-gen.sh <client-name>"
echo ""
log_info "On each fuba-browser host:"
log_info "  1. Copy client cert files and ca.pem"
log_info "  2. Configure stunnel client (see stunnel-client.conf.example)"
log_info "  3. Set PROXY_SERVER=http://localhost:13128 in .env"
