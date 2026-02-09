#!/bin/bash

# Create empty VNC password file before any services start.
# With no passwords, x11vnc rejects all connections until
# a dynamic password is generated via the API.
VNC_PASSWDFILE="${VNC_PASSWDFILE:-/tmp/vnc-passwords}"
: > "${VNC_PASSWDFILE}"
chmod 600 "${VNC_PASSWDFILE}"

exec "$@"
