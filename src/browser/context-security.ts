import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';

export function createVerifiedBrowserContext(browser: Browser, options: BrowserContextOptions): Promise<BrowserContext> {
  return browser.newContext({ ...options, ignoreHTTPSErrors: false });
}
