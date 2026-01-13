# fbb - Fuba Browser CLI

Command-line interface for fuba-browser automation.

## Installation

```bash
cd cli
npm install
npm link
```

This makes the `fbb` command available globally.

## Quick Start

```bash
# Navigate to a URL
fbb open https://example.com

# Get interactive elements with refs
fbb snapshot -i

# Click using ref from snapshot
fbb click @e1

# Fill a form field
fbb fill @e2 "user@example.com"

# Take a screenshot
fbb screenshot output.png
```

## Global Options

```bash
--host <host>    API host (default: localhost)
--port <port>    API port (default: 39000)
--timeout <ms>   Request timeout in milliseconds (default: 30000)
--json           Output in JSON format
--debug          Enable debug output
-h, --help       Display help
-V, --version    Output version number
```

## Commands Reference

### Navigation

| Command | Description |
|---------|-------------|
| `open <url>` | Navigate to URL (aliases: `goto`, `navigate`) |
| `snapshot [options]` | Get accessibility snapshot with element refs |

**Snapshot options:**
- `-i, --interactive` - Only include interactive elements
- `-c, --compact` - Remove empty nodes
- `-d, --depth <n>` - Maximum tree depth
- `-s, --selector <sel>` - Scope to CSS selector

### Interaction

| Command | Description |
|---------|-------------|
| `click <selector>` | Click an element (CSS selector or @ref) |
| `dblclick <selector>` | Double-click an element |
| `type <selector> <text>` | Type text (appends to existing) |
| `fill <selector> <text>` | Clear and fill text |
| `hover <selector>` | Hover over an element |
| `focus <selector>` | Focus an element |
| `check <selector>` | Check a checkbox |
| `uncheck <selector>` | Uncheck a checkbox |
| `select <selector> <value>` | Select dropdown option |
| `scroll <direction> [px]` | Scroll (up/down/left/right) |
| `screenshot [path]` | Take a screenshot |

### Information (`get`)

| Command | Description |
|---------|-------------|
| `get title` | Get page title |
| `get url` | Get current URL |
| `get text <selector>` | Get element text content |
| `get html <selector>` | Get element innerHTML |
| `get value <selector>` | Get input element value |
| `get attr <selector> <attr>` | Get element attribute |
| `get count <selector>` | Get count of matching elements |
| `get box <selector>` | Get element bounding box |

### Content

| Command | Description |
|---------|-------------|
| `content` | Get page content (HTML, markdown, elements) |
| `elements` | Get interactive elements |

### State Check (`is`)

| Command | Description |
|---------|-------------|
| `is visible <selector>` | Check if element is visible (exit 1 if false) |
| `is enabled <selector>` | Check if element is enabled (exit 1 if false) |
| `is checked <selector>` | Check if checkbox is checked (exit 1 if false) |

### Wait

| Command | Description |
|---------|-------------|
| `wait selector <sel>` | Wait for element to appear |
| `wait text <text>` | Wait for text to appear |
| `wait url <pattern>` | Wait for URL to match pattern |
| `wait load [state]` | Wait for page load (load/domcontentloaded/networkidle) |
| `wait timeout <ms>` | Wait for specified milliseconds (alias: `delay`) |

**Wait options:**
- `-t, --timeout <ms>` - Timeout in milliseconds (default: 30000)
- `-s, --selector <sel>` - Scope to selector (for `wait text`)

### Keyboard

| Command | Description |
|---------|-------------|
| `press <key>` | Press a key (alias: `key`) |
| `keydown <key>` | Hold down a key |
| `keyup <key>` | Release a key |

**Key examples:** `Enter`, `Tab`, `Escape`, `ArrowUp`, `Control+c`, `Shift+Tab`

### Mouse

| Command | Description |
|---------|-------------|
| `mouse move <x> <y>` | Move mouse to position |
| `mouse down [button]` | Press mouse button (left/right/middle) |
| `mouse up [button]` | Release mouse button |
| `mouse wheel <deltaY> [deltaX]` | Scroll with mouse wheel |

### Storage

**localStorage:**

| Command | Description |
|---------|-------------|
| `storage local list` | List all localStorage items (alias: `ls`) |
| `storage local get <key>` | Get localStorage item |
| `storage local set <key> <value>` | Set localStorage item |
| `storage local delete <key>` | Delete localStorage item (alias: `rm`) |
| `storage local clear` | Clear all localStorage |

**sessionStorage:**

| Command | Description |
|---------|-------------|
| `storage session list` | List all sessionStorage items |
| `storage session get <key>` | Get sessionStorage item |
| `storage session set <key> <value>` | Set sessionStorage item |
| `storage session clear` | Clear all sessionStorage |

### Cookies

| Command | Description |
|---------|-------------|
| `cookies list` | List all cookies (alias: `ls`) |
| `cookies clear` | Clear all cookies |

### State Management

| Command | Description |
|---------|-------------|
| `state save <path>` | Save browser state to file |
| `state load <path>` | Load browser state from file |
| `state info` | Show current browser state info |

**State load options:**
- `-n, --navigate` - Navigate to saved URL after loading

### Debug

| Command | Description |
|---------|-------------|
| `eval <script>` | Execute JavaScript in the page |
| `highlight <selector>` | Highlight element visually (3 seconds) |
| `console [--clear]` | Get/clear console messages |
| `errors [--clear]` | Get/clear page errors |

### Health

| Command | Description |
|---------|-------------|
| `health` | Check API server health |

## Snapshot/Ref System

The snapshot command returns an accessibility tree with element refs. Each interactive element gets a unique ref (e.g., `@e1`, `@e2`) that can be used for targeting.

```bash
# Get snapshot
fbb snapshot -i

# Output:
# @e1 link "Home"
# @e2 button "Login"
# @e3 textbox "Email"

# Use refs
fbb click @e2
fbb fill @e3 "user@example.com"
```

Refs are faster and more reliable than CSS selectors for dynamic pages.

## Exit Codes

- `0` - Success
- `1` - Error or condition not met (for `is` commands)

## Environment Variables

You can also configure the API endpoint using environment variables:

```bash
export FBB_HOST=localhost
export FBB_PORT=39000
```

Command-line options take precedence over environment variables.

## Examples

### Login automation

```bash
fbb open https://example.com/login
fbb snapshot -i
fbb fill @e1 "username"
fbb fill @e2 "password"
fbb click @e3
fbb wait url "**/dashboard"
fbb state save auth.json
```

### Restore session

```bash
fbb state load auth.json --navigate
```

### Check if element exists

```bash
if fbb is visible "#error-message"; then
  echo "Error found"
fi
```

### Wait and interact

```bash
fbb open https://example.com
fbb wait selector "#content"
fbb screenshot page.png
```

## See Also

- [API Reference](../doc/API.md)
- [Usage Guide](../doc/USAGE.md)
- [Development Guide](../doc/DEVELOPMENT.md)
