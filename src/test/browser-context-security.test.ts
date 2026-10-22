import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { createVerifiedBrowserContext } from '../browser/context-security.js';

describe('Browser TLS verification', () => {
  it('rejects an untrusted issuer even if a caller asks to ignore TLS errors', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'fuba-browser-tls-'));
    const key = path.join(directory, 'key.pem');
    const cert = path.join(directory, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' });
    const secure = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_req, res) => res.end('ok'));
    const plain = http.createServer((_req, res) => res.end('ok'));
    const browser = await chromium.launch({ headless: true });
    try {
      await Promise.all([secure, plain].map(server => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))));
      const context = await createVerifiedBrowserContext(browser, { ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const response = await page.goto(`http://127.0.0.1:${(plain.address() as AddressInfo).port}`);
      expect(response?.status()).toBe(200);
      await expect(page.goto(`https://127.0.0.1:${(secure.address() as AddressInfo).port}`)).rejects.toThrow(/ERR_CERT_AUTHORITY_INVALID/);
      await context.close();
    } finally {
      await browser.close();
      await Promise.all([secure, plain].map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
