import fs from 'node:fs';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import request from 'supertest';
import { BrowserController } from '../../browser/controller.js';
import { SnapshotGenerator } from '../../browser/snapshot.js';
import { setupRoutes } from '../../server/routes/index.js';
import { TokenStore } from '../../server/token-store.js';
import { VncPasswordManager } from '../../server/vnc-password-manager.js';
import { buildWebVncRedirectUrl } from '../../server/index.js';
import { errorHandler } from '../../server/middleware/error.js';

interface FixtureServer {
  baseUrl: string;
  host: string;
  close: () => Promise<void>;
}

export interface OfflineE2EHarness {
  agent: ReturnType<typeof request>;
  baseUrl: string;
  host: string;
  close: () => Promise<void>;
}

function renderFixtureHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline Fixture</title>
    <style>
      body { font-family: sans-serif; margin: 0; min-height: 2800px; }
      main { width: 680px; margin: 16px auto; padding: 16px; border: 1px solid #ccc; }
      #status { margin-top: 12px; color: #333; }
      #hover-target, #focus-target { margin-top: 10px; padding: 10px; border: 1px solid #888; }
      #hidden-target { display: none; }
    </style>
  </head>
  <body>
    <main id="main-panel">
      <h1 id="title">Offline Fixture</h1>
      <button id="primary-btn" class="countable">Primary Action</button>
      <button id="dbl-btn" class="countable">Double Action</button>
      <input id="text-input" type="text" value="" />
      <input id="check-input" type="checkbox" />
      <select id="select-input">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>
      <button id="disabled-btn" disabled>Disabled Button</button>
      <div id="hover-target" role="button" tabindex="0">Hover Area</div>
      <div id="focus-target" tabindex="0">Focus Area</div>
      <a id="next-link" href="/next">Go Next</a>
      <div id="hidden-target">Hidden</div>
      <div id="click-count">0</div>
      <div id="dbl-count">0</div>
      <div id="status">idle</div>
    </main>
    <script>
      const clickCount = document.getElementById('click-count');
      const dblCount = document.getElementById('dbl-count');
      const status = document.getElementById('status');
      const primary = document.getElementById('primary-btn');
      const dbl = document.getElementById('dbl-btn');
      const hoverTarget = document.getElementById('hover-target');
      const focusTarget = document.getElementById('focus-target');

      primary.addEventListener('click', () => {
        clickCount.textContent = String(Number(clickCount.textContent) + 1);
      });

      dbl.addEventListener('dblclick', () => {
        dblCount.textContent = String(Number(dblCount.textContent) + 1);
      });

      hoverTarget.addEventListener('mouseenter', () => {
        status.textContent = 'hovered';
      });

      focusTarget.addEventListener('focus', () => {
        status.textContent = 'focused';
      });
    </script>
  </body>
</html>`;
}

function renderNextPageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Next Page</title>
  </head>
  <body>
    <h1 id="next-title">Next Page</h1>
    <p id="next-text">Navigation Success</p>
  </body>
</html>`;
}

function sendHtml(res: ServerResponse<IncomingMessage>, html: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

async function startFixtureServer(): Promise<FixtureServer> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname === '/' || url.pathname === '/app') {
      sendHtml(res, renderFixtureHtml());
      return;
    }

    if (url.pathname === '/next') {
      sendHtml(res, renderNextPageHtml());
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve fixture server address');
  }

  const host = '127.0.0.1';
  const baseUrl = `http://${host}:${address.port}`;

  return {
    baseUrl,
    host,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function isAllowedRequest(urlText: string): boolean {
  if (urlText.startsWith('about:') || urlText.startsWith('data:') || urlText.startsWith('blob:')) {
    return true;
  }

  try {
    const parsed = new URL(urlText);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

async function createBrowserSession(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    if (isAllowedRequest(route.request().url())) {
      void route.continue();
      return;
    }
    void route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  await page.goto('about:blank');

  return { browser, context, page };
}

export async function createOfflineE2EHarness(): Promise<OfflineE2EHarness> {
  const fixture = await startFixtureServer();
  const vncTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuba-vnc-e2e-'));
  const passwdFilePath = path.join(vncTempDir, 'vnc-passwords');

  let { browser, context, page } = await createBrowserSession();

  const browserController = new BrowserController(page, context);
  const snapshotGenerator = new SnapshotGenerator(page);
  const tokenStore = new TokenStore(60);
  const vncPasswordManager = new VncPasswordManager({ passwdFilePath, ttlSeconds: 120 });
  vncPasswordManager.start();

  const resetBrowser = async (): Promise<void> => {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);

    const nextSession = await createBrowserSession();
    browser = nextSession.browser;
    context = nextSession.context;
    page = nextSession.page;

    browserController.setPageAndContext(page, context);
    snapshotGenerator.setPage(page);
  };

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.get('/web-vnc', (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token is required' });
    }

    const metadata = tokenStore.consumeToken(token);
    if (!metadata) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (!metadata.vncPassword) {
      return res.status(503).json({ success: false, error: 'No VNC password associated with this token' });
    }

    const redirectUrl = buildWebVncRedirectUrl(req, 39001, metadata.vncPassword, metadata.vncHost);
    return res.redirect(302, redirectUrl);
  });

  setupRoutes(app, browserController, snapshotGenerator, {
    resetBrowser,
    tokenStore,
    vncPasswordManager,
  });

  app.use(errorHandler);

  return {
    agent: request(app),
    baseUrl: fixture.baseUrl,
    host: fixture.host,
    close: async () => {
      vncPasswordManager.stop();
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      await fixture.close().catch(() => undefined);
      fs.rmSync(vncTempDir, { recursive: true, force: true });
    },
  };
}
