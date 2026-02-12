FROM node:25-slim

# Install dependencies for Playwright Chromium & VNC
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
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
RUN chown -R app:app /home/app

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Set Playwright browser path to a shared location
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

# Install Playwright browsers (Chromium only) to shared path
RUN mkdir -p /opt/playwright-browsers && \
    npx playwright install chromium && \
    npx playwright install-deps chromium && \
    chmod -R 755 /opt/playwright-browsers

# Copy built application
COPY dist ./dist
COPY .env.example ./.env

# Copy supervisor config
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/start-vnc.sh /usr/local/bin/start-vnc.sh
RUN chmod +x /usr/local/bin/start-vnc.sh
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy fontconfig to prioritize Noto Sans CJK JP
COPY docker/fonts.conf /etc/fonts/conf.d/99-noto-cjk-jp.conf
RUN fc-cache -fv

# Copy license files into the image
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/fuba-browser/

# Set permissions
RUN chown -R app:app /app

# Switch to app user
USER app

# Expose ports
EXPOSE 39000 5900 6080

# Set VNC password file path (no base password — dynamic passwords only)
ENV VNC_PASSWDFILE=/tmp/vnc-passwords

# Display and viewport configuration
ENV DISPLAY_WIDTH=1200 \
    DISPLAY_HEIGHT=2000 \
    VIEWPORT_WIDTH=1200 \
    VIEWPORT_HEIGHT=2000

# Environment variables
ENV DISPLAY=:99 \
    HEADLESS=false \
    NODE_ENV=production

# Entrypoint creates VNC password file before supervisord starts services
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
