# Fuba Browser Usage Guide

## Quick Start with Docker

### Option 1: Using Launcher Script (Recommended)

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

#### Launcher Script Commands

```bash
fuba-browser start     # Start the container
fuba-browser stop      # Stop the container
fuba-browser restart   # Restart the container
fuba-browser update    # Update to latest image and restart
fuba-browser status    # Show container status
fuba-browser logs      # Show container logs
fuba-browser pull      # Pull latest image
fuba-browser version   # Show version info
```

#### Command Options

Options for `start`, `restart`, and `update`:

```bash
-n, --name <name>         # Container name (default: fuba-browser)
-p, --api-port <port>     # API port (default: 39000)
-w, --vnc-web-port <port> # Web VNC port (default: 39001)
-v, --vnc-port <port>     # VNC port (not exposed by default)
-t, --tag <tag>           # Image tag (default: latest)
```

#### Multiple Instances

Run multiple browser instances with different names and ports:

```bash
# Start two instances
fuba-browser start -n browser1 -p 39000 -w 39001
fuba-browser start -n browser2 -p 39100 -w 39101

# Stop specific instance
fuba-browser stop browser1

# Check status of specific instance
fuba-browser status browser2
```

#### VNC Port Exposure

By default, the raw VNC port (5900) is not exposed. To expose it:

```bash
# Expose VNC on port 5900
fuba-browser start -v 5900

# Multiple instances with VNC
fuba-browser start -n browser1 -p 39000 -w 39001 -v 5900
fuba-browser start -n browser2 -p 39100 -w 39101 -v 5901
```

#### Environment Variables

```bash
FBB_IMAGE         # Image name (default: ghcr.io/fuba/fuba-browser)
FBB_TAG           # Image tag (default: latest)
FBB_SHM_SIZE      # Shared memory size (default: 2g)
FBB_AUTO_UPDATE   # Auto-update on start (default: true)
FBB_VNC_PASSWORD  # VNC password (default: fuba-browser)
```

Example:

```bash
# Disable auto-update
FBB_AUTO_UPDATE=false fuba-browser start

# Use specific version via environment
FBB_TAG=1.0.0 fuba-browser start
```

### Option 2: Using Docker Directly

Pull and run the image from GitHub Container Registry:

```bash
# Pull the image
docker pull ghcr.io/fuba/fuba-browser:1.0.0

# Run the container
docker run -d \
  --name fuba-browser \
  -p 39000:39000 \
  -p 39001:6080 \
  -p 5900:5900 \
  --shm-size=2g \
  ghcr.io/fuba/fuba-browser:1.0.0
```

### Option 3: Building from Source

1. Clone and build:
```bash
git clone https://github.com/fuba/fuba-browser.git
cd fuba-browser
npm ci
npm run build
docker-compose up
```

Access points:
- REST API: `http://localhost:39000`
- Web VNC (auto-login): `http://localhost:39000/web-vnc`
- Web VNC (manual): `http://localhost:39001`
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

## Web VNC Access

Generate a one-time URL to access the browser via noVNC in your web browser.

### Get noVNC URL
```bash
# Auto-detect host (for local access)
fbb vnc

# Specify external host (for remote access)
fbb vnc --vnc-host puma2:39101
```

### API Usage
```bash
# Issue token with external host
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"vncHost":"puma2:39101"}' \
  http://puma2:39100/api/web-vnc/token | jq -r '.data.token')

# Open in browser
open "http://puma2:39100/web-vnc?token=${TOKEN}"
```

### Multiple Instances
When running multiple fuba-browser instances, specify the `vncHost` to ensure the noVNC redirect points to the correct instance:

```bash
# Instance 1: API on 39000, noVNC on 39001
fbb --port 39000 vnc --vnc-host myhost:39001

# Instance 2: API on 39100, noVNC on 39101
fbb --port 39100 vnc --vnc-host myhost:39101
```

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

## System Commands

### Health Check
```bash
fbb health               # Check if API server is running
```

Returns server status and version information.

### Reset Browser
```bash
fbb reset                # Restart Chromium process
```

Completely resets the browser state by restarting the Chromium process. Use this when:
- Browser becomes unresponsive
- Memory usage grows too high
- Need a completely clean state
- After long automation sessions

**Note:** This is more thorough than clearing cookies/storage - it restarts the entire browser process.

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

### Browser Becomes Unresponsive
```bash
fbb reset                # Restart browser process
```

### Debug Mode
```bash
DEBUG=true docker-compose up
```
