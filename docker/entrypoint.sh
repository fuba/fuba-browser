#!/bin/bash

# Create VNC password file with a random internal password before any services start.
# x11vnc requires at least one valid password line to start.
# This password is never shared — actual access requires dynamic passwords via API.
VNC_PASSWDFILE="${VNC_PASSWDFILE:-/tmp/vnc-passwords}"
head -c 6 /dev/urandom | base64 | head -c 8 > "${VNC_PASSWDFILE}"
chmod 600 "${VNC_PASSWDFILE}"

exec "$@"
