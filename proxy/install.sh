#!/bin/bash
# fuba-proxy installer
# Installs and configures Squid + stunnel with mTLS on an exit server
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

# --- Step 1: Install packages ---
log_info "Installing squid and stunnel..."
apt-get update -qq
apt-get install -y -qq squid stunnel4 openssl

# --- Step 2: Create directories ---
log_info "Creating directories..."
mkdir -p "${CONF_DIR}" "${TLS_DIR}" "${CLIENTS_DIR}" "${LOG_DIR}" "${SPOOL_DIR}"

# --- Step 3: Copy configuration files ---
log_info "Copying configuration files..."
cp "${SCRIPT_DIR}/squid.conf" "${CONF_DIR}/squid.conf"
cp "${SCRIPT_DIR}/allowlist-acl.conf" "${CONF_DIR}/allowlist-acl.conf"
cp "${SCRIPT_DIR}/allowlist.txt" "${CONF_DIR}/allowlist.txt"
cp "${SCRIPT_DIR}/stunnel-server.conf" "${CONF_DIR}/stunnel-server.conf"

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
chown -R proxy:proxy "${LOG_DIR}" "${SPOOL_DIR}"
# stunnel4 user needs read access to TLS certs
chown root:stunnel4 "${TLS_DIR}/server.key" "${TLS_DIR}/server.pem" "${TLS_DIR}/ca.pem"
chmod 640 "${TLS_DIR}/server.key"

# --- Step 8: Initialize Squid cache ---
log_info "Initializing Squid cache directory..."
/usr/sbin/squid -f "${CONF_DIR}/squid.conf" -z 2>/dev/null || true

# --- Step 9: Install and start systemd services ---
log_info "Installing systemd services..."
cp "${SCRIPT_DIR}/fuba-proxy.service" /etc/systemd/system/
cp "${SCRIPT_DIR}/fuba-proxy-tls.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable fuba-proxy fuba-proxy-tls
systemctl start fuba-proxy
systemctl start fuba-proxy-tls
log_info "Services started"

# --- Step 10: Generate initial client certificate ---
log_info "Generating initial client certificate..."
bash "${SCRIPT_DIR}/cert-gen.sh" default-client

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
