import { Router, Request, Response } from 'express';
import { BrowserController } from '../../browser/controller.js';
import { ApiResponse } from '../../types/browser.js';

class NetworkResourceNotFoundError extends Error {}

function normalizeNetworkLookupError(error: unknown): NetworkResourceNotFoundError | null {
  const message = (error as Error | undefined)?.message;
  if (!message) {
    return null;
  }

  if (
    message.startsWith('Network request not found:') ||
    message.startsWith('Response body not available for request:')
  ) {
    return new NetworkResourceNotFoundError(message);
  }

  return null;
}

export function networkRoutes(browserController: BrowserController): Router {
  const router = Router();

  router.get('/network', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const entries = browserController.getNetworkRequests();
      res.json({ success: true, data: { entries, count: entries.length } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.delete('/network', (_req: Request, res: Response<ApiResponse>) => {
    try {
      const cleared = browserController.clearNetworkRequests();
      res.json({ success: true, data: { cleared } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  router.get('/network/body/:id', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const bodyResult = await browserController.getNetworkResponseBody(req.params.id);
      const responseType = req.query.type === 'base64' ? 'base64' : 'binary';
      const contentType = bodyResult.contentType || 'application/octet-stream';

      if (responseType === 'base64') {
        const base64 = bodyResult.body.toString('base64');
        res.json({
          success: true,
          data: {
            id: bodyResult.id,
            url: bodyResult.url,
            contentType,
            size: bodyResult.body.length,
            base64,
            dataUrl: `data:${contentType};base64,${base64}`,
          },
        });
        return;
      }

      res.set('Content-Type', contentType);
      res.set('X-Network-Request-Id', bodyResult.id);
      res.send(bodyResult.body);
    } catch (error) {
      const notFoundError = normalizeNetworkLookupError(error);
      if (notFoundError) {
        res.status(404).json({ success: false, error: notFoundError.message });
        return;
      }
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
