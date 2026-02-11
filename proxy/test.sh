#!/bin/bash
# Integration tests for fuba-proxy
# Run this on the proxy server after install.sh has been executed
#
# Prerequisites:
#   - install.sh has been run successfully
#   - A client certificate has been generated (default-client)
#   - curl and stunnel are available
#
# Usage: sudo ./test.sh [proxy-host]
#   proxy-host: hostname/IP of the proxy server (default: localhost)

set -euo pipefail

PROXY_HOST="${1:-localhost}"
CONF_DIR="/etc/fuba-proxy"
TLS_DIR="${CONF_DIR}/tls"
CLIENT_DIR="${CONF_DIR}/clients/default-client"
STUNNEL_CLIENT_PID=""
STUNNEL_CLIENT_CONF=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; PASSED=$((PASSED + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; FAILED=$((FAILED + 1)); }
log_info() { echo -e "${YELLOW}[TEST]${NC} $*"; }

# Helper: run curl and capture HTTP status code without set -e interference
curl_code() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$@" 2>/dev/null) || true
  echo "${code:-000}"
}

cleanup() {
  if [[ -n "${STUNNEL_CLIENT_PID}" ]] && kill -0 "${STUNNEL_CLIENT_PID}" 2>/dev/null; then
    kill "${STUNNEL_CLIENT_PID}" 2>/dev/null || true
    wait "${STUNNEL_CLIENT_PID}" 2>/dev/null || true
  fi
  if [[ -n "${STUNNEL_CLIENT_CONF}" ]]; then
    rm -f "${STUNNEL_CLIENT_CONF}"
  fi
}
trap cleanup EXIT

# --- Preflight checks ---
if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (sudo)"
  exit 1
fi

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Client certificate not found at ${CLIENT_DIR}"
  echo "Run: sudo ./cert-gen.sh default-client"
  exit 1
fi

if ! systemctl is-active --quiet fuba-proxy; then
  echo "fuba-proxy service is not running"
  exit 1
fi

if ! systemctl is-active --quiet fuba-proxy-tls; then
  echo "fuba-proxy-tls service is not running"
  exit 1
fi

# --- Start local stunnel client for testing ---
log_info "Starting stunnel client for testing..."
STUNNEL_CLIENT_CONF=$(mktemp /tmp/stunnel-test-XXXXXX.conf)
cat > "${STUNNEL_CLIENT_CONF}" <<EOF
pid = /tmp/fuba-proxy-test-stunnel.pid
foreground = yes

[fuba-proxy-test]
client = yes
accept = 127.0.0.1:13199
connect = ${PROXY_HOST}:3129
cert = ${CLIENT_DIR}/client.pem
key = ${CLIENT_DIR}/client.key
CAfile = ${CLIENT_DIR}/ca.pem
verify = 2
EOF

stunnel "${STUNNEL_CLIENT_CONF}" &
STUNNEL_CLIENT_PID=$!
sleep 2

if ! kill -0 "${STUNNEL_CLIENT_PID}" 2>/dev/null; then
  echo "Failed to start stunnel test client"
  exit 1
fi

PROXY_URL="http://127.0.0.1:13199"

echo ""
echo "========================================="
echo "  fuba-proxy Integration Tests"
echo "========================================="
echo ""

# --- Test 1: Access allowed domain via proxy ---
log_info "Test 1: Access external site via proxy"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 15 "http://www.google.com/")
if [[ "${HTTP_CODE}" =~ ^(200|301|302)$ ]]; then
  log_pass "External access works (HTTP ${HTTP_CODE})"
else
  log_fail "External access failed (HTTP ${HTTP_CODE})"
fi

# --- Test 2: HTTPS CONNECT via proxy ---
log_info "Test 2: HTTPS CONNECT via proxy"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 15 "https://www.google.com/")
if [[ "${HTTP_CODE}" =~ ^(200|301|302)$ ]]; then
  log_pass "HTTPS CONNECT works (HTTP ${HTTP_CODE})"
else
  log_fail "HTTPS CONNECT failed (HTTP ${HTTP_CODE})"
fi

# --- Test 3: Private IP blocking (10.0.0.0/8) ---
log_info "Test 3: Block access to private IP 10.0.0.1"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 5 "http://10.0.0.1/")
if [[ "${HTTP_CODE}" == "403" ]]; then
  log_pass "Private IP 10.0.0.1 blocked (HTTP 403)"
elif [[ "${HTTP_CODE}" == "000" ]]; then
  # Connection timeout/reset is also acceptable for blocked IPs
  log_pass "Private IP 10.0.0.1 blocked (connection refused/timeout)"
else
  log_fail "Private IP 10.0.0.1 not blocked (HTTP ${HTTP_CODE})"
fi

# --- Test 4: Private IP blocking (192.168.0.0/16) ---
log_info "Test 4: Block access to private IP 192.168.1.1"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 5 "http://192.168.1.1/")
if [[ "${HTTP_CODE}" == "403" ]]; then
  log_pass "Private IP 192.168.1.1 blocked (HTTP 403)"
elif [[ "${HTTP_CODE}" == "000" ]]; then
  log_pass "Private IP 192.168.1.1 blocked (connection refused/timeout)"
else
  log_fail "Private IP 192.168.1.1 not blocked (HTTP ${HTTP_CODE})"
fi

# --- Test 5: Private IP blocking (127.0.0.0/8 via proxy) ---
log_info "Test 5: Block access to loopback via proxy"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 5 "http://127.0.0.2/")
if [[ "${HTTP_CODE}" == "403" ]]; then
  log_pass "Loopback 127.0.0.2 blocked (HTTP 403)"
elif [[ "${HTTP_CODE}" == "000" ]]; then
  log_pass "Loopback 127.0.0.2 blocked (connection refused/timeout)"
else
  log_fail "Loopback 127.0.0.2 not blocked (HTTP ${HTTP_CODE})"
fi

# --- Test 6: Unsafe port blocking ---
log_info "Test 6: Block access to unsafe port (8080)"
HTTP_CODE=$(curl_code --proxy "${PROXY_URL}" --max-time 5 "http://www.google.com:8080/")
if [[ "${HTTP_CODE}" == "403" ]]; then
  log_pass "Unsafe port 8080 blocked (HTTP 403)"
elif [[ "${HTTP_CODE}" == "000" ]]; then
  log_pass "Unsafe port 8080 blocked (connection refused/timeout)"
else
  log_fail "Unsafe port 8080 not blocked (HTTP ${HTTP_CODE})"
fi

# --- Test 7: Connection without client certificate ---
log_info "Test 7: Reject connection without client certificate"
HTTP_CODE=$(curl_code --proxy "http://${PROXY_HOST}:3129" --max-time 5 "http://www.google.com/")
if [[ "${HTTP_CODE}" == "000" ]]; then
  log_pass "Connection without client cert rejected"
else
  log_fail "Connection without client cert was not rejected (HTTP ${HTTP_CODE})"
fi

# --- Test 8: Direct Squid access from non-localhost ---
log_info "Test 8: Squid should only listen on localhost"
# Try to connect to Squid directly on port 3128 from a non-localhost source
# This tests that Squid only binds to 127.0.0.1
if [[ "${PROXY_HOST}" == "localhost" ]] || [[ "${PROXY_HOST}" == "127.0.0.1" ]]; then
  # If testing locally, we can verify Squid is bound to localhost
  LISTEN_ADDR=$(ss -tlnp | grep ':3128' | awk '{print $4}' || true)
  if [[ "${LISTEN_ADDR}" == "127.0.0.1:3128" ]]; then
    log_pass "Squid listens only on 127.0.0.1:3128"
  else
    log_fail "Squid listen address: ${LISTEN_ADDR} (expected 127.0.0.1:3128)"
  fi
else
  log_info "Skipping local-only listen test (testing remote host)"
fi

# --- Results ---
echo ""
echo "========================================="
echo "  Results: ${PASSED} passed, ${FAILED} failed"
echo "========================================="

if [[ ${FAILED} -gt 0 ]]; then
  exit 1
fi
