import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

export function downloadRoutes(browserController: BrowserController): Router {
  const router = Router();

  // List all tracked downloads
  router.get('/download', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const entries = browserController.getDownloads();
      res.json({ success: true, data: { entries, count: entries.length } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Wait for the next download to complete (long-polling)
  // Must be called BEFORE the action that triggers the download
  router.post('/download/wait', async (req: Request, res: Response<ApiResponse>) => {
    try {
      const { timeout } = req.body as { timeout?: number };
      const record = await browserController.waitForDownload({ timeout });
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Get download metadata by ID
  router.get('/download/:id', (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      const type = req.query.type as string | undefined;

      const record = browserController.getDownloadById(id);
      if (!record) {
        res.status(404).json({ success: false, error: `Download not found: ${id}` });
        return;
      }

      // If type is not 'binary', return metadata
      if (type !== 'binary') {
        res.json({ success: true, data: record });
        return;
      }

      // Return binary file content
      browserController.getDownloadBody(id).then((body) => {
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(record.suggestedFilename)}"`);
        res.set('X-Download-Id', id);
        res.set('X-Suggested-Filename', encodeURIComponent(record.suggestedFilename));
        res.send(body);
      }).catch((error) => {
        res.status(500).json({ success: false, error: (error as Error).message });
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Clear download history
  router.delete('/download', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const cleared = browserController.clearDownloads();
      res.json({ success: true, data: { cleared } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
