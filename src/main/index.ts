import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { PageManager } from '../browser/page-manager.js';
import { getBrowserConfig } from '../config/browser-config.js';
import { resolveDeviceProfile } from '../config/device-profiles.js';
import { VncPasswordManager } from '../server/vnc-password-manager.js';
import { buildChromeUserAgent } from './user-agent.js';
import { AutoRecovery } from './auto-recovery.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let browserController: BrowserController | null = null;
let snapshotGenerator: SnapshotGenerator | null = null;
let pageManager: PageManager | null = null;
let vncPasswordManager: VncPasswordManager | null = null;
let currentDeviceProfile: string | null = null;
let autoRecovery: AutoRecovery | null = null;

// Initialize browser, context, page, and page manager
async function initializeBrowser() {
  const { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight, proxy } = getBrowserConfig();

  // Resolve device profile for context options
  const deviceOptions = resolveDeviceProfile(currentDeviceProfile);
  const profileLabel = currentDeviceProfile || 'desktop';

  console.error(`[System] Starting Playwright browser in ${headless ? 'headless' : 'headed'} mode (device: ${profileLabel}, locale: ${locale}, timezone: ${timezoneId})...`);

  // Build launch options
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  };

  // Add proxy configuration if specified
  if (proxy) {
    launchOptions.proxy = { server: proxy.server, bypass: proxy.bypass };
    console.error(`[System] Using proxy: ${proxy.server}`);
  }

  // Launch browser
  browser = await chromium.launch(launchOptions);

  // Build a desktop User-Agent that matches the running Chromium major version,
  // so UA / Sec-CH-UA stay consistent and bot-detection heuristics don't flag us.
  const desktopUserAgent = buildChromeUserAgent(browser.version());

  // Create browser context: use device profile if set, otherwise desktop defaults
  const contextOptions: Parameters<typeof browser.newContext>[0] = deviceOptions
    ? {
        ...deviceOptions,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
        locale,
        timezoneId,
      }
    : {
        userAgent: desktopUserAgent,
        viewport: { width: viewportWidth, height: viewportHeight },
        deviceScaleFactor,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
        locale,
        timezoneId,
      };

  context = await browser.newContext(contextOptions);

  // Create the main page
  page = await context.newPage();

  // Initialize page manager to handle popups and target="_blank" links
  pageManager = new PageManager(context, page);
  await pageManager.setup();

  // Navigate to blank page
  await page.goto('about:blank');

  console.error('[System] Browser initialized');

  return { browser, context, page, pageManager };
}

// Attach crash/disconnect handlers to the CURRENT page/browser so a crash can
// trigger automatic recovery without waiting for the watchdog to poll.
//
// The target page/browser are captured in the closure and re-checked against
// the module-level `page`/`browser` at event time: resetBrowser()/shutdown()
// close the OLD page/context/browser, which fires these very events for the
// stale instances (e.g. browser.close() fires 'disconnected'). The identity
// check below means even a late-firing event from an instance we've already
// replaced can never resurrect a reset. The autoRecovery "expected reset"
// guard (see resetBrowser/guardedResetBrowser) is the primary suppression;
// this is the belt-and-braces backstop for it.
function attachRecoveryHandlers(targetPage: Page, targetBrowser: Browser): void {
  targetPage.on('crash', () => {
    if (page !== targetPage) {
      return; // stale instance; a newer page is already current
    }
    autoRecovery?.notifyCrash('crash');
  });

  targetBrowser.on('disconnected', () => {
    if (browser !== targetBrowser) {
      return; // stale instance; a newer browser is already current
    }
    autoRecovery?.notifyCrash('disconnected');
  });
}

// Reset browser by closing and reinitializing
async function resetBrowser(): Promise<void> {
  console.error('[System] Resetting browser...');

  // Close existing browser resources
  if (page) {
    await page.close().catch(() => {});
  }
  if (context) {
    await context.close().catch(() => {});
  }
  if (browser) {
    await browser.close().catch(() => {});
  }

  // Reinitialize browser
  await initializeBrowser();

  // Update controller and snapshot generator references
  if (browserController && page && context) {
    browserController.setPageAndContext(page, context);
  }
  if (snapshotGenerator && page) {
    snapshotGenerator.setPage(page);
  }

  // Re-attach crash/disconnect handlers to the freshly created page/browser.
  if (page && browser) {
    attachRecoveryHandlers(page, browser);
  }

  console.error('[System] Browser reset complete');
}

// Wraps resetBrowser() with the auto-recovery "expected reset" guard so that
// manual resets (POST /api/reset, setDeviceProfile) never get misread as a
// crash by the crash/disconnected handlers attached above, or race the
// watchdog into starting a second, competing recovery.
async function guardedResetBrowser(): Promise<void> {
  autoRecovery?.beginExpectedReset();
  try {
    await resetBrowser();
  } finally {
    autoRecovery?.endExpectedReset();
  }
}

// Set device profile and reset browser
async function setDeviceProfile(profileName: string | null): Promise<void> {
  // Validate the profile name before resetting
  resolveDeviceProfile(profileName);

  const previousProfile = currentDeviceProfile;
  currentDeviceProfile = profileName;
  try {
    await guardedResetBrowser();
  } catch (error) {
    // Roll back profile state on failure
    currentDeviceProfile = previousProfile;
    throw error;
  }
}

// Resolve the watchdog polling interval from FUBA_BROWSER_WATCHDOG_INTERVAL_MS.
// Returns undefined (-> AutoRecovery's own default) if unset or invalid.
function resolveWatchdogIntervalMs(): number | undefined {
  const raw = process.env.FUBA_BROWSER_WATCHDOG_INTERVAL_MS;
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// Get current device profile name
function getDeviceProfile(): string | null {
  return currentDeviceProfile;
}

async function main() {
  const config = getBrowserConfig();

  // Set initial device profile from environment variable
  if (config.deviceProfile) {
    currentDeviceProfile = config.deviceProfile;
  }

  const profileLabel = currentDeviceProfile || 'desktop';
  console.log(`Starting Playwright browser (device: ${profileLabel}, locale: ${config.locale}, timezone: ${config.timezoneId})...`);

  // Initialize browser
  await initializeBrowser();

  // Initialize browser controller and snapshot generator
  browserController = new BrowserController(page!, context!);
  snapshotGenerator = new SnapshotGenerator(page!);

  // Auto-recovery: listens for page 'crash' / browser 'disconnected' events
  // and a periodic watchdog, and resets the browser automatically instead of
  // sitting "unhealthy" forever waiting for a manual POST /api/reset.
  autoRecovery = new AutoRecovery({
    reset: resetBrowser,
    checkHealth: () => browserController!.checkHealth(),
    onFatal: (message) => {
      console.error(message);
      process.exit(1);
    },
    intervalMs: resolveWatchdogIntervalMs(),
  });
  attachRecoveryHandlers(page!, browser!);
  autoRecovery.start();

  // Initialize VNC password manager if VNC_PASSWDFILE is set.
  // No base password — all VNC access requires a dynamic password via API token.
  // Password file is created by docker/entrypoint.sh before supervisord starts.
  const vncPasswdFile = process.env.VNC_PASSWDFILE;
  if (vncPasswdFile) {
    const ttlSeconds = process.env.VNC_PASSWORD_TTL_SECONDS
      ? Number.parseInt(process.env.VNC_PASSWORD_TTL_SECONDS, 10)
      : undefined;
    vncPasswordManager = new VncPasswordManager({
      passwdFilePath: vncPasswdFile,
      ttlSeconds,
    });
    vncPasswordManager.start();
    console.log(`VNC password manager started (file: ${vncPasswdFile})`);
  }

  // Start API server with reset and device profile callbacks. resetBrowser
  // is wired through the auto-recovery guard so a manual POST /api/reset
  // can't be misread as a crash by the handlers attached above.
  const apiPort = process.env.API_PORT || 39000;
  await startApiServer(Number(apiPort), browserController, snapshotGenerator, {
    resetBrowser: guardedResetBrowser,
    setDeviceProfile,
    getDeviceProfile,
    vncPasswordManager: vncPasswordManager ?? undefined,
  });

  console.log(`API server started on port ${apiPort}`);
  console.log('Fuba Browser is ready.');

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function shutdown() {
  console.log('Shutting down...');

  // Stop the watchdog and mark the upcoming close as expected so the
  // 'disconnected' event fired by browser.close() below doesn't race a
  // recovery attempt during process exit.
  if (autoRecovery) {
    autoRecovery.stop();
    autoRecovery.beginExpectedReset();
    autoRecovery = null;
  }

  if (page) {
    await page.close().catch(() => {});
    page = null;
  }

  if (context) {
    await context.close().catch(() => {});
    context = null;
  }

  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }

  if (vncPasswordManager) {
    vncPasswordManager.stop();
    vncPasswordManager = null;
  }

  browserController = null;
  snapshotGenerator = null;
  pageManager = null;

  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to start Fuba Browser:', error);
  process.exit(1);
});
