// Device profile resolution using Playwright's built-in device descriptors

import { devices } from 'playwright';

export interface DeviceProfileOptions {
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

/**
 * Resolve a device profile name to context options.
 * Returns null for "desktop" or null (use default desktop settings).
 * Throws for unknown device names.
 */
export function resolveDeviceProfile(name: string | null): DeviceProfileOptions | null {
  if (name === null || name === 'desktop') {
    return null;
  }

  if (!Object.hasOwn(devices, name)) {
    throw new Error(`Unknown device profile: "${name}". Use GET /api/device/profiles to list available profiles.`);
  }

  const device = devices[name];
  return {
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
}

/**
 * List all available device profile names.
 * Includes "desktop" as the first entry, followed by all Playwright built-in device names.
 */
export function listDeviceProfiles(): string[] {
  return ['desktop', ...Object.keys(devices)];
}
