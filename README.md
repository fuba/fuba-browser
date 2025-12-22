# Fuba Browser

Browser automation tool with REST API for LLM agents

## Overview

Fuba Browser is a Chromium-based desktop application that provides a REST API for browser automation, designed specifically for use with LLM agents like Claude Code. It solves the token consumption problem of Chrome DevTools MCP by offering a streamlined REST API interface.

## Features

- REST API for browser control (navigation, scrolling, clicking, typing)
- Page content extraction as extended Markdown format
- Element coordinate and identification information
- Cookie persistence and session management
- Desktop GUI with user interaction capability
- Web VNC for remote GUI access (planned)
- Operation recording for future LLM learning (planned)

## Architecture

- **Frontend**: Electron + Chromium
- **Backend**: Node.js + TypeScript
- **API Server**: Express/Fastify
- **Browser Control**: Chrome DevTools Protocol

## Development Status

This project is in active development. See [doc/Tasks.md](doc/Tasks.md) for the development roadmap.

## License

CC0 (Creative Commons Zero)