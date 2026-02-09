import { Router, Request, Response } from 'express';
import { TokenStore, TokenMetadata } from '../token-store.js';
import { VncPasswordManager } from '../vnc-password-manager.js';

export function webVncRoutes(tokenStore: TokenStore, vncPasswordManager: VncPasswordManager): Router {
  const router = Router();

  // POST /api/web-vnc/token - Issue a one-time token for noVNC access
  router.post('/web-vnc/token', (req: Request, res: Response) => {
    const vncHost = req.body?.vncHost as string | undefined;
    const metadata: TokenMetadata = {};
    if (vncHost) {
      metadata.vncHost = vncHost;
    }
    metadata.vncPassword = vncPasswordManager.createPassword();
    const { token, expiresAt } = tokenStore.createToken(metadata);
    return res.json({
      success: true,
      data: { token, expiresAt: expiresAt.toISOString() },
    });
  });

  return router;
}
