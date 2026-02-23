---
name: quickstart
description: Get started with fuba-browser. Checks if the container is running, helps start it, issues a VNC URL, and shows basic API/CLI usage. Use when setting up fuba-browser for the first time or when you need to quickly get a working environment.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, WebFetch
---

# fuba-browser Quickstart

You are helping the user get started with fuba-browser. Follow these steps in order.
Skip steps that are already satisfied.

## Step 1: Detect fuba-browser

Check if fuba-browser is already running by hitting the health endpoint.
Try common ports: 39000, then ask the user if not found.

```bash
curl -s --max-time 3 http://localhost:39000/health
```

- If you get `{"status":"ok",...}` → fuba-browser is running on port 39000. Skip to Step 3.
- If connection refused → go to Step 2.

If the user provided a custom host/port as arguments ($ARGUMENTS), use that instead.

## Step 2: Start fuba-browser

Check if the launcher script is available:

```bash
which fuba-browser 2>/dev/null || echo "not found"
```

**If launcher script exists:**
```bash
fuba-browser start
```

**If not, check for docker-compose in the repo:**
```bash
docker compose up -d
```

**If neither works**, tell the user to install via:
```bash
curl -fsSL https://raw.githubusercontent.com/fuba/fuba-browser/main/fuba-browser.sh -o fuba-browser.sh
chmod +x fuba-browser.sh
./fuba-browser.sh install
fuba-browser start
```

After starting, wait a few seconds and verify health:
```bash
sleep 5
curl -s --max-time 10 http://localhost:39000/health
```

## Step 3: Issue a VNC URL for the user

Ask the user:
> "VNC にアクセスする際のホスト名を教えてください（例: `myserver:39001`）。ローカルで使う場合はそのままEnterを押してください。"

Use AskUserQuestion with options:
- "localhost:39001 (local)" - for local access
- "Enter hostname manually" - for remote access

Then issue a VNC token:

**If user provided a hostname (e.g. `myserver:39001`):**
```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"vncHost":"<USER_PROVIDED_HOST>"}' \
  http://localhost:39000/api/web-vnc/token
```

**If localhost / no hostname:**
```bash
curl -s -X POST http://localhost:39000/api/web-vnc/token
```

Parse the response. The token is in `.data.token` (nested structure):
```bash
TOKEN=$(curl -s -X POST http://localhost:39000/api/web-vnc/token | jq -r '.data.token')
```

Present the VNC URL to the user:
```
http://<API_HOST>/web-vnc?token=<TOKEN>
```

IMPORTANT: This token is one-time use and expires in 5 minutes. Tell the user to open it now.

## Step 4: Show basic usage

Present this concise cheat sheet to the user:

### API (curl)
```bash
# Navigate to a URL
curl -X POST http://localhost:39000/api/navigate -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'

# Take a screenshot
curl -s http://localhost:39000/api/screenshot -o screenshot.png

# Get accessibility snapshot (interactive elements)
curl -s 'http://localhost:39000/api/snapshot?interactive=true'

# Click an element by ref
curl -X POST http://localhost:39000/api/action -H 'Content-Type: application/json' -d '{"ref":"@e1","action":"click"}'

# Execute JavaScript
curl -X POST http://localhost:39000/api/eval -H 'Content-Type: application/json' -d '{"script":"document.title"}'

# Issue a new VNC token (when the old one expires)
curl -s -X POST http://localhost:39000/api/web-vnc/token | jq -r '.data.token'
```

### CLI (fbb) - if installed
```bash
fbb open https://example.com     # Navigate
fbb snapshot -i                   # Get interactive elements
fbb click @e1                     # Click by ref
fbb screenshot output.png         # Screenshot
fbb eval "document.title"         # Run JavaScript
fbb vnc                           # Get VNC URL
```

### Key points
- The API parameter for JavaScript execution is `script` (not `expression`)
- API responses are wrapped in `{"success": true, "data": {...}}` - always read from `.data`
- VNC tokens are one-time use; issue a new one each time with `POST /api/web-vnc/token`
- For full API docs: `curl -s http://localhost:39000/api/docs/llm?format=markdown`

## Step 5: Confirm everything works

Navigate to a test page and take a screenshot to confirm:
```bash
curl -X POST http://localhost:39000/api/navigate -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'
curl -s http://localhost:39000/api/screenshot -o /tmp/fuba-test.png
```

Show the screenshot to the user to confirm the browser is working.

Tell the user: "fuba-browser のセットアップが完了しました。VNC URL をブラウザで開くと、操作の様子をリアルタイムで確認できます。"
