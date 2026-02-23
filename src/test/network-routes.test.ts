import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserController } from '../browser/controller.js';
import { networkRoutes } from '../server/routes/network.js';

describe('Network Routes', () => {
  let app: express.Express;
  let mockBrowserController: {
    getNetworkRequests: ReturnType<typeof vi.fn>;
    clearNetworkRequests: ReturnType<typeof vi.fn>;
    getNetworkResponseBody: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

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
      getNetworkResponseBody: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'missing') {
          throw new Error(`Network request not found: ${id}`);
        }
        return {
          id: 'req-1',
          url: 'https://example.com/image.png',
          contentType: 'image/png',
          body: Buffer.from('PNGDATA'),
        };
      }),
    };

    app.use('/api', networkRoutes(mockBrowserController as unknown as BrowserController));
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

  it('GET /api/network/body/:id binary response does not include URL header', async () => {
    const response = await request(app).get('/api/network/body/req-1');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['x-network-request-id']).toBe('req-1');
    expect(response.headers['x-network-url']).toBeUndefined();
  });

  it('GET /api/network/body/:id returns 404 for missing network id', async () => {
    const response = await request(app).get('/api/network/body/missing');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Network request not found');
  });

});
