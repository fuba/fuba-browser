# Fuba Browser Usage Guide

## Quick Start with Docker

1. Build and start the container:
```bash
docker-compose up
```

Access points:
- REST API: `http://localhost:39000`
- Web VNC: `http://localhost:39001`
- VNC: `vnc://localhost:5900` (password: fuba-browser)

## CLI Tool (`fbb`)

### Installation

```bash
cd cli
npm install
npm link
```

### Global Options

```bash
--host <host>       # API host (default: localhost)
--port <port>       # API port (default: 39000)
--json              # JSON output
--timeout <ms>      # Timeout
--debug             # Debug output
```

---

## Navigation Commands

### Open URL
```bash
fbb open https://example.com

# Aliases
fbb goto https://example.com
fbb navigate https://example.com
```

### Get Page Snapshot (Accessibility Tree)
```bash
# Basic snapshot
fbb snapshot

# Interactive elements only
fbb snapshot -i

# Compact mode (remove empty nodes)
fbb snapshot -c

# Limit depth
fbb snapshot -d 3

# Scope to selector
fbb snapshot -s "#main"

# JSON output
fbb snapshot --json

# Combine options
fbb snapshot -i -c --json
```

---

## Snapshot/Ref System

The snapshot command returns an accessibility tree with element refs. Each element has a unique ref (e.g., `@e1`, `@e2`) that can be used for fast, deterministic targeting.

### Example Workflow
```bash
# 1. Get snapshot
fbb snapshot -i

# Output:
# @e1 link "Home"
# @e2 button "Login"
# @e3 textbox "Email"
# @e4 textbox "Password"

# 2. Interact using refs
fbb click @e2        # Click login button
fbb fill @e3 "user@example.com"
fbb fill @e4 "password"
fbb click @e2        # Submit
```

---

## Interaction Commands

### Click
```bash
fbb click "#submit"      # CSS selector
fbb click @e1            # Ref from snapshot
```

### Double-Click
```bash
fbb dblclick "#item"     # CSS selector
fbb dblclick @e1         # Ref from snapshot
```

### Type & Fill
```bash
fbb type "#search" "query"     # Append text
fbb fill "#email" "user@example.com"  # Clear and type
```

### Hover & Focus
```bash
fbb hover "#menu-item"
fbb focus "#input-field"
```

### Checkbox
```bash
fbb check "#agree"
fbb uncheck "#newsletter"
```

### Select Dropdown
```bash
fbb select "#country" "JP"
```

### Scroll
```bash
fbb scroll down            # Scroll down 100px (default)
fbb scroll up              # Scroll up 100px
fbb scroll left            # Scroll left 100px
fbb scroll right           # Scroll right 100px
fbb scroll down 500        # Scroll down 500px
fbb scroll up 200          # Scroll up 200px
```

---

## Wait Commands

### Wait for Element
```bash
fbb wait selector "#loading-complete"
```

### Wait for Text
```bash
fbb wait text "Success"
```

### Wait for URL
```bash
fbb wait url "**/dashboard"
```

### Wait for Page Load
```bash
fbb wait load                 # DOM content loaded
fbb wait load networkidle     # Network idle
```

### Wait Timeout
```bash
fbb wait timeout 2000         # Wait 2 seconds (alias: fbb wait delay 2000)
```

---

## Information Commands

### Get Element Data
```bash
fbb get title                       # Page title
fbb get url                         # Current URL
fbb get text "#message"             # Element text
fbb get html "#container"           # Element HTML
fbb get value "#input"              # Input value
fbb get count ".items"              # Element count
fbb get attr "#link" "href"         # Element attribute
fbb get box "#button"               # Element bounding box (x, y, width, height)
```

### Check Element State
```bash
fbb is visible "#modal"
fbb is enabled "#submit"
fbb is checked "#checkbox"
```

---

## Keyboard & Mouse Commands

### Keyboard
```bash
fbb press Enter          # Press Enter key (alias: fbb key Enter)
fbb press Tab
fbb press "Control+c"
fbb press "Shift+Tab"
fbb keydown Shift        # Hold down Shift
fbb keyup Shift          # Release Shift
```

### Mouse
```bash
fbb mouse move 100 200         # Move to coordinates
fbb mouse wheel 300            # Scroll down
fbb mouse wheel -300           # Scroll up
```

---

## Storage Commands

### localStorage
```bash
fbb storage local list             # List all keys
fbb storage local get token        # Get value
fbb storage local set token "abc"  # Set value
fbb storage local clear            # Clear all
```

### sessionStorage
```bash
fbb storage session list
fbb storage session get key
fbb storage session set key "value"
fbb storage session clear
```

### Cookies
```bash
fbb cookies list          # List all cookies
fbb cookies clear         # Clear all cookies
```

---

## State Management (Authentication)

Save and restore browser state (cookies, localStorage, sessionStorage) for authentication persistence.

### Save State
```bash
fbb state save auth.json
```

### Load State
```bash
fbb state load auth.json              # Load state only
fbb state load auth.json --navigate   # Load and navigate to saved URL
```

### State Info
```bash
fbb state info
```

### Example: Login Once, Use Forever
```bash
# 1. Login manually or via automation
fbb open https://example.com/login
fbb fill @e1 "username"
fbb fill @e2 "password"
fbb click @e3

# 2. Wait for login to complete
fbb wait url "**/dashboard"

# 3. Save authentication state
fbb state save ~/auth/example.json

# 4. Later, restore the session
fbb state load ~/auth/example.json --navigate
# Now you're logged in without re-authenticating!
```

---

## Content Commands

### Get Page Content
```bash
fbb content              # Get full page content (HTML, markdown, elements)
```

Returns page content including:
- HTML source
- Markdown representation
- Interactive elements

### Get Interactive Elements
```bash
fbb elements             # Get list of interactive elements
```

Returns a list of interactive elements on the page (buttons, links, inputs, etc.).

---

## Debug Commands

### Console Logs
```bash
fbb console              # Show console logs
```

### JavaScript Errors
```bash
fbb errors               # Show JavaScript errors
```

### Execute JavaScript
```bash
fbb eval "document.title"
fbb eval "window.scrollTo(0, 1000)"
```

### Highlight Element
```bash
fbb highlight "#target"  # Highlight element in browser
```

---

## Screenshot & Export

### Screenshot
```bash
fbb screenshot                    # Save to screenshot.png
fbb screenshot output.png         # Custom filename
```

---

## Health Check

### Check API Server Status
```bash
fbb health               # Check if API server is running
```

Returns server status and version information.

---

## Using with LLM Agents

### Example: Claude Code Integration

```python
import requests
import json

BASE_URL = "http://localhost:39000"

# Navigate to a website
requests.post(f"{BASE_URL}/api/navigate", json={
    "url": "https://example.com"
})

# Get accessibility snapshot with refs
response = requests.get(f"{BASE_URL}/api/snapshot?interactive=true")
snapshot = response.json()

# Find and click element by ref
for ref, element in snapshot["data"]["refs"].items():
    if element["role"] == "button" and "Submit" in element.get("name", ""):
        requests.post(f"{BASE_URL}/api/action", json={
            "ref": f"@{ref}",
            "action": "click"
        })
        break

# Fill a form field
requests.post(f"{BASE_URL}/api/action", json={
    "ref": "@e3",
    "action": "fill",
    "value": "user@example.com"
})

# Wait for navigation
requests.post(f"{BASE_URL}/api/wait/url", json={
    "pattern": "**/success"
})

# Take a screenshot
response = requests.get(f"{BASE_URL}/api/screenshot")
with open("screenshot.png", "wb") as f:
    f.write(response.content)
```

---

## Best Practices

1. **Use Snapshot/Ref System**: More reliable than CSS selectors for dynamic pages.

2. **Wait for State Changes**: Always wait after navigation or interaction.
   ```bash
   fbb click @e1
   fbb wait load
   ```

3. **Save Authentication State**: Avoid re-logging in by saving state.
   ```bash
   fbb state save auth.json
   ```

4. **Use Interactive Mode**: Filter to interactive elements for cleaner output.
   ```bash
   fbb snapshot -i
   ```

5. **Check Element State**: Verify elements before interacting.
   ```bash
   fbb is visible "#modal" && fbb click "#close"
   ```

---

## Troubleshooting

### Element Not Found
- Run `fbb snapshot -i` to see available elements
- Check if element is visible with `fbb is visible`
- Wait for element with `fbb wait selector`

### Stale Refs
- Refs are invalidated after page changes
- Run `fbb snapshot` again after navigation

### Authentication Issues
- Save state after successful login
- Load state before accessing protected pages
- Check if cookies expired with `fbb cookies list`

### Debug Mode
```bash
DEBUG=true docker-compose up
```
