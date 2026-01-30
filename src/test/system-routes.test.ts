import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { systemRoutes } from '../server/routes/system.js';

describe('System Routes', () => {
  let app: express.Express;
  let mockResetBrowser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    mockResetBrowser = vi.fn().mockResolvedValue(undefined);
    app.use('/api', systemRoutes(mockResetBrowser));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reset', () => {
    it('should call resetBrowser and return success', async () => {
      const response = await request(app)
        .post('/api/reset')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Browser has been reset'
      });
      expect(mockResetBrowser).toHaveBeenCalledTimes(1);
    });

    it('should return 500 if resetBrowser fails', async () => {
      mockResetBrowser.mockRejectedValue(new Error('Reset failed'));

      const response = await request(app)
        .post('/api/reset')
        .send();

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Reset failed'
      });
    });
  });
});
