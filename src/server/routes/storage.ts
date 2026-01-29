import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface KeyParams {
  key: string;
}

interface StorageSetRequest {
  key: string;
  value: string;
}

export function storageRoutes(browserController: BrowserController): Router {
  const router = Router();

  // ===== localStorage =====

  // Get all localStorage items
  router.get('/storage/local', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const items = await browserController.getLocalStorage();
      res.json({ success: true, data: items });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get localStorage item by key
  router.get('/storage/local/:key', async (req: Request<KeyParams>, res: Response<ApiResponse>) => {
    try {
      const key = decodeURIComponent(req.params.key);
      const value = await browserController.getLocalStorageItem(key);
      res.json({ success: true, data: { key, value } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Set localStorage item
  router.post('/storage/local', async (req: Request<{}, {}, StorageSetRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { key, value } = req.body;
      if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
      }

      await browserController.setLocalStorageItem(key, value || '');
      return res.json({ success: true, data: { key, value } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Delete localStorage item
  router.delete('/storage/local/:key', async (req: Request<KeyParams>, res: Response<ApiResponse>) => {
    try {
      const key = decodeURIComponent(req.params.key);
      await browserController.removeLocalStorageItem(key);
      res.json({ success: true, data: { message: `Removed ${key}` } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear all localStorage
  router.delete('/storage/local', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      await browserController.clearLocalStorage();
      res.json({ success: true, data: { message: 'localStorage cleared' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ===== sessionStorage =====

  // Get all sessionStorage items
  router.get('/storage/session', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const items = await browserController.getSessionStorage();
      res.json({ success: true, data: items });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get sessionStorage item by key
  router.get('/storage/session/:key', async (req: Request<KeyParams>, res: Response<ApiResponse>) => {
    try {
      const key = decodeURIComponent(req.params.key);
      const value = await browserController.getSessionStorageItem(key);
      res.json({ success: true, data: { key, value } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Set sessionStorage item
  router.post('/storage/session', async (req: Request<{}, {}, StorageSetRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { key, value } = req.body;
      if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
      }

      await browserController.setSessionStorageItem(key, value || '');
      return res.json({ success: true, data: { key, value } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Delete sessionStorage item
  router.delete('/storage/session/:key', async (req: Request<KeyParams>, res: Response<ApiResponse>) => {
    try {
      const key = decodeURIComponent(req.params.key);
      await browserController.removeSessionStorageItem(key);
      res.json({ success: true, data: { message: `Removed ${key}` } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear all sessionStorage
  router.delete('/storage/session', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      await browserController.clearSessionStorage();
      res.json({ success: true, data: { message: 'sessionStorage cleared' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
