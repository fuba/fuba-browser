import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserController } from '../browser/controller.js';
import { networkRoutes } from '../server/routes/network.js';

describe('Network Routes', () => {
  let app: express.Express;
  let tempDir: string;
  let mockBrowserController: {
    getNetworkRequests: ReturnType<typeof vi.fn>;
    clearNetworkRequests: ReturnType<typeof vi.fn>;
    getNetworkResponseBody: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuba-network-route-test-'));

    mockBrowserController = {
      getNetworkRequests: vi.fn().mockReturnValue([
        {
          id: 'req-1',
          url: 'data:image/png;base64,AAAA',
          method: 'GET',
          status: 200,
          resourceType: 'image',
          timestamp: '2026-02-22T00:00:00.000Z',
        },
      ]),
      clearNetworkRequests: vi.fn().mockReturnValue(1),
      getNetworkResponseBody: vi.fn().mockResolvedValue({
        id: 'req-1',
        url: 'https://example.com/image.png',
        contentType: 'image/png',
        body: Buffer.from('PNGDATA'),
      }),
    };

    app.use('/api', networkRoutes(mockBrowserController as unknown as BrowserController));
  });

  afterEach(() => {
    vi.clearAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('GET /api/network returns captured requests', async () => {
    const response = await request(app).get('/api/network');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.entries).toHaveLength(1);
    expect(response.body.data.entries[0].id).toBe('req-1');
    expect(mockBrowserController.getNetworkRequests).toHaveBeenCalledTimes(1);
  });

  it('DELETE /api/network clears captured requests', async () => {
    const response = await request(app).delete('/api/network');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cleared).toBe(1);
    expect(mockBrowserController.clearNetworkRequests).toHaveBeenCalledTimes(1);
  });

  it('GET /api/network/body/:id returns base64 JSON when requested', async () => {
    const response = await request(app).get('/api/network/body/req-1?type=base64');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('req-1');
    expect(response.body.data.contentType).toBe('image/png');
    expect(response.body.data.base64).toBe(Buffer.from('PNGDATA').toString('base64'));
    expect(response.body.data.dataUrl).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
    expect(mockBrowserController.getNetworkResponseBody).toHaveBeenCalledWith('req-1');
  });

  it('POST /api/network/save saves captured body to file', async () => {
    const outPath = path.join(tempDir, 'saved-image.png');

    const response = await request(app)
      .post('/api/network/save')
      .send({ id: 'req-1', path: outPath });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.path).toBe(outPath);
    expect(response.body.data.bytes).toBe(7);
    expect(fs.readFileSync(outPath)).toEqual(Buffer.from('PNGDATA'));
  });

  it('POST /api/network/save saves data URL directly without captured request', async () => {
    const outPath = path.join(tempDir, 'from-data-url.png');
    const dataUrl = `data:image/png;base64,${Buffer.from('direct').toString('base64')}`;

    const response = await request(app)
      .post('/api/network/save')
      .send({ dataUrl, path: outPath });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.path).toBe(outPath);
    expect(response.body.data.contentType).toBe('image/png');
    expect(fs.readFileSync(outPath)).toEqual(Buffer.from('direct'));
    expect(mockBrowserController.getNetworkResponseBody).not.toHaveBeenCalled();
  });

  it('POST /api/network/save rejects unsafe output paths', async () => {
    const response = await request(app)
      .post('/api/network/save')
      .send({
        dataUrl: `data:text/plain;base64,${Buffer.from('blocked').toString('base64')}`,
        path: '/etc/fuba-should-not-write.txt',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Output path must be inside');
  });

  it('POST /api/network/save rejects unsafe output paths even if cwd is root', async () => {
    const originalCwd = process.cwd();
    process.chdir('/');

    try {
      const response = await request(app)
        .post('/api/network/save')
        .send({
          dataUrl: `data:text/plain;base64,${Buffer.from('blocked').toString('base64')}`,
          path: '/etc/fuba-should-not-write-2.txt',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Output path must be inside');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('POST /api/network/save returns 400 for malformed data URLs', async () => {
    const outPath = path.join(tempDir, 'invalid-data-url.bin');

    const response = await request(app)
      .post('/api/network/save')
      .send({ dataUrl: 'data:text/plain;base64', path: outPath });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Invalid data URL');
  });
});
