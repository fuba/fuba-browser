import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface WaitSelectorRequest {
  selector: string;
  timeout?: number;
  visible?: boolean;
}

interface WaitTextRequest {
  text: string;
  timeout?: number;
  selector?: string;
}

interface WaitUrlRequest {
  pattern: string;
  timeout?: number;
}

interface WaitLoadRequest {
  state?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

interface WaitTimeoutRequest {
  ms: number;
}

export function waitRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Wait for selector
  router.post('/wait/selector', async (req: Request<{}, {}, WaitSelectorRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector, timeout = 30000, visible = true } = req.body;

      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }

      const result = await browserController.waitForSelector(selector, { timeout, visible });

      return res.json({
        success: true,
        data: { selector, found: result }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Wait for text
  router.post('/wait/text', async (req: Request<{}, {}, WaitTextRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { text, timeout = 30000, selector } = req.body;

      if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
      }

      const result = await browserController.waitForText(text, { timeout, selector });

      return res.json({
        success: true,
        data: { text, found: result }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Wait for URL
  router.post('/wait/url', async (req: Request<{}, {}, WaitUrlRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { pattern, timeout = 30000 } = req.body;

      if (!pattern) {
        return res.status(400).json({ success: false, error: 'Pattern is required' });
      }

      const result = await browserController.waitForUrl(pattern, { timeout });

      return res.json({
        success: true,
        data: { pattern, url: result }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Wait for load state
  router.post('/wait/load', async (req: Request<{}, {}, WaitLoadRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { state = 'load', timeout = 30000 } = req.body;

      await browserController.waitForLoad(state, { timeout });

      return res.json({
        success: true,
        data: { state }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Wait for timeout (delay)
  router.post('/wait/timeout', async (req: Request<{}, {}, WaitTimeoutRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { ms } = req.body;

      if (!ms || ms < 0) {
        return res.status(400).json({ success: false, error: 'Valid ms value is required' });
      }

      await new Promise(resolve => setTimeout(resolve, Math.min(ms, 60000)));

      return res.json({
        success: true,
        data: { waited: ms }
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
