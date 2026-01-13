import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface EvalRequest {
  script: string;
}

interface HighlightRequest {
  selector: string;
}

// Store console messages and errors
let consoleMessages: Array<{ type: string; message: string; timestamp: string }> = [];
let pageErrors: Array<{ message: string; timestamp: string }> = [];

export function debugRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Get console messages
  router.get('/console', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      res.json({ success: true, data: consoleMessages });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear console messages
  router.delete('/console', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      consoleMessages = [];
      res.json({ success: true, data: { message: 'Console cleared' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get page errors
  router.get('/errors', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      res.json({ success: true, data: pageErrors });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear page errors
  router.delete('/errors', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      pageErrors = [];
      res.json({ success: true, data: { message: 'Errors cleared' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Evaluate JavaScript
  router.post('/eval', async (req: Request<{}, {}, EvalRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { script } = req.body;
      if (!script) {
        return res.status(400).json({ success: false, error: 'Script is required' });
      }

      const result = await browserController.evaluate(script);
      return res.json({ success: true, data: { result } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Highlight element
  router.post('/highlight', async (req: Request<{}, {}, HighlightRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { selector } = req.body;
      if (!selector) {
        return res.status(400).json({ success: false, error: 'Selector is required' });
      }

      await browserController.highlight(selector);
      return res.json({ success: true, data: { selector, duration: 3000 } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}

// Functions to add console messages and errors (called from main process)
export function addConsoleMessage(type: string, message: string): void {
  consoleMessages.push({
    type,
    message,
    timestamp: new Date().toISOString(),
  });
  // Keep only last 100 messages
  if (consoleMessages.length > 100) {
    consoleMessages = consoleMessages.slice(-100);
  }
}

export function addPageError(message: string): void {
  pageErrors.push({
    message,
    timestamp: new Date().toISOString(),
  });
  // Keep only last 100 errors
  if (pageErrors.length > 100) {
    pageErrors = pageErrors.slice(-100);
  }
}
