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

## Quick Start

### Start the Browser

```bash
# Build and start
docker-compose up

# Access points:
# - REST API: http://localhost:39000
# - Web VNC: http://localhost:39001
# - VNC: vnc://localhost:5900 (password: fuba-browser)
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
fbb type <selector> <text>
fbb fill <selector> <text>
fbb hover <selector>
fbb focus <selector>
fbb check <selector>
fbb uncheck <selector>
fbb select <selector> <value>
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
fbb get count <selector>
fbb is visible <selector>
fbb is enabled <selector>
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

### Debug
```bash
fbb eval <script>       # Execute JavaScript
fbb highlight <selector>
fbb console
fbb errors
fbb screenshot [path]
```

## Architecture

- **Container**: Docker with X11/Xvfb
- **Browser**: Electron + Chromium
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

## Documentation

- [API Reference](doc/API.md)
- [Usage Guide](doc/USAGE.md)
- [Development Guide](doc/DEVELOPMENT.md)

## License

CC0 (Creative Commons Zero)
