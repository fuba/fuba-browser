#!/bin/bash

# Start Xvfb
Xvfb :99 -screen 0 1200x2000x24 -ac +extension GLX +render -noreset &

# Wait for Xvfb to start
sleep 2

# Start window manager
DISPLAY=:99 fluxbox &

# Start x11vnc
x11vnc -display :99 -forever -passwd ${VNC_PASSWORD:-fuba-browser} -shared -rfbport 5900 &

# Start noVNC (websockify)
/usr/bin/websockify --web /usr/share/novnc 6080 localhost:5900 &

# Start the application
DISPLAY=:99 /app/node_modules/.bin/electron /app/dist/main/index.js