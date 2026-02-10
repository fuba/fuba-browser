#!/bin/bash
# Serve client certificates via a one-time download URL
# Generates a temporary HTTP endpoint with a random token.
# After one successful download, the server shuts down automatically.
#
# Usage: sudo ./cert-serve.sh <client-name> [port]
#   client-name: Name of the client (generates cert if not exists)
#   port: Listen port (default: 8443)
#
# Example:
#   sudo ./cert-serve.sh browser-01
#   # => Download URL: http://<host>:8443/d/AbCdEfGh1234/certs.tar.gz
#   # => URL expires after first download or 10 minutes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_DIR="/etc/fuba-proxy"
CLIENTS_DIR="${CONF_DIR}/clients"
TIMEOUT_MINUTES=10

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

if [[ $# -lt 1 ]]; then
  log_error "Usage: $0 <client-name> [port]"
  exit 1
fi

CLIENT_NAME="$1"
PORT="${2:-8443}"
CLIENT_DIR="${CLIENTS_DIR}/${CLIENT_NAME}"

# Generate client cert if it doesn't exist
if [[ ! -d "${CLIENT_DIR}" ]]; then
  log_info "Client '${CLIENT_NAME}' not found, generating certificate..."
  bash "${SCRIPT_DIR}/cert-gen.sh" "${CLIENT_NAME}"
fi

# Verify cert files exist
for f in client.pem client.key ca.pem; do
  if [[ ! -f "${CLIENT_DIR}/${f}" ]]; then
    log_error "Missing ${CLIENT_DIR}/${f}"
    exit 1
  fi
done

# Generate random token
TOKEN=$(openssl rand -hex 16)

# Create temporary directory and tar archive
TMPDIR=$(mktemp -d /tmp/fuba-cert-serve-XXXXXX)
trap 'rm -rf "${TMPDIR}"' EXIT

# Create tar.gz including stunnel client config template
ARCHIVE="${TMPDIR}/certs.tar.gz"
tar -czf "${ARCHIVE}" \
  -C "${CLIENT_DIR}" client.pem client.key ca.pem \
  -C "${SCRIPT_DIR}" stunnel-client.conf.example

log_info "Archive created: $(du -h "${ARCHIVE}" | cut -f1)"

# Detect hostname/IP for display
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || hostname -f 2>/dev/null || echo "localhost")

# Write one-time download server in Python
SERVE_SCRIPT="${TMPDIR}/serve.py"
cat > "${SERVE_SCRIPT}" <<PYEOF
import http.server
import os
import sys
import signal
import threading

TOKEN = "${TOKEN}"
ARCHIVE_PATH = "${ARCHIVE}"
TIMEOUT = ${TIMEOUT_MINUTES} * 60

downloaded = False

class OneTimeHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global downloaded
        expected = f"/d/{TOKEN}/certs.tar.gz"
        if self.path != expected:
            self.send_error(404)
            return
        if downloaded:
            self.send_error(410, "Gone - already downloaded")
            return
        try:
            with open(ARCHIVE_PATH, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header("Content-Disposition", "attachment; filename=fuba-proxy-certs.tar.gz")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            downloaded = True
            print(f"\n[INFO] Certificate downloaded by {self.client_address[0]}")
            print("[INFO] Shutting down server...")
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        except Exception as e:
            self.send_error(500, str(e))

    def log_message(self, format, *args):
        # Suppress default request logging
        pass

def timeout_handler():
    print(f"\n[WARN] Timeout ({TIMEOUT}s) reached, no download occurred. Shutting down.")
    os._exit(1)

timer = threading.Timer(TIMEOUT, timeout_handler)
timer.daemon = True
timer.start()

server = http.server.HTTPServer(("0.0.0.0", ${PORT}), OneTimeHandler)
print(f"[INFO] Server listening on port ${PORT}")
print(f"[INFO] Waiting for download (timeout: ${TIMEOUT_MINUTES} minutes)...")
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\n[INFO] Server stopped by user")
finally:
    timer.cancel()
PYEOF

# Open firewall port temporarily (RHEL with firewalld)
FIREWALL_OPENED=false
if command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --add-port="${PORT}/tcp" 2>/dev/null && FIREWALL_OPENED=true
  log_info "Firewall port ${PORT}/tcp opened temporarily"
fi

echo ""
log_info "============================================"
log_info "  One-time certificate download"
log_info "============================================"
echo ""
log_info "Client: ${CLIENT_NAME}"
log_info "Download URL:"
echo ""
echo -e "  ${GREEN}http://${HOST_IP}:${PORT}/d/${TOKEN}/certs.tar.gz${NC}"
echo ""
log_info "This URL will expire after:"
log_info "  - First successful download, OR"
log_info "  - ${TIMEOUT_MINUTES} minutes (whichever comes first)"
echo ""
log_info "On the fuba-browser host, run:"
echo ""
echo "  mkdir -p ~/fuba-proxy-certs"
echo "  curl -o /tmp/fuba-proxy-certs.tar.gz 'http://${HOST_IP}:${PORT}/d/${TOKEN}/certs.tar.gz'"
echo "  tar -xzf /tmp/fuba-proxy-certs.tar.gz -C ~/fuba-proxy-certs"
echo "  rm /tmp/fuba-proxy-certs.tar.gz"
echo ""
log_warn "Press Ctrl+C to cancel"
echo ""

# Run the server (blocks until download or timeout)
python3 "${SERVE_SCRIPT}"
EXIT_CODE=$?

# Close firewall port
if [[ "${FIREWALL_OPENED}" == "true" ]]; then
  firewall-cmd --remove-port="${PORT}/tcp" 2>/dev/null || true
  log_info "Firewall port ${PORT}/tcp closed"
fi

if [[ ${EXIT_CODE} -eq 0 ]]; then
  log_info "Certificate delivery complete"
else
  log_warn "Server exited without successful download"
fi
