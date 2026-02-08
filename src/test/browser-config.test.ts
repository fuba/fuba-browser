import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBrowserConfig } from '../config/browser-config.js';

describe('getBrowserConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('headless mode', () => {
    it('should default to headless=true', () => {
      delete process.env.HEADLESS;
      const config = getBrowserConfig();
      expect(config.headless).toBe(true);
    });

    it('should be headed when HEADLESS=false', () => {
      process.env.HEADLESS = 'false';
      const config = getBrowserConfig();
      expect(config.headless).toBe(false);
    });

    it('should be headless when HEADLESS=true', () => {
      process.env.HEADLESS = 'true';
      const config = getBrowserConfig();
      expect(config.headless).toBe(true);
    });
  });

  describe('device scale factor', () => {
    it('should default to 2', () => {
      delete process.env.DEVICE_SCALE_FACTOR;
      const config = getBrowserConfig();
      expect(config.deviceScaleFactor).toBe(2);
    });

    it('should use DEVICE_SCALE_FACTOR when set', () => {
      process.env.DEVICE_SCALE_FACTOR = '3';
      const config = getBrowserConfig();
      expect(config.deviceScaleFactor).toBe(3);
    });

    it('should default to 2 for invalid values', () => {
      process.env.DEVICE_SCALE_FACTOR = 'invalid';
      const config = getBrowserConfig();
      expect(config.deviceScaleFactor).toBe(2);
    });
  });

  describe('locale', () => {
    it('should default to ja-JP', () => {
      delete process.env.LOCALE;
      const config = getBrowserConfig();
      expect(config.locale).toBe('ja-JP');
    });

    it('should use LOCALE when set', () => {
      process.env.LOCALE = 'en-US';
      const config = getBrowserConfig();
      expect(config.locale).toBe('en-US');
    });

    it('should support various locale formats', () => {
      process.env.LOCALE = 'ko-KR';
      const config = getBrowserConfig();
      expect(config.locale).toBe('ko-KR');
    });
  });

  describe('timezone', () => {
    it('should default to Asia/Tokyo', () => {
      delete process.env.TIMEZONE_ID;
      const config = getBrowserConfig();
      expect(config.timezoneId).toBe('Asia/Tokyo');
    });

    it('should use TIMEZONE_ID when set', () => {
      process.env.TIMEZONE_ID = 'America/New_York';
      const config = getBrowserConfig();
      expect(config.timezoneId).toBe('America/New_York');
    });

    it('should support various timezone formats', () => {
      process.env.TIMEZONE_ID = 'Europe/London';
      const config = getBrowserConfig();
      expect(config.timezoneId).toBe('Europe/London');
    });
  });

  describe('viewport width', () => {
    it('should default to 1200', () => {
      delete process.env.VIEWPORT_WIDTH;
      const config = getBrowserConfig();
      expect(config.viewportWidth).toBe(1200);
    });

    it('should use VIEWPORT_WIDTH when set', () => {
      process.env.VIEWPORT_WIDTH = '1920';
      const config = getBrowserConfig();
      expect(config.viewportWidth).toBe(1920);
    });

    it('should default to 1200 for invalid values', () => {
      process.env.VIEWPORT_WIDTH = 'invalid';
      const config = getBrowserConfig();
      expect(config.viewportWidth).toBe(1200);
    });
  });

  describe('viewport height', () => {
    it('should default to 900', () => {
      delete process.env.VIEWPORT_HEIGHT;
      const config = getBrowserConfig();
      expect(config.viewportHeight).toBe(900);
    });

    it('should use VIEWPORT_HEIGHT when set', () => {
      process.env.VIEWPORT_HEIGHT = '1080';
      const config = getBrowserConfig();
      expect(config.viewportHeight).toBe(1080);
    });

    it('should default to 900 for invalid values', () => {
      process.env.VIEWPORT_HEIGHT = 'invalid';
      const config = getBrowserConfig();
      expect(config.viewportHeight).toBe(900);
    });
  });

  describe('combined configuration', () => {
    it('should return all settings correctly when all env vars are set', () => {
      process.env.HEADLESS = 'false';
      process.env.DEVICE_SCALE_FACTOR = '1';
      process.env.LOCALE = 'fr-FR';
      process.env.TIMEZONE_ID = 'Europe/Paris';
      process.env.VIEWPORT_WIDTH = '1920';
      process.env.VIEWPORT_HEIGHT = '1080';

      const config = getBrowserConfig();

      expect(config).toEqual({
        headless: false,
        deviceScaleFactor: 1,
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewportWidth: 1920,
        viewportHeight: 1080,
      });
    });
  });
});
