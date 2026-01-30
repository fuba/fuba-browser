import { Router, Request, Response } from 'express';

export type ResetBrowserFn = () => Promise<void>;

export function systemRoutes(resetBrowser: ResetBrowserFn): Router {
  const router = Router();

  // POST /api/reset - Restart the browser process
  router.post('/reset', async (_req: Request, res: Response) => {
    try {
      console.error('[System] Browser reset requested');
      await resetBrowser();
      res.json({
        success: true,
        message: 'Browser has been reset'
      });
    } catch (error) {
      console.error('[System] Browser reset failed:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  });

  return router;
}
