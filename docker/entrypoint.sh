#!/bin/bash

# Create initial VNC password file before any services start.
# This ensures the file exists before x11vnc launches,
# eliminating the race condition between x11vnc and VncPasswordManager.
VNC_PASSWDFILE="${VNC_PASSWDFILE:-/tmp/vnc-passwords}"
echo "${VNC_PASSWORD:-fuba-browser}" > "${VNC_PASSWDFILE}"
chmod 600 "${VNC_PASSWDFILE}"

exec "$@"
