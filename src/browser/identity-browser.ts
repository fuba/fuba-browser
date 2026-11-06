import { chromium, type LaunchOptions, type BrowserContext } from 'playwright';
import { connectIdentityBridge, reserveDebugPort } from './identity-bridge.js';
import type { BrowserIdentity } from './identity.js';
import { applyIdentity } from './identity-script.js';

/** Context scripts cover the first document without sticky routing header overrides. */
export async function configureIdentityContext(context: BrowserContext, identity: BrowserIdentity): Promise<void> {
  await context.addInitScript(applyIdentity, identity);
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
