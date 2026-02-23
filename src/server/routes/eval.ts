import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

interface EvalRequest {
  script: string;
}

export function evalRoutes(browserController: BrowserController): Router {
  const router = Router();

  // Execute arbitrary JavaScript in the current page context.
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

  return router;
}
