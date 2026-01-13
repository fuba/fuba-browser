import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse, BrowserState } from '../../types/browser.js';

interface LoadStateRequest {
  state: BrowserState;
  navigateToUrl?: boolean;
}

export function stateRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Save browser state (cookies, localStorage, sessionStorage)
  router.post('/state/save', async (_req: Request, res: Response<ApiResponse<BrowserState>>) => {
    try {
      const state = await browserController.saveState();

      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Load browser state
  router.post('/state/load', async (req: Request<{}, {}, LoadStateRequest>, res: Response<ApiResponse>): Promise<Response<ApiResponse>> => {
    try {
      const { state, navigateToUrl = false } = req.body;

      if (!state) {
        return res.status(400).json({ success: false, error: 'State is required' });
      }

      if (!state.version) {
        return res.status(400).json({ success: false, error: 'Invalid state format: missing version' });
      }

      await browserController.loadState(state, { navigateToUrl });

      return res.json({
        success: true,
        data: {
          message: 'State loaded successfully',
          cookiesCount: state.cookies.length,
          localStorageCount: Object.keys(state.localStorage).length,
          sessionStorageCount: Object.keys(state.sessionStorage).length,
          url: state.url,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get current state info (without full data)
  router.get('/state/info', async (_req: Request, res: Response<ApiResponse>) => {
    try {
      const state = await browserController.saveState();

      res.json({
        success: true,
        data: {
          url: state.url,
          cookiesCount: state.cookies.length,
          localStorageCount: Object.keys(state.localStorage).length,
          sessionStorageCount: Object.keys(state.sessionStorage).length,
          timestamp: state.timestamp,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
