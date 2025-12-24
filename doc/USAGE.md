# Fuba Browser Usage Guide

## Quick Start

### Running Locally (Mac/Windows/Linux)

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Start the application:
```bash
npm start
```

The browser window will open, and the REST API will be available at `http://localhost:39000`.

### Running with Docker (Linux)

1. Build the Docker image:
```bash
docker-compose build
```

2. Start the container:
```bash
docker-compose up
```

Access points:
- REST API: `http://localhost:39000`
- VNC: `vnc://localhost:5900` (password: fuba-browser)
- Web VNC: `http://localhost:6080`

## Using with LLM Agents

### Example: Claude Code Integration

```python
import requests
import json

# Base URL for Fuba Browser API
BASE_URL = "http://localhost:39000"

# Navigate to a website
response = requests.post(f"{BASE_URL}/api/navigate", json={
    "url": "https://example.com"
})

# Get page content as Markdown
response = requests.get(f"{BASE_URL}/api/content")
content = response.json()
markdown = content["data"]["markdown"]
elements = content["data"]["elements"]

# Find and click a button
for element in elements:
    if element["tagName"] == "button" and "Submit" in element["text"]:
        requests.post(f"{BASE_URL}/api/click", json={
            "selector": element["selector"]
        })
        break

# Take a screenshot
response = requests.get(f"{BASE_URL}/api/screenshot")
with open("screenshot.png", "wb") as f:
    f.write(response.content)
```

## Element Identification

The API returns element information with:
- **selector**: CSS selector for targeting the element
- **bbox**: Bounding box coordinates (x, y, width, height)
- **areaPercentage**: Element size relative to viewport
- **attributes**: HTML attributes (id, class, href, etc.)

Elements with area >= 3% are marked as sections in the Markdown output.

## Cookie Management

Cookies are automatically saved and persisted across sessions. You can:
- View all cookies with `GET /api/cookies`
- Set custom cookies with `POST /api/cookies`
- Clear cookies with `DELETE /api/cookies`

## Best Practices

1. **Wait for Navigation**: After navigating, wait a moment for the page to load before extracting content.

2. **Use Specific Selectors**: When multiple elements match, use the most specific selector (preferably ID).

3. **Check Visibility**: Only interact with elements where `isVisible: true`.

4. **Handle Errors**: Always check the `success` field in responses and handle errors appropriately.

## Troubleshooting

### Common Issues

1. **Element not found**: Ensure the selector is correct and the element is visible.

2. **Navigation timeout**: Some sites may take longer to load. Consider adding delays.

3. **Cookie issues**: Clear cookies if experiencing session problems.

### Debug Mode

Set `DEBUG=true` in the environment to enable verbose logging:
```bash
DEBUG=true npm start
```