#!/bin/bash
# Generate a client certificate for fuba-proxy mTLS authentication
#
# Usage: sudo ./cert-gen.sh <client-name>
#
# Output files (in /etc/fuba-proxy/clients/<client-name>/):
#   client.pem  - Client certificate
#   client.key  - Client private key
#   ca.pem      - CA certificate (for server verification)

set -euo pipefail

CONF_DIR="/etc/fuba-proxy"
TLS_DIR="${CONF_DIR}/tls"
CLIENTS_DIR="${CONF_DIR}/clients"

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

if [[ $# -ne 1 ]]; then
  log_error "Usage: $0 <client-name>"
  exit 1
fi

CLIENT_NAME="$1"
CLIENT_DIR="${CLIENTS_DIR}/${CLIENT_NAME}"

# Validate client name (alphanumeric, hyphens, underscores)
if [[ ! "${CLIENT_NAME}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  log_error "Invalid client name. Use only alphanumeric characters, hyphens, and underscores."
  exit 1
fi

# Check CA exists
if [[ ! -f "${TLS_DIR}/ca.pem" ]] || [[ ! -f "${TLS_DIR}/ca.key" ]]; then
  log_error "CA certificate not found. Run install.sh first."
  exit 1
fi

# Check if client already exists
if [[ -d "${CLIENT_DIR}" ]]; then
  log_warn "Client '${CLIENT_NAME}' already exists at ${CLIENT_DIR}"
  log_warn "Remove it first if you want to regenerate."
  exit 1
fi

# Create client directory
mkdir -p "${CLIENT_DIR}"

# Generate client key
log_info "Generating client key..."
openssl genrsa -out "${CLIENT_DIR}/client.key" 4096

# Generate CSR
log_info "Generating client CSR..."
openssl req -new \
  -key "${CLIENT_DIR}/client.key" \
  -out "${CLIENT_DIR}/client.csr" \
  -subj "/CN=${CLIENT_NAME}/O=fuba-proxy client"

# Sign with CA
log_info "Signing client certificate with CA..."
openssl x509 -req -days 365 \
  -in "${CLIENT_DIR}/client.csr" \
  -CA "${TLS_DIR}/ca.pem" \
  -CAkey "${TLS_DIR}/ca.key" \
  -CAcreateserial \
  -out "${CLIENT_DIR}/client.pem"

# Clean up CSR
rm -f "${CLIENT_DIR}/client.csr"

# Copy CA cert for client verification
cp "${TLS_DIR}/ca.pem" "${CLIENT_DIR}/ca.pem"

# Set permissions
chmod 600 "${CLIENT_DIR}/client.key"
chmod 644 "${CLIENT_DIR}/client.pem" "${CLIENT_DIR}/ca.pem"

log_info "Client certificate generated successfully!"
echo ""
log_info "Output directory: ${CLIENT_DIR}/"
log_info "  client.pem  - Client certificate"
log_info "  client.key  - Client private key (keep secret!)"
log_info "  ca.pem      - CA certificate"
echo ""
log_info "Copy these files to the fuba-browser host and configure stunnel-client.conf"
