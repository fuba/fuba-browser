import { Router, Request, Response } from 'express';
import { resolveDeviceProfile, listDeviceProfiles } from '../../config/device-profiles.js';
import { getBrowserConfig } from '../../config/browser-config.js';
import type { GetIdentityFn } from './identity.js';

export type SetDeviceProfileFn = (profileName: string | null) => Promise<void>;
export type GetDeviceProfileFn = () => string | null;

// Build the current device info response
function buildDeviceInfo(profileName: string | null, getIdentity: GetIdentityFn): {
  profile: string;
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
} {
  const deviceOptions = resolveDeviceProfile(profileName);
  const identity = getIdentity();

  if (deviceOptions) {
    return {
      profile: profileName!,
      ...deviceOptions,
      userAgent: identity.userAgent,
      isMobile: identity.isMobile,
      hasTouch: identity.hasTouch,
    };
  }

  // Desktop defaults
  const config = getBrowserConfig();
  return {
    profile: 'desktop',
    viewport: { width: config.viewportWidth, height: config.viewportHeight },
    userAgent: identity.userAgent,
    deviceScaleFactor: config.deviceScaleFactor,
    isMobile: identity.isMobile,
    hasTouch: identity.hasTouch,
  };
}

export function deviceRoutes(
  setDeviceProfile: SetDeviceProfileFn,
  getDeviceProfile: GetDeviceProfileFn,
  getIdentity: GetIdentityFn,
): Router {
  const router = Router();
  const currentInfo = () => buildDeviceInfo(getDeviceProfile(), getIdentity);

  // GET /api/device - Get current device profile info
  router.get('/device', (_req: Request, res: Response) => {
    try {
      const info = currentInfo();
      res.json({ success: true, data: info });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // GET /api/device/profiles - List available device profiles
  router.get('/device/profiles', (_req: Request, res: Response) => {
    const profiles = listDeviceProfiles();
    res.json({ success: true, data: { profiles } });
  });

  // POST /api/device - Set device profile (triggers browser reset)
  router.post('/device', async (req: Request, res: Response) => {
    const { profile } = req.body;

    if (profile === undefined) {
      res.status(400).json({
        success: false,
        error: 'Missing "profile" in request body. Use a device name (e.g. "iPhone 15") or "desktop".',
      });
      return;
    }

    // Normalize: null and "desktop" both mean desktop mode
    const profileName = (profile === null || profile === 'desktop') ? null : String(profile);

    // Validate the profile name first (400 for unknown profiles)
    try {
      resolveDeviceProfile(profileName);
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message });
      return;
    }

    // Apply profile and reset browser (500 for runtime failures)
    try {
      await setDeviceProfile(profileName);

      const info = currentInfo();
      res.json({
        success: true,
        data: info,
        message: `Device profile changed to "${info.profile}". Browser has been reset.`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
