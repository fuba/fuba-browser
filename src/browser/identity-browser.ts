import { chromium, type LaunchOptions, type BrowserContext } from 'playwright';
import { connectIdentityBridge, reserveDebugPort } from './identity-bridge.js';
import type { BrowserIdentity } from './identity.js';
import { applyIdentity } from './identity-script.js';

/** Context init scripts run before inline scripts, including the first popup document. */
export async function configureIdentityContext(context: BrowserContext, identity: BrowserIdentity): Promise<void> {
  await context.addInitScript(applyIdentity, identity);
  await context.route('**/*', async route => {
    const headers: Record<string,string> = {...await route.request().allHeaders(), 'user-agent':identity.userAgent};
    const metadata = identity.metadata;
    const brands = (values: {brand:string;version:string}[]) => values.map(value => `${JSON.stringify(value.brand)};v=${JSON.stringify(value.version)}`).join(', ');
    const hints: Record<string,string> = metadata ? {
      'sec-ch-ua': brands(metadata.brands),
      'sec-ch-ua-full-version-list': brands(metadata.fullVersionList),
      'sec-ch-ua-full-version': JSON.stringify(metadata.fullVersion),
      'sec-ch-ua-platform': JSON.stringify(metadata.platform),
      'sec-ch-ua-platform-version': JSON.stringify(metadata.platformVersion),
      'sec-ch-ua-mobile': metadata.mobile ? '?1' : '?0',
      'sec-ch-ua-arch': JSON.stringify(metadata.architecture),
      'sec-ch-ua-bitness': JSON.stringify(metadata.bitness),
      'sec-ch-ua-model': JSON.stringify(metadata.model),
      'sec-ch-ua-wow64': metadata.wow64 ? '?1' : '?0',
      'sec-ch-ua-form-factors': JSON.stringify(identity.isMobile ? metadata.mobile ? 'Mobile' : 'Tablet' : 'Desktop'),
    } : {};
    // Replace only hints Chromium actually sends: preserve secure-context and
    // Accept-CH negotiation instead of adding high-entropy headers everywhere.
    for (const key of Object.keys(headers)) {
      if (key === 'sec-ch-ua' || key.startsWith('sec-ch-ua-')) {
        if (key in hints) headers[key] = hints[key]; else delete headers[key];
      }
    }
    await route.fallback({headers});
  });
}

/** Use the normal Playwright lifecycle, with an identity session on loopback only. */
export async function launchIdentityChromium(options: LaunchOptions, resolveIdentity: (version: string) => BrowserIdentity) {
  const port = await reserveDebugPort();
  const browser = await chromium.launch({
    ...options,
    args: [...(options.args || []), `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
  });
  try {
    const identity = resolveIdentity(browser.version());
    const bridge = await connectIdentityBridge(port, identity, () => {void browser.close().catch(() => {});});
    browser.on('disconnected', () => bridge.close());
    return {browser, identity, bridge};
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
