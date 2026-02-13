import { Router, Request, Response } from 'express';
import { resolveDeviceProfile, listDeviceProfiles } from '../../config/device-profiles.js';
import { getBrowserConfig } from '../../config/browser-config.js';

export type SetDeviceProfileFn = (profileName: string | null) => Promise<void>;
export type GetDeviceProfileFn = () => string | null;

// Build the current device info response
function buildDeviceInfo(profileName: string | null): {
  profile: string;
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
} {
  const deviceOptions = resolveDeviceProfile(profileName);

  if (deviceOptions) {
    return {
      profile: profileName!,
      ...deviceOptions,
    };
  }

  // Desktop defaults
  const config = getBrowserConfig();
  return {
    profile: 'desktop',
    viewport: { width: config.viewportWidth, height: config.viewportHeight },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    deviceScaleFactor: config.deviceScaleFactor,
    isMobile: false,
    hasTouch: false,
  };
}

export function deviceRoutes(
  setDeviceProfile: SetDeviceProfileFn,
  getDeviceProfile: GetDeviceProfileFn,
): Router {
  const router = Router();

  // GET /api/device - Get current device profile info
  router.get('/device', (_req: Request, res: Response) => {
    try {
      const info = buildDeviceInfo(getDeviceProfile());
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

      const info = buildDeviceInfo(profileName);
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
