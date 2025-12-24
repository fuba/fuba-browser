# Fuba Browser

Docker-based browser automation tool with REST API for LLM agents

## Overview

Fuba Browser is a Chromium-based browser automation tool that runs in Docker and provides a REST API for LLM agents like Claude Code. It solves the token consumption problem of Chrome DevTools MCP by offering a streamlined REST API interface with Web VNC access.

## Features

- REST API for browser control (navigation, scrolling, clicking, typing)
- Page content extraction as extended Markdown format
- Element coordinate and identification information
- Cookie persistence and session management
- Web VNC for remote GUI access
- Docker-based deployment with X11 support
- Japanese font support (Noto Sans CJK & Noto Serif CJK)
- Configurable resource limits for heavy websites

## Quick Start

```bash
# Build and start
docker-compose up

# Access points:
# - REST API: http://localhost:39000
# - Web VNC: http://localhost:39001
# - VNC: vnc://localhost:5900 (password: fuba-browser)
```

## Architecture

- **Container**: Docker with X11/Xvfb
- **Browser**: Electron + Chromium
- **Backend**: Node.js + TypeScript
- **API Server**: Express
- **Browser Control**: Chrome DevTools Protocol
- **Remote Access**: noVNC + x11vnc
- **Fonts**: Noto Sans CJK JP, Noto Serif CJK JP

## Resource Configuration

The container is configured with generous resource limits to handle heavy websites like Amazon:

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