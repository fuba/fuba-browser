---
name: fuba-recorder-setup
description: Set up fuba-browser for browser recording and automation. Detects or starts the container, issues a VNC URL with correct hostname, and shows API/CLI usage. Use when you need a working fuba-browser environment.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, WebFetch
argument-hint: "[host:api-port]"
---

# fuba-browser Setup

You are helping the user set up fuba-browser for browser recording and automation.
Follow these steps in order. Skip steps that are already satisfied.

## Step 1: Detect fuba-browser

Determine the API host and port. If the user passed arguments ($ARGUMENTS), parse them as `host:port`.
Otherwise default to `localhost:39000`.

```bash
curl -s --max-time 3 http://localhost:39000/health
```

- `{"status":"ok",...}` → running. Skip to Step 4.
- Connection refused → go to Step 2.

## Step 2: Check system resources

fuba-browser requires substantial resources. Before starting, verify the host machine meets minimum requirements.

Run these checks:

```bash
# Total memory in GB
free -g | awk '/^Mem:/{print $2}'

# CPU cores
nproc

# Docker shared memory default (if Docker is running)
docker info --format '{{.MemTotal}}' 2>/dev/null
```

**Minimum requirements:**
- **Memory**: 4GB free (8GB+ total recommended)
- **CPU**: 2 cores (4+ recommended)
- **Shared memory**: 2GB (`--shm-size=2g` is set by the launcher script and docker-compose.yml)

**Evaluate the results:**
- If total memory < 4GB: **STOP**. Tell the user: "メモリが不足しています（最低4GB必要、8GB以上推奨）。fuba-browser は Chromium を動かすため、十分なメモリが必要です。"
- If CPU cores < 2: **WARN**. Tell the user: "CPU コア数が少ないです（2コア以上推奨、4コア以上で快適）。動作が遅くなる可能性があります。"
- If both are sufficient: proceed silently.

Also verify Docker is available:
```bash
docker --version
```
If Docker is not installed, **STOP** and tell the user to install Docker first.

## Step 3: Start fuba-browser

Try in order:

1. **Launcher script** (if installed):
   ```bash
   which fuba-browser 2>/dev/null && fuba-browser start
   ```

2. **docker compose** (if in the fuba-browser repo):
   ```bash
   docker compose up -d
   ```

3. **Manual install**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/fuba/fuba-browser/main/fuba-browser.sh -o fuba-browser.sh
   chmod +x fuba-browser.sh
   ./fuba-browser.sh install
   fuba-browser start
   ```

Verify after starting:
```bash
sleep 5
curl -s --max-time 10 http://localhost:39000/health
```

## Step 4: Issue a VNC URL

Ask the user for the hostname that they use to access this machine in their browser.

Use AskUserQuestion:
- Question: "VNC にブラウザからアクセスする際のホスト名:ポートを教えてください。ローカルの場合はそのままどうぞ。"
- Options:
  - "localhost:39001 (ローカル)" — local access, no vncHost needed
  - "ホスト名を入力する" — user provides their own hostname like `myserver:39001`

**With vncHost** (remote):
```bash
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"vncHost":"<USER_HOST>"}' \
  http://<API_HOST>/api/web-vnc/token | jq -r '.data.token')
```

**Without vncHost** (local):
```bash
TOKEN=$(curl -s -X POST http://<API_HOST>/api/web-vnc/token | jq -r '.data.token')
```

Response structure: `{"success":true,"data":{"token":"...","expiresAt":"..."}}`
The token is at `.data.token` — not `.token`.

Present the URL to the user:
```
http://<API_HOST>/web-vnc?token=<TOKEN>
```

Tell the user: this token is **one-time use** and expires in 5 minutes. Open it now.

## Step 5: Verify with a test page

```bash
curl -s -X POST http://<API_HOST>/api/navigate \
  -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'
curl -s http://<API_HOST>/api/screenshot -o /tmp/fuba-test.png
```

Show the screenshot to the user to confirm the browser is working.

## Step 6: Show cheat sheet

### API (curl)
```bash
# Navigate
curl -X POST http://localhost:39000/api/navigate -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'

# Screenshot
curl -s http://localhost:39000/api/screenshot -o screenshot.png

# Accessibility snapshot (interactive elements with @refs)
curl -s 'http://localhost:39000/api/snapshot?interactive=true'

# Click element by ref
curl -X POST http://localhost:39000/api/action -H 'Content-Type: application/json' \
  -d '{"ref":"@e1","action":"click"}'

# Execute JavaScript (parameter name is "script", not "expression")
curl -X POST http://localhost:39000/api/eval -H 'Content-Type: application/json' \
  -d '{"script":"document.title"}'

# New VNC token
curl -s -X POST http://localhost:39000/api/web-vnc/token | jq -r '.data.token'

# Full API docs (markdown, for LLM context)
curl -s 'http://localhost:39000/api/docs/llm?format=markdown'
```

### CLI (fbb)
```bash
fbb open https://example.com     # Navigate
fbb snapshot -i                   # Interactive elements
fbb click @e1                     # Click by ref
fbb screenshot output.png         # Screenshot
fbb eval "document.title"         # JavaScript
fbb vnc                           # VNC URL
```

### Key conventions
- API responses: `{"success": true, "data": {...}}` — always read `.data`
- VNC tokens are one-time use — issue a new one each time
- `DEVICE_SCALE_FACTOR=2` (default): screenshots are 2× viewport pixels

Tell the user: "fuba-browser のセットアップが完了しました。VNC URL をブラウザで開くと、操作の様子をリアルタイムで確認できます。"
