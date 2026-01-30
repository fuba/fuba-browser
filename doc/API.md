# Fuba Browser API Documentation

## Base URL
```
http://localhost:39000
```

## Health Check

### GET /health
Returns the health status of the API server.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Web VNC

### GET /web-vnc
Redirect to the noVNC web client with auto-connect parameters. This is intended
to be exposed through a reverse proxy that enforces authentication.

**Response:**
- 302 redirect to `/vnc.html#password=...&autoconnect=1` on the configured Web VNC port.

## Browser Control

### POST /api/navigate
Navigate to a specified URL.

**Request Body:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com"
  }
}
```

### POST /api/scroll
Scroll the page to specified coordinates.

**Request Body:**
```json
{
  "x": 0,
  "y": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "x": 0,
    "y": 100
  }
}
```

### POST /api/click
Click an element matching the selector.

**Request Body:**
```json
{
  "selector": "#submit-button"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#submit-button"
  }
}
```

### POST /api/type
Type text into an input field.

**Request Body:**
```json
{
  "selector": "input[name='username']",
  "text": "john_doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "input[name='username']",
    "text": "john_doe"
  }
}
```

### GET /api/screenshot
Capture a screenshot of the current page.

**Response:**
- Content-Type: image/png
- Binary PNG data

## Content Extraction

### GET /api/content
Get page content as extended Markdown format.

**Response:**
```json
{
  "success": true,
  "data": {
    "html": "<html>...</html>",
    "markdown": "# Page Title\n\n...",
    "elements": [
      {
        "tagName": "a",
        "selector": "#link-1",
        "text": "Click here",
        "bbox": {
          "x": 10,
          "y": 20,
          "width": 100,
          "height": 30
        },
        "attributes": {
          "id": "link-1",
          "href": "/page",
          "class": "nav-link"
        },
        "isVisible": true,
        "areaPercentage": 2.5
      }
    ],
    "url": "https://example.com",
    "title": "Example Domain"
  }
}
```

### GET /api/elements
Get all interactive elements on the page.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "tagName": "button",
      "selector": "#submit",
      "text": "Submit",
      "bbox": {
        "x": 100,
        "y": 200,
        "width": 80,
        "height": 40
      },
      "attributes": {
        "id": "submit",
        "type": "submit"
      },
      "isVisible": true,
      "areaPercentage": 1.2
    }
  ]
}
```

### GET /api/dom
Get simplified DOM tree information.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "title": "Example Domain",
    "elementsCount": 15,
    "elements": [...]
  }
}
```

## Session Management

### GET /api/cookies
Get all cookies for the current session.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "expires": 1234567890,
      "size": 16,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ]
}
```

### POST /api/cookies
Set a cookie.

**Request Body:**
```json
{
  "url": "https://example.com",
  "name": "user_pref",
  "value": "dark_mode"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "name": "user_pref",
    "value": "dark_mode"
  }
}
```

### DELETE /api/cookies
Clear all cookies.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Cookies cleared"
  }
}
```

### GET /api/session
Get current session information.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "title": "Example Domain",
    "cookiesCount": 3
  }
}
```

## Snapshot API

The snapshot API provides accessibility tree-based element identification with ref IDs for fast, deterministic element targeting.

### GET /api/snapshot
Get page accessibility snapshot with element refs.

**Query Parameters:**
- `interactive` (boolean): Only include interactive elements
- `compact` (boolean): Remove empty nodes
- `depth` (number): Maximum tree depth
- `selector` (string): Scope to a CSS selector

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "title": "Example Domain",
    "viewport": { "width": 1200, "height": 2000 },
    "timestamp": "2024-01-01T00:00:00.000Z",
    "tree": [
      {
        "ref": "e1",
        "role": "link",
        "name": "Click here",
        "tag": "a",
        "selector": "#link-1",
        "bbox": { "x": 10, "y": 20, "width": 100, "height": 30 },
        "visible": true,
        "focusable": true,
        "attributes": { "href": "/page" },
        "children": []
      }
    ],
    "refs": {
      "e1": { ... }
    }
  }
}
```

### POST /api/action
Perform action using a ref from snapshot.

**Request Body:**
```json
{
  "ref": "@e1",
  "action": "click"
}
```

**Available actions:**
- `click` - Click the element
- `dblclick` - Double-click the element
- `hover` - Hover over the element
- `focus` - Focus the element
- `fill` - Clear and type text (requires `value`)
- `type` - Type text (requires `value`)
- `check` - Check a checkbox
- `uncheck` - Uncheck a checkbox
- `select` - Select an option (requires `value`)

**Response:**
```json
{
  "success": true,
  "data": {
    "ref": "@e1",
    "action": "click",
    "selector": "#link-1"
  }
}
```

### DELETE /api/snapshot
Clear stored snapshot.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Snapshot cleared"
  }
}
```

## Extended Interaction API

### POST /api/hover
Hover over an element.

**Request Body:**
```json
{
  "selector": "#menu-item"
}
```

### POST /api/focus
Focus an element.

**Request Body:**
```json
{
  "selector": "input[name='email']"
}
```

### POST /api/check
Check a checkbox.

**Request Body:**
```json
{
  "selector": "input[type='checkbox']"
}
```

### POST /api/uncheck
Uncheck a checkbox.

**Request Body:**
```json
{
  "selector": "input[type='checkbox']"
}
```

### POST /api/select
Select an option in a dropdown.

**Request Body:**
```json
{
  "selector": "select[name='country']",
  "value": "JP"
}
```

## Wait API

Wait for various conditions before proceeding.

### POST /api/wait/selector
Wait for an element to appear.

**Request Body:**
```json
{
  "selector": "#loading-complete",
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#loading-complete",
    "found": true
  }
}
```

### POST /api/wait/text
Wait for text to appear on the page.

**Request Body:**
```json
{
  "text": "Success",
  "timeout": 30000
}
```

### POST /api/wait/url
Wait for URL to match a pattern.

**Request Body:**
```json
{
  "pattern": "**/dashboard",
  "timeout": 30000
}
```

### POST /api/wait/load
Wait for page load state.

**Request Body:**
```json
{
  "state": "networkidle"
}
```

**Available states:**
- `domcontentloaded` - DOM content loaded (default)
- `networkidle` - No network activity for 500ms

### POST /api/wait/timeout
Wait for a specified duration.

**Request Body:**
```json
{
  "ms": 2000
}
```

---

## Getter API

Get information about elements and page state.

### GET /api/get/title
Get the page title.

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "Example Domain"
  }
}
```

### GET /api/get/url
Get the current URL.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/page"
  }
}
```

### GET /api/get/text/:selector
Get text content of an element.

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#message",
    "text": "Hello World"
  }
}
```

### GET /api/get/html/:selector
Get HTML content of an element.

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#container",
    "html": "<div>...</div>"
  }
}
```

### GET /api/get/value/:selector
Get value of an input element.

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#email",
    "value": "user@example.com"
  }
}
```

### GET /api/get/count/:selector
Get count of matching elements.

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": ".item",
    "count": 10
  }
}
```

### POST /api/is/visible
Check if an element is visible.

**Request Body:**
```json
{
  "selector": "#modal"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selector": "#modal",
    "visible": true
  }
}
```

### POST /api/is/enabled
Check if an element is enabled.

**Request Body:**
```json
{
  "selector": "#submit"
}
```

### POST /api/is/checked
Check if a checkbox is checked.

**Request Body:**
```json
{
  "selector": "#agree"
}
```

---

## Input API

Keyboard and mouse control.

### POST /api/keyboard/press
Press a key or key combination.

**Request Body:**
```json
{
  "key": "Enter"
}
```

**Examples:**
- `"Enter"`, `"Tab"`, `"Escape"`
- `"Control+c"`, `"Control+v"`
- `"Shift+Tab"`

### POST /api/keyboard/down
Press and hold a key.

**Request Body:**
```json
{
  "key": "Shift"
}
```

### POST /api/keyboard/up
Release a key.

**Request Body:**
```json
{
  "key": "Shift"
}
```

### POST /api/mouse/move
Move the mouse to coordinates.

**Request Body:**
```json
{
  "x": 100,
  "y": 200
}
```

### POST /api/mouse/down
Press a mouse button.

**Request Body:**
```json
{
  "button": "left"
}
```

### POST /api/mouse/up
Release a mouse button.

**Request Body:**
```json
{
  "button": "left"
}
```

### POST /api/mouse/wheel
Scroll using mouse wheel.

**Request Body:**
```json
{
  "deltaY": 300,
  "deltaX": 0
}
```

---

## Storage API

Access localStorage and sessionStorage.

### GET /api/storage/local
Get all localStorage items.

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "abc123",
    "theme": "dark"
  }
}
```

### GET /api/storage/local/:key
Get a specific localStorage item.

### POST /api/storage/local
Set a localStorage item.

**Request Body:**
```json
{
  "key": "token",
  "value": "abc123"
}
```

### DELETE /api/storage/local
Clear all localStorage.

### DELETE /api/storage/local/:key
Delete a specific localStorage item.

### GET /api/storage/session
Get all sessionStorage items.

### GET /api/storage/session/:key
Get a specific sessionStorage item.

### POST /api/storage/session
Set a sessionStorage item.

### DELETE /api/storage/session
Clear all sessionStorage.

### DELETE /api/storage/session/:key
Delete a specific sessionStorage item.

---

## Debug API

Debugging and development tools.

### GET /api/console
Get console logs.

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "type": "log",
        "text": "Page loaded",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### DELETE /api/console
Clear console logs.

### GET /api/errors
Get JavaScript errors.

**Response:**
```json
{
  "success": true,
  "data": {
    "errors": [
      {
        "message": "Uncaught TypeError",
        "source": "https://example.com/app.js",
        "line": 42,
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### DELETE /api/errors
Clear errors.

### POST /api/eval
Execute JavaScript in the page context.

**Request Body:**
```json
{
  "script": "document.title"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Example Domain"
  }
}
```

### POST /api/highlight
Highlight an element visually.

**Request Body:**
```json
{
  "selector": "#target"
}
```

---

## State Management API

Save and load browser authentication state (cookies, localStorage, sessionStorage).

### POST /api/state/save
Save current browser state.

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.0",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "url": "https://example.com/dashboard",
    "cookies": [...],
    "localStorage": { "key1": "value1" },
    "sessionStorage": { "key2": "value2" }
  }
}
```

### POST /api/state/load
Load browser state from saved data.

**Request Body:**
```json
{
  "state": { ... },
  "navigateToUrl": true
}
```

**Options:**
- `navigateToUrl` (boolean): Navigate to the saved URL after loading state

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "State loaded successfully",
    "cookiesCount": 5,
    "localStorageCount": 3,
    "sessionStorageCount": 1,
    "url": "https://example.com/dashboard"
  }
}
```

### GET /api/state/info
Get current state info without full data.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/dashboard",
    "cookiesCount": 5,
    "localStorageCount": 3,
    "sessionStorageCount": 1,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## System API

System-level operations for browser management.

### POST /api/reset
Restart the browser process. This completely resets the browser state including all pages, cookies, storage, and memory.

**Request Body:** (none required)

**Response:**
```json
{
  "success": true,
  "message": "Browser has been reset"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Reset failed"
}
```

**Use Cases:**
- Browser becomes unresponsive
- Memory usage grows too high
- Need a completely clean state
- After long automation sessions

**CLI Usage:**
```bash
fbb reset
```

---

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- 400: Bad Request (missing required parameters)
- 500: Internal Server Error
