import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserController } from '../browser/controller.js';
import type { DownloadRecord } from '../types/browser.js';
import { downloadRoutes } from '../server/routes/download.js';

describe('Download Routes', () => {
  let app: express.Express;
  let mockBrowserController: {
    getDownloads: ReturnType<typeof vi.fn>;
    getDownloadById: ReturnType<typeof vi.fn>;
    getDownloadBody: ReturnType<typeof vi.fn>;
    waitForDownload: ReturnType<typeof vi.fn>;
    clearDownloads: ReturnType<typeof vi.fn>;
  };

  const completedDownload: DownloadRecord = {
    id: 'dl-1',
    url: 'https://example.com/file.zip',
    suggestedFilename: 'file.zip',
    status: 'completed',
    startedAt: '2026-03-21T00:00:00.000Z',
    completedAt: '2026-03-21T00:00:05.000Z',
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockBrowserController = {
      getDownloads: vi.fn().mockReturnValue([completedDownload]),
      getDownloadById: vi.fn().mockImplementation((id: string) => {
        if (id === 'dl-1') return completedDownload;
        return undefined;
      }),
      getDownloadBody: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'dl-1') return Buffer.from('ZIPDATA');
        throw new Error(`Download not found: ${id}`);
      }),
      waitForDownload: vi.fn().mockResolvedValue(completedDownload),
      clearDownloads: vi.fn().mockReturnValue(1),
    };

    app.use('/api', downloadRoutes(mockBrowserController as unknown as BrowserController));
  });

  it('GET /api/download returns tracked downloads', async () => {
    const response = await request(app).get('/api/download');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.entries).toHaveLength(1);
    expect(response.body.data.entries[0].id).toBe('dl-1');
    expect(response.body.data.count).toBe(1);
    expect(mockBrowserController.getDownloads).toHaveBeenCalledTimes(1);
  });

  it('POST /api/download/wait returns completed download', async () => {
    const response = await request(app)
      .post('/api/download/wait')
      .send({ timeout: 5000 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('dl-1');
    expect(response.body.data.suggestedFilename).toBe('file.zip');
    expect(mockBrowserController.waitForDownload).toHaveBeenCalledWith({ timeout: 5000 });
  });

  it('POST /api/download/wait uses default timeout when not specified', async () => {
    const response = await request(app)
      .post('/api/download/wait')
      .send({});

    expect(response.status).toBe(200);
    expect(mockBrowserController.waitForDownload).toHaveBeenCalledWith({ timeout: undefined });
  });

  it('POST /api/download/wait returns 500 on timeout', async () => {
    mockBrowserController.waitForDownload.mockRejectedValue(new Error('Timeout waiting for download'));

    const response = await request(app)
      .post('/api/download/wait')
      .send({ timeout: 100 });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Timeout');
  });

  it('GET /api/download/:id returns download metadata', async () => {
    const response = await request(app).get('/api/download/dl-1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('dl-1');
    expect(response.body.data.suggestedFilename).toBe('file.zip');
  });

  it('GET /api/download/:id returns 404 for unknown id', async () => {
    const response = await request(app).get('/api/download/dl-999');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Download not found');
  });

  it('GET /api/download/:id?type=binary returns file content', async () => {
    const response = await request(app).get('/api/download/dl-1?type=binary');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/octet-stream');
    expect(response.headers['x-download-id']).toBe('dl-1');
    expect(response.headers['x-suggested-filename']).toBe(encodeURIComponent('file.zip'));
    expect(mockBrowserController.getDownloadBody).toHaveBeenCalledWith('dl-1');
  });

  it('DELETE /api/download clears download history', async () => {
    const response = await request(app).delete('/api/download');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cleared).toBe(1);
    expect(mockBrowserController.clearDownloads).toHaveBeenCalledTimes(1);
  });
});
