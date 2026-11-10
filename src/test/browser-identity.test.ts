import { describe, expect, it } from 'vitest';
import { deriveBrowserIdentity } from '../browser/identity.js';

const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

describe('UA-derived identity', () => {
  it('derives Windows identity and Chrome brands without leaking the host version', () => {
    const identity = deriveBrowserIdentity(windows);
    expect(identity.platform).toBe('Win32');
    expect(identity.metadata).toMatchObject({ platform: 'Windows', platformVersion: '10.0.0', architecture: 'x86', bitness: '64', mobile: false });
    expect(identity.metadata?.fullVersionList).toContainEqual({ brand: 'Google Chrome', version: '156.0.0.0' });
    expect(identity.userAgent).toBe(windows);
  });
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', 'MacIntel', 'macOS', false],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/ABC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', 'Linux armv8l', 'Android', true],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', 'Linux x86_64', 'Linux', false],
  ])('derives %s', (ua, platform, os, mobile) => {
    expect(deriveBrowserIdentity(ua as string)).toMatchObject({platform, isMobile: mobile, metadata: {platform: os}});
  });
  it('does not advertise Chromium hints for Safari or Firefox', () => {
    expect(deriveBrowserIdentity('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toMatchObject({platform:'iPhone',isMobile:true,vendor:'Apple Computer, Inc.'});
    expect(deriveBrowserIdentity('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0').metadata).toBeUndefined();
  });
  it.each(['', 'nonsense', 'Chrome/156.0.0.0\r\nInjected: yes', 'あ'])('rejects unsupported or unsafe input %s', ua => {
    expect(() => deriveBrowserIdentity(ua)).toThrow();
  });
});
