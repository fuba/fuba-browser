import { describe, it, expect } from 'vitest';
import { resolveDeviceProfile, listDeviceProfiles } from '../config/device-profiles.js';

describe('resolveDeviceProfile', () => {
  it('should return null for null (desktop default)', () => {
    expect(resolveDeviceProfile(null)).toBeNull();
  });

  it('should return null for "desktop"', () => {
    expect(resolveDeviceProfile('desktop')).toBeNull();
  });

  it('should return device options for "iPhone 15"', () => {
    const result = resolveDeviceProfile('iPhone 15');
    expect(result).not.toBeNull();
    expect(result!.viewport.width).toBe(393);
    expect(result!.viewport.height).toBeGreaterThan(0);
    expect(result!.isMobile).toBe(true);
    expect(result!.hasTouch).toBe(true);
    expect(result!.deviceScaleFactor).toBe(3);
    expect(result!.userAgent).toContain('iPhone');
  });

  it('should return device options for "Pixel 7"', () => {
    const result = resolveDeviceProfile('Pixel 7');
    expect(result).not.toBeNull();
    expect(result!.isMobile).toBe(true);
    expect(result!.hasTouch).toBe(true);
    expect(result!.viewport.width).toBeGreaterThan(0);
    expect(result!.viewport.height).toBeGreaterThan(0);
  });

  it('should return device options for landscape variants', () => {
    const result = resolveDeviceProfile('iPhone 15 landscape');
    expect(result).not.toBeNull();
    // Landscape: width > height
    expect(result!.viewport.width).toBeGreaterThan(result!.viewport.height);
  });

  it('should return device options for tablet', () => {
    const result = resolveDeviceProfile('iPad Pro 11');
    expect(result).not.toBeNull();
    expect(result!.isMobile).toBe(true);
    expect(result!.hasTouch).toBe(true);
  });

  it('should throw for unknown device name', () => {
    expect(() => resolveDeviceProfile('Unknown Device XYZ')).toThrow('Unknown device profile: "Unknown Device XYZ"');
  });

  it('should reject inherited Object.prototype keys', () => {
    expect(() => resolveDeviceProfile('__proto__')).toThrow('Unknown device profile');
    expect(() => resolveDeviceProfile('constructor')).toThrow('Unknown device profile');
    expect(() => resolveDeviceProfile('toString')).toThrow('Unknown device profile');
  });

  it('should not include defaultBrowserType in result', () => {
    const result = resolveDeviceProfile('iPhone 15');
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('defaultBrowserType');
  });
});

describe('listDeviceProfiles', () => {
  it('should return an array with "desktop" as first entry', () => {
    const profiles = listDeviceProfiles();
    expect(profiles[0]).toBe('desktop');
  });

  it('should include well-known device names', () => {
    const profiles = listDeviceProfiles();
    expect(profiles).toContain('iPhone 15');
    expect(profiles).toContain('Pixel 7');
    expect(profiles).toContain('iPad Pro 11');
  });

  it('should have many profiles', () => {
    const profiles = listDeviceProfiles();
    // Playwright has 168+ devices, plus "desktop"
    expect(profiles.length).toBeGreaterThan(100);
  });
});
