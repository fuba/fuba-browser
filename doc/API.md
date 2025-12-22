# Fuba Browser API Documentation

## Base URL
```
http://localhost:3000
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