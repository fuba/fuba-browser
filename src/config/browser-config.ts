// Browser configuration from environment variables

export interface BrowserConfig {
  headless: boolean;
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
}

export function getBrowserConfig(): BrowserConfig {
  const headless = process.env.HEADLESS !== 'false';
  const deviceScaleFactor = Number(process.env.DEVICE_SCALE_FACTOR) || 2;
  const locale = process.env.LOCALE || 'ja-JP';
  const timezoneId = process.env.TIMEZONE_ID || 'Asia/Tokyo';
  return { headless, deviceScaleFactor, locale, timezoneId };
}
