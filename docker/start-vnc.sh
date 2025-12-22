#!/bin/bash

# Start Xvfb
Xvfb :99 -screen 0 1280x1024x24 -ac +extension GLX +render -noreset &

# Wait for Xvfb to start
sleep 2

# Start window manager
DISPLAY=:99 fluxbox &

# Start x11vnc
x11vnc -display :99 -forever -usepw -shared -rfbport 5900 -rfbauth /home/app/.vnc/passwd &

# Start noVNC
/usr/share/novnc/utils/launch.sh --vnc localhost:5900 --listen 6080 &

# Start the application
DISPLAY=:99 node /app/dist/main/index.js