import { describe, expect, it, vi } from 'vitest';
import { devices } from 'playwright';
import express from 'express';
import request from 'supertest';
import { deriveBrowserIdentity } from '../browser/identity.js';
import { listDeviceProfiles, resolveDeviceProfile } from '../config/device-profiles.js';
import { deviceRoutes } from '../server/routes/device.js';

describe('built-in profile identity compatibility', () => {
  it.each(Object.entries(devices))('supports advertised profile %s without changing its UA or mobile capabilities', (name, device) => {
    expect(listDeviceProfiles()).toContain(name);
    const options = resolveDeviceProfile(name)!;
    const identity = deriveBrowserIdentity(options.userAgent);
    expect(identity.userAgent).toBe(device.userAgent);
    expect(identity.isMobile).toBe(device.isMobile);
    expect(identity.hasTouch).toBe(device.hasTouch);
    if (/BB10|PlayBook|MeeGo|Silk\/|Windows Phone/.test(device.userAgent)) {
      expect(identity.metadata).toBeUndefined();
      expect(identity.vendor).toBe('');
    }
  });
  it('rejects a future unsupported profile before invoking the destructive reset callback', async () => {
    const name = 'Unsupported identity regression fixture';
    devices[name] = {...devices['iPhone 15'],userAgent:'Mozilla/5.0 (UnknownOS) UnknownBrowser/1.0'};
    try {
      const reset = vi.fn(async () => {});
      const app = express();app.use(express.json());
      app.use('/api',deviceRoutes(reset, () => null, () => deriveBrowserIdentity(devices['Desktop Chrome'].userAgent)));
      expect((await request(app).post('/api/device').send({profile:name})).status).toBe(400);
      expect(reset).not.toHaveBeenCalled();
      expect(listDeviceProfiles()).not.toContain(name);
    } finally {delete devices[name];}
  });
});
