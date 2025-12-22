FROM node:20-slim

# Install dependencies for Electron & Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    supervisor \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -ms /bin/bash app

# Set up VNC and noVNC
RUN mkdir -p /home/app/.vnc /home/app/.fluxbox
RUN echo "fuba-browser" | vncpasswd -f > /home/app/.vnc/passwd
RUN chmod 600 /home/app/.vnc/passwd
RUN chown -R app:app /home/app

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY .env.example ./.env

# Copy supervisor config
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/start-vnc.sh /usr/local/bin/start-vnc.sh
RUN chmod +x /usr/local/bin/start-vnc.sh

# Set permissions
RUN chown -R app:app /app

# Switch to app user
USER app

# Expose ports
EXPOSE 3000 5900 6080

# Environment variables
ENV DISPLAY=:99 \
    ELECTRON_DISABLE_SANDBOX=1 \
    NODE_ENV=production

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]