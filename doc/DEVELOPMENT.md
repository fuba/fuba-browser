# Development Guide

## Architecture Overview

```
fuba-browser/
├── src/
│   ├── main/           # Application entry point
│   ├── browser/        # Browser control logic (Playwright)
│   ├── server/         # REST API server
│   ├── utils/          # Utility functions
│   ├── types/          # TypeScript type definitions
│   └── test/           # Test files
├── dist/               # Compiled JavaScript
└── docker/             # Docker configuration
```

## Key Components

### 1. Application Entry Point (`src/main/index.ts`)
- Launches Playwright browser with Chromium
- Initializes the browser controller
- Starts the API server

### 2. Browser Controller (`src/browser/controller.ts`)
- Manages Playwright browser instance
- Implements browser automation methods
- Handles page content extraction

### 3. REST API Server (`src/server/`)
- Express-based HTTP server
- Route handlers for all endpoints
- Error handling middleware
- `VncPasswordManager` - Per-token VNC password rotation via x11vnc `-passwdfile read:` feature
- `TokenStore` - One-time token management with TTL

### 4. Markdown Converter (`src/utils/markdown.ts`)
- Converts HTML to enhanced Markdown
- Adds element coordinates and selectors
- Identifies interactive elements

## Development Workflow

### Setup Development Environment

```bash
# Clone the repository
git clone git@github.com:fuba/fuba-browser.git
cd fuba-browser

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Offline E2E Strategy (No External Internet)

- Use real Playwright + real API routes (no browser/controller mock in E2E).
- Serve fixture pages from a local ephemeral HTTP server (`127.0.0.1`) inside the test process.
- Add request blocking in Playwright context to allow only:
  - `127.0.0.1` / `localhost`
  - `about:`, `data:`, `blob:`
- Verify each API group (`browser`, `content`, `snapshot`, `wait`, `getter`, `input`, `storage`, `session`, `state`, `debug`, `export`, `system`, `web-vnc`) against local fixtures.
- Keep unit tests for edge cases and fast feedback; use offline E2E for end-to-end behavior coverage.

### Code Quality

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
```

## Adding New Features

### 1. New API Endpoint

Add route in `src/server/routes/browser.ts`:
```typescript
router.post('/api/new-feature', async (req, res) => {
  try {
    const result = await browserController.newFeature(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 2. New Browser Control Method

Add method in `src/browser/controller.ts`:
```typescript
async newFeature(params: any): Promise<any> {
  await this.connect();
  // Implementation using Chrome DevTools Protocol
  return result;
}
```

### 3. New Type Definitions

Add types in `src/types/browser.ts`:
```typescript
export interface NewFeatureRequest {
  param1: string;
  param2: number;
}
```

## Chrome DevTools Protocol

We use Chrome DevTools Protocol for browser control. Key domains:
- `Page`: Navigation, screenshots
- `DOM`: Element inspection
- `Runtime`: JavaScript execution
- `Input`: Mouse/keyboard events

Reference: https://chromedevtools.github.io/devtools-protocol/

## Building for Production

```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t fuba-browser .
```

## Docker Development

```bash
# Build Docker image
docker build -t fuba-browser .

# Run with mounted source for development
docker run -v $(pwd):/app -p 39000:39000 -p 6080:6080 fuba-browser
```

## Future Enhancements

1. **Operation Recording**: 
   - Capture user interactions
   - Store as reproducible scripts
   - Train LLM on recorded patterns

2. **Enhanced Element Detection**:
   - Machine learning for element classification
   - Visual similarity matching
   - Semantic element grouping

3. **Performance Optimization**:
   - Connection pooling for multiple windows
   - Caching frequently accessed content
   - Parallel request processing
