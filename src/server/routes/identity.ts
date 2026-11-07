import { Router } from 'express';
import { deriveBrowserIdentity, type BrowserIdentity } from '../../browser/identity.js';
export type SetIdentityFn = (userAgent: string | null) => Promise<void>;
export type GetIdentityFn = () => BrowserIdentity;

export function identityRoutes(setIdentity: SetIdentityFn, getIdentity: GetIdentityFn): Router {
  const router = Router();
  router.get('/identity', (_req, res) => res.json({success: true, data: getIdentity()}));
  router.post('/identity', async (req, res) => {
    const userAgent: unknown = req.body?.userAgent;
    try {
      if (userAgent !== null) {
        if (typeof userAgent !== 'string') throw new Error('userAgent must be a string or null');
        deriveBrowserIdentity(userAgent);
      }
    } catch (error) {
      return res.status(400).json({success: false, error: (error as Error).message});
    }
    try {
      await setIdentity(userAgent as string | null);
      return res.json({success: true, data: getIdentity(), message: 'Identity changed. Browser has been reset.'});
    } catch (error) {
      return res.status(500).json({success: false, error: (error as Error).message});
    }
  });
  return router;
}
