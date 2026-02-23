# fuba-browser

Docker-based browser automation tool with REST API for LLM agents.

## Quick Reference

- **API**: `http://localhost:39000`
- **VNC (noVNC)**: Host port 39001 → container port 6080
- **API docs (for LLM)**: `GET /api/docs/llm?format=markdown`
- **Health check**: `GET /health`

## Getting Started

Run `/quickstart` to set up fuba-browser and get a VNC URL.

## Key Conventions

- API responses are always `{"success": true, "data": {...}}` — read values from `.data`
- VNC tokens from `POST /api/web-vnc/token` are one-time use — response is `{"success":true,"data":{"token":"...","expiresAt":"..."}}`
- JavaScript execution API (`POST /api/eval`) uses `{"script": "..."}` parameter
- Element refs from snapshot (`@e1`, `@e2`) are used with `POST /api/action`
- `DEVICE_SCALE_FACTOR=2` (default): screenshots are 2x viewport size in pixels
