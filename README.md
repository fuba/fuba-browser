# Fuba Browser

Docker-based browser automation tool with REST API and CLI for LLM agents

## Overview

Fuba Browser is a Chromium-based browser automation tool that runs in Docker and provides a REST API for LLM agents like Claude Code. It solves the token consumption problem of Chrome DevTools MCP by offering a streamlined REST API interface with Web VNC access.

## Features

- **REST API** for browser control (navigation, clicking, typing, scrolling)
- **CLI tool (`fbb`)** for command-line automation
- **Snapshot/Ref system** - Accessibility tree with element refs for fast, deterministic targeting
- **Page content extraction** as extended Markdown format
- **Wait API** - Wait for selectors, text, URL patterns, page load
- **Keyboard/Mouse control** - Press keys, mouse move, click, wheel
- **Storage management** - localStorage, sessionStorage access
- **Authentication state** - Save/load browser state (cookies, storage)
- **Debug tools** - Console logs, errors, JavaScript eval, element highlight
- **Web VNC** for remote GUI access
- **Docker-based deployment** with X11 support
- **Japanese font support** (Noto Sans CJK & Noto Serif CJK)
- **Egress proxy** - Shared exit server with private network blocking and mTLS authentication

## Installation

### Using Launcher Script (Recommended)

Download and install the launcher script:

```bash
# Download the script
curl -fsSL https://raw.githubusercontent.com/fuba/fuba-browser/main/fuba-browser.sh -o fuba-browser.sh
chmod +x fuba-browser.sh

# Install to /usr/local/bin (optional, requires sudo)
./fuba-browser.sh install

# Start the browser
fuba-browser start
```

The launcher script automatically pulls the Docker image and manages the container.

### Using Docker Directly

Pull the image from GitHub Container Registry:

```bash
docker pull ghcr.io/fuba/fuba-browser:1.0.0

# Or use the latest version
docker pull ghcr.io/fuba/fuba-browser:latest
```

Run the container:

```bash
docker run -d \
  --name fuba-browser \
  -p 39000:39000 \
  -p 39001:6080 \
  -p 5900:5900 \
  --shm-size=2g \
  ghcr.io/fuba/fuba-browser:1.0.0
```

### Building from Source

```bash
git clone https://github.com/fuba/fuba-browser.git
cd fuba-browser
npm ci
npm run build
docker-compose up
```

## Quick Start

### Start the Browser

```bash
# Using launcher script
fuba-browser start

# Or using docker-compose (from source)
docker-compose up

# Access points:
# - REST API: http://localhost:39000
# - Web VNC (auto-login): http://localhost:39000/web-vnc
# - Web VNC (manual): http://localhost:39001
# - VNC: vnc://localhost:5900 (password: fuba-browser)
```

### Launcher Script Commands

```bash
fuba-browser start                    # Start the container
fuba-browser stop                     # Stop the container
fuba-browser restart                  # Restart the container
fuba-browser update                   # Update to latest image and restart
fuba-browser status                   # Show container status
fuba-browser logs                     # Show container logs

# Multiple instances
fuba-browser start -n browser1 -p 39000 -w 39001
fuba-browser start -n browser2 -p 39100 -w 39101

# With VNC port exposed
fuba-browser start -v 5900
```

### Install CLI

```bash
cd cli
npm install
npm link
```

### Basic Usage

```bash
# Navigate to a page
fbb open https://example.com

# Get page snapshot with element refs
fbb snapshot -i

# Click using ref
fbb click @e1

# Fill form
fbb fill @e2 "user@example.com"

# Take screenshot
fbb screenshot output.png

# Save authentication state
fbb state save auth.json

# Load authentication state
fbb state load auth.json --navigate
```

## CLI Commands

### Navigation
```bash
fbb open <url>          # Navigate to URL
fbb snapshot [options]  # Get accessibility snapshot with refs
```

### Interaction
```bash
fbb click <selector>    # Click element (CSS selector or @ref)
fbb dblclick <selector> # Double-click element
fbb type <selector> <text>
fbb fill <selector> <text>
fbb hover <selector>
fbb focus <selector>
fbb check <selector>
fbb uncheck <selector>
fbb select <selector> <value>
fbb scroll <direction> [px]
```

### Wait
```bash
fbb wait selector <selector>
fbb wait text <text>
fbb wait url <pattern>
fbb wait load [state]
fbb wait timeout <ms>
```

### Keyboard/Mouse
```bash
fbb press <key>
fbb mouse move <x> <y>
fbb mouse wheel <deltaY>
```

### Information
```bash
fbb get title
fbb get url
fbb get text <selector>
fbb get html <selector>
fbb get value <selector>
fbb get attr <selector> <attr>
fbb get count <selector>
fbb get box <selector>
fbb is visible <selector>
fbb is enabled <selector>
fbb is checked <selector>
```

### Storage
```bash
fbb storage local list
fbb storage local get <key>
fbb storage local set <key> <value>
fbb cookies list
fbb cookies clear
```

### State Management
```bash
fbb state save <path>   # Save cookies, localStorage, sessionStorage
fbb state load <path>   # Load saved state
fbb state info          # Show current state info
```

### Content
```bash
fbb content             # Get page content (HTML, markdown, elements)
fbb elements            # Get interactive elements
```

### Debug
```bash
fbb eval <script>       # Execute JavaScript
fbb highlight <selector>
fbb console
fbb errors
fbb screenshot [path]
fbb health              # Check API server health
```

### System
```bash
fbb reset               # Reset browser (close and reinitialize)
fbb vnc                 # Generate a one-time noVNC access URL
fbb vnc --vnc-host <host:port>  # Specify VNC host for redirect
```

## Architecture

- **Container**: Docker with X11/Xvfb
- **Browser**: Playwright + Chromium
- **Backend**: Node.js + TypeScript
- **API Server**: Express
- **Browser Control**: Chrome DevTools Protocol
- **Remote Access**: noVNC + x11vnc
- **CLI**: Commander.js + chalk

## Resource Configuration

The container is configured with generous resource limits to handle heavy websites:

- **Memory Limit**: 10GB
- **Memory Reservation**: 4GB
- **CPU Limit**: 4 cores
- **CPU Reservation**: 2 cores
- **Shared Memory**: 2GB

These settings can be adjusted in `docker-compose.yml` based on your system resources.

## Environment Variables

### Browser

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | `true` | Set to `false` for headed mode (Docker default is `false`) |
| `DEVICE_SCALE_FACTOR` | `2` | Device scale factor for HiDPI |
| `LOCALE` | `ja-JP` | Browser locale (e.g., `en-US`, `ja-JP`, `ko-KR`) |
| `TIMEZONE_ID` | `Asia/Tokyo` | Timezone ID (e.g., `America/New_York`, `Europe/London`) |
| `VIEWPORT_WIDTH` | `1200` | Playwright viewport width |
| `VIEWPORT_HEIGHT` | `2000` | Playwright viewport height |

### Display

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPLAY_WIDTH` | `1200` | Xvfb virtual display width |
| `DISPLAY_HEIGHT` | `2000` | Xvfb virtual display height |

### Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_SERVER` | (none) | Proxy server URL (e.g. `http://host.docker.internal:13128`) |
| `PROXY_BYPASS` | (none) | Comma-separated list of hosts to bypass proxy |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `39000` | API server port |
| `VNC_WEB_PORT` | `39001` | Web VNC (noVNC websockify) port |
| `VNC_TOKEN_TTL_SECONDS` | `300` | One-time VNC token TTL in seconds |

Example usage in docker-compose.yml:

```yaml
services:
  fuba-browser:
    environment:
      - LOCALE=en-US
      - TIMEZONE_ID=America/New_York
      - DISPLAY_WIDTH=1920
      - DISPLAY_HEIGHT=1080
      - VIEWPORT_WIDTH=1920
      - VIEWPORT_HEIGHT=1080
```

## Documentation

- [CLI Reference](cli/README.md)
- [API Reference](doc/API.md)
- [Usage Guide](doc/USAGE.md)
- [Egress Proxy Guide](doc/PROXY.md)
- [Development Guide](doc/DEVELOPMENT.md)

## Acknowledgments

The API design and CLI tool were inspired by [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser). The Snapshot/Ref system for accessibility tree-based element targeting is based on their approach.

## License

MIT
