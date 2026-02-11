// Browser configuration from environment variables

export interface ProxyConfig {
  server: string;    // e.g. "http://localhost:13128"
  bypass?: string;   // e.g. "localhost,127.0.0.1"
}

export interface BrowserConfig {
  headless: boolean;
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  viewportWidth: number;
  viewportHeight: number;
  proxy?: ProxyConfig;
}

export function getBrowserConfig(): BrowserConfig {
  const headless = process.env.HEADLESS !== 'false';
  const deviceScaleFactor = Number(process.env.DEVICE_SCALE_FACTOR) || 2;
  const locale = process.env.LOCALE || 'ja-JP';
  const timezoneId = process.env.TIMEZONE_ID || 'Asia/Tokyo';
  const viewportWidth = Number(process.env.VIEWPORT_WIDTH) || 1200;
  const viewportHeight = Number(process.env.VIEWPORT_HEIGHT) || 2000;

  const proxyServer = process.env.PROXY_SERVER;
  const proxy: ProxyConfig | undefined = proxyServer
    ? { server: proxyServer, bypass: process.env.PROXY_BYPASS || '' }
    : undefined;

  return { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight, proxy };
}
