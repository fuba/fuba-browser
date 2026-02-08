import { Router, Request, Response } from 'express';
import { TokenStore } from '../token-store.js';

export function webVncRoutes(tokenStore: TokenStore): Router {
  const router = Router();

  // POST /api/web-vnc/token - Issue a one-time token for noVNC access
  router.post('/web-vnc/token', (req: Request, res: Response) => {
    const vncPassword = process.env.VNC_PASSWORD;
    if (!vncPassword) {
      return res.status(503).json({
        success: false,
        error: 'VNC password is not configured',
      });
    }

    const vncHost = req.body?.vncHost as string | undefined;
    const { token, expiresAt } = tokenStore.createToken(vncHost ? { vncHost } : undefined);
    return res.json({
      success: true,
      data: { token, expiresAt: expiresAt.toISOString() },
    });
  });

  return router;
}
