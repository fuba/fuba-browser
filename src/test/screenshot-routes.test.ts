import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { browserRoutes } from '../server/routes/browser.js';

describe('Screenshot Routes', () => {
  let app: express.Express;
  let mockScreenshot: ReturnType<typeof vi.fn>;
  let mockBrowserController: {
    screenshot: ReturnType<typeof vi.fn>;
    navigate: ReturnType<typeof vi.fn>;
    scroll: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
    type: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create a test PNG buffer (1x1 red pixel)
    const testPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    mockScreenshot = vi.fn().mockResolvedValue(testPngBuffer);
    mockBrowserController = {
      screenshot: mockScreenshot,
      navigate: vi.fn(),
      scroll: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
    };

    app.use('/api', browserRoutes(mockBrowserController as any));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/screenshot', () => {
    it('should return PNG binary by default', async () => {
      const response = await request(app)
        .get('/api/screenshot')
        .send();

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(mockScreenshot).toHaveBeenCalledWith(undefined);
    });

    it('should pass selector query parameter', async () => {
      const response = await request(app)
        .get('/api/screenshot?selector=%23element')
        .send();

      expect(response.status).toBe(200);
      expect(mockScreenshot).toHaveBeenCalledWith('#element');
    });

    it('should support short form selector parameter', async () => {
      const response = await request(app)
        .get('/api/screenshot?s=%23short')
        .send();

      expect(response.status).toBe(200);
      expect(mockScreenshot).toHaveBeenCalledWith('#short');
    });
  });

  describe('POST /api/screenshot', () => {
    it('should return PNG binary when type is binary', async () => {
      const response = await request(app)
        .post('/api/screenshot')
        .send({ type: 'binary' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(mockScreenshot).toHaveBeenCalledWith(undefined);
    });

    it('should return PNG binary when type is not specified', async () => {
      const response = await request(app)
        .post('/api/screenshot')
        .send({});

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
    });

    it('should return base64 data URL when type is base64', async () => {
      const response = await request(app)
        .post('/api/screenshot')
        .send({ type: 'base64' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.screenshot).toMatch(/^data:image\/png;base64,/);

      // Verify it's valid base64
      const base64Data = response.body.screenshot.replace('data:image/png;base64,', '');
      expect(() => Buffer.from(base64Data, 'base64')).not.toThrow();
    });

    it('should pass selector in POST body', async () => {
      const response = await request(app)
        .post('/api/screenshot')
        .send({ selector: '#my-element', type: 'base64' });

      expect(response.status).toBe(200);
      expect(mockScreenshot).toHaveBeenCalledWith('#my-element');
    });

    it('should return base64 with selector', async () => {
      const response = await request(app)
        .post('/api/screenshot')
        .send({ selector: '.card', type: 'base64' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.screenshot).toMatch(/^data:image\/png;base64,/);
      expect(mockScreenshot).toHaveBeenCalledWith('.card');
    });

    it('should return 500 on screenshot error', async () => {
      mockScreenshot.mockRejectedValue(new Error('Element not found'));

      const response = await request(app)
        .post('/api/screenshot')
        .send({ selector: '#nonexistent', type: 'base64' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Element not found');
    });
  });
});
