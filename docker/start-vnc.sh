#!/bin/bash

# Start Xvfb
Xvfb :99 -screen 0 ${DISPLAY_WIDTH:-1200}x${DISPLAY_HEIGHT:-2000}x24 -ac +extension GLX +render -noreset &

# Wait for Xvfb to start
sleep 2

# Start window manager
DISPLAY=:99 fluxbox &

# Initialize empty VNC password file and start x11vnc
VNC_PASSWDFILE="${VNC_PASSWDFILE:-/tmp/vnc-passwords}"
: > "${VNC_PASSWDFILE}"
chmod 600 "${VNC_PASSWDFILE}"
x11vnc -display :99 -forever -passwdfile "read:${VNC_PASSWDFILE}" -shared -rfbport 5900 &

# Start noVNC (websockify)
/usr/bin/websockify --web /usr/share/novnc 6080 localhost:5900 &

# Start the application
DISPLAY=:99 node /app/dist/main/index.js