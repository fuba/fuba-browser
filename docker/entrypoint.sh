#!/bin/bash
set -euo pipefail

# Create VNC password file with two random passwords before any services start.
# x11vnc requires at least one valid password line to start.
# Writing two lines from the start matches the runtime format that VncPasswordManager
# uses, avoiding a format change on the first password update that can trigger
# an x11vnc 0.9.16 crash (exit status 2) during -passwdfile read: reload.
# Neither password is shared — actual access requires dynamic passwords via API.
VNC_PASSWDFILE="${VNC_PASSWDFILE:-/tmp/vnc-passwords}"

# Generate 8 alphanumeric chars without Broken pipe warnings.
# Command substitution captures full output; printf truncates to 8 chars.
rand8() { printf '%.8s' "$(head -c 32 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9')"; }

printf '%s\n%s\n' "$(rand8)" "$(rand8)" > "${VNC_PASSWDFILE}"
chmod 600 "${VNC_PASSWDFILE}"

exec "$@"
