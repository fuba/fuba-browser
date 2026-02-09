import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webVncRoutes } from '../server/routes/web-vnc.js';
import { TokenStore } from '../server/token-store.js';
import { buildWebVncRedirectUrl } from '../server/index.js';
import { VncPasswordManager } from '../server/vnc-password-manager.js';

describe('Web VNC Token Integration', () => {
  let app: express.Express;
  let tokenStore: TokenStore;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    tokenStore = new TokenStore(60);
    app.use('/api', webVncRoutes(tokenStore));

    // Token-gated /web-vnc endpoint (mirrors server/index.ts logic)
    app.get('/web-vnc', (req, res) => {
      const vncPassword = process.env.VNC_PASSWORD;
      if (!vncPassword) {
        return res.status(503).json({ success: false, error: 'VNC password is not configured' });
      }
      const token = req.query.token as string | undefined;
      if (!token) {
        return res.status(401).json({ success: false, error: 'Token is required' });
      }
      const metadata = tokenStore.consumeToken(token);
      if (!metadata) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      const redirectUrl = buildWebVncRedirectUrl(req, 39001, vncPassword, metadata.vncHost);
      return res.redirect(302, redirectUrl);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /api/web-vnc/token', () => {
    it('issues a token when VNC_PASSWORD is set', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      const response = await request(app)
        .post('/api/web-vnc/token')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('returns 503 when VNC_PASSWORD is not set', async () => {
      vi.stubEnv('VNC_PASSWORD', '');

      const response = await request(app)
        .post('/api/web-vnc/token')
        .send();

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /web-vnc', () => {
    it('redirects with a valid token', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');
      const { token } = tokenStore.createToken();

      const response = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('vnc.html');
      expect(response.headers.location).toContain('password=secret');
    });

    it('rejects when no token is provided', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      const response = await request(app)
        .get('/web-vnc');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Token is required');
    });

    it('rejects an invalid token', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      const response = await request(app)
        .get('/web-vnc?token=invalidtoken');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('rejects a consumed (already used) token', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');
      const { token } = tokenStore.createToken();

      // First use: should redirect
      const first = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);
      expect(first.status).toBe(302);

      // Second use: should reject
      const second = await request(app)
        .get(`/web-vnc?token=${token}`);
      expect(second.status).toBe(401);
      expect(second.body.error).toBe('Invalid or expired token');
    });

    it('rejects an expired token', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');
      vi.useFakeTimers();

      const { token } = tokenStore.createToken();

      // Advance past TTL
      vi.advanceTimersByTime(61 * 1000);

      const response = await request(app)
        .get(`/web-vnc?token=${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');

      vi.useRealTimers();
    });

    it('returns 503 when VNC_PASSWORD is not set', async () => {
      vi.stubEnv('VNC_PASSWORD', '');
      const { token } = tokenStore.createToken();

      const response = await request(app)
        .get(`/web-vnc?token=${token}`);

      expect(response.status).toBe(503);
    });

    it('full flow: issue token via API then use it', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      // Issue token
      const issueRes = await request(app)
        .post('/api/web-vnc/token')
        .send();
      expect(issueRes.status).toBe(200);

      const token = issueRes.body.data.token;

      // Use token to access web-vnc
      const vncRes = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);
      expect(vncRes.status).toBe(302);

      // Try again - should fail
      const retryRes = await request(app)
        .get(`/web-vnc?token=${token}`);
      expect(retryRes.status).toBe(401);
    });

    it('full flow: issue token with vncHost and redirect to specified host', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      // Issue token with vncHost
      const issueRes = await request(app)
        .post('/api/web-vnc/token')
        .send({ vncHost: 'puma2:39101' });
      expect(issueRes.status).toBe(200);

      const token = issueRes.body.data.token;

      // Use token - should redirect to puma2:39101
      const vncRes = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);
      expect(vncRes.status).toBe(302);
      expect(vncRes.headers.location).toContain('puma2:39101');
      expect(vncRes.headers.location).toContain('vnc.html');
      expect(vncRes.headers.location).toContain('password=secret');
    });

    it('full flow: issue token without vncHost uses default host detection', async () => {
      vi.stubEnv('VNC_PASSWORD', 'secret');

      // Issue token without vncHost
      const issueRes = await request(app)
        .post('/api/web-vnc/token')
        .send();
      expect(issueRes.status).toBe(200);

      const token = issueRes.body.data.token;

      // Use token - should use default host detection (port 39001)
      const vncRes = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);
      expect(vncRes.status).toBe(302);
      expect(vncRes.headers.location).toContain(':39001');
      expect(vncRes.headers.location).toContain('vnc.html');
    });
  });
});

describe('Web VNC Token Integration with VncPasswordManager', () => {
  let app: express.Express;
  let tokenStore: TokenStore;
  let vncPasswordManager: VncPasswordManager;
  let tmpDir: string;
  let passwdFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnc-pw-integ-'));
    passwdFile = path.join(tmpDir, 'vnc-passwords');

    app = express();
    app.use(express.json());
    tokenStore = new TokenStore(60);
    vncPasswordManager = new VncPasswordManager({
      basePassword: 'fuba-browser',
      passwdFilePath: passwdFile,
    });
    vncPasswordManager.initializeFile();

    app.use('/api', webVncRoutes(tokenStore, vncPasswordManager));

    // Token-gated /web-vnc endpoint (mirrors server/index.ts logic)
    app.get('/web-vnc', (req, res) => {
      const vncPassword = process.env.VNC_PASSWORD;
      if (!vncPassword) {
        return res.status(503).json({ success: false, error: 'VNC password is not configured' });
      }
      const token = req.query.token as string | undefined;
      if (!token) {
        return res.status(401).json({ success: false, error: 'Token is required' });
      }
      const metadata = tokenStore.consumeToken(token);
      if (!metadata) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      const effectivePassword = metadata.vncPassword || vncPassword;
      const redirectUrl = buildWebVncRedirectUrl(req, 39001, effectivePassword, metadata.vncHost);
      return res.redirect(302, redirectUrl);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vncPasswordManager.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('issues token with per-token password and uses it in redirect', async () => {
    vi.stubEnv('VNC_PASSWORD', 'secret');

    // Issue token via API
    const issueRes = await request(app)
      .post('/api/web-vnc/token')
      .send();
    expect(issueRes.status).toBe(200);

    const token = issueRes.body.data.token;

    // Use token - redirect should use per-token password, not base password
    const vncRes = await request(app)
      .get(`/web-vnc?token=${token}`)
      .redirects(0);
    expect(vncRes.status).toBe(302);
    expect(vncRes.headers.location).toContain('vnc.html');
    // Should NOT contain the base VNC_PASSWORD
    expect(vncRes.headers.location).not.toContain('password=secret');
    // Should contain an 8-char password
    const match = vncRes.headers.location.match(/password=([^&]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(8);
  });

  it('per-token passwords are unique across token issuances', async () => {
    vi.stubEnv('VNC_PASSWORD', 'secret');

    const passwords: string[] = [];
    for (let i = 0; i < 5; i++) {
      const issueRes = await request(app)
        .post('/api/web-vnc/token')
        .send();
      const token = issueRes.body.data.token;
      const vncRes = await request(app)
        .get(`/web-vnc?token=${token}`)
        .redirects(0);
      const match = vncRes.headers.location.match(/password=([^&]+)/);
      passwords.push(match![1]);
    }

    const uniquePasswords = new Set(passwords);
    expect(uniquePasswords.size).toBe(5);
  });

  it('per-token password is added to the password file', async () => {
    vi.stubEnv('VNC_PASSWORD', 'secret');

    const issueRes = await request(app)
      .post('/api/web-vnc/token')
      .send();
    const token = issueRes.body.data.token;
    const vncRes = await request(app)
      .get(`/web-vnc?token=${token}`)
      .redirects(0);

    const match = vncRes.headers.location.match(/password=([^&]+)/);
    const perTokenPassword = match![1];

    // Verify the password file contains both base and per-token passwords
    const content = fs.readFileSync(passwdFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines[0]).toBe('fuba-browser');
    expect(lines).toContain(perTokenPassword);
  });

  it('works with vncHost and per-token password', async () => {
    vi.stubEnv('VNC_PASSWORD', 'secret');

    const issueRes = await request(app)
      .post('/api/web-vnc/token')
      .send({ vncHost: 'puma2:39101' });
    expect(issueRes.status).toBe(200);

    const token = issueRes.body.data.token;
    const vncRes = await request(app)
      .get(`/web-vnc?token=${token}`)
      .redirects(0);
    expect(vncRes.status).toBe(302);
    expect(vncRes.headers.location).toContain('puma2:39101');
    expect(vncRes.headers.location).not.toContain('password=secret');

    const match = vncRes.headers.location.match(/password=([^&]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(8);
  });
});
