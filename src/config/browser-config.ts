// Browser configuration from environment variables

export interface BrowserConfig {
  headless: boolean;
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  viewportWidth: number;
  viewportHeight: number;
}

export function getBrowserConfig(): BrowserConfig {
  const headless = process.env.HEADLESS !== 'false';
  const deviceScaleFactor = Number(process.env.DEVICE_SCALE_FACTOR) || 2;
  const locale = process.env.LOCALE || 'ja-JP';
  const timezoneId = process.env.TIMEZONE_ID || 'Asia/Tokyo';
  const viewportWidth = Number(process.env.VIEWPORT_WIDTH) || 1200;
  const viewportHeight = Number(process.env.VIEWPORT_HEIGHT) || 2000;
  return { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight };
}
