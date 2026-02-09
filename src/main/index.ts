import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { PageManager } from '../browser/page-manager.js';
import { getBrowserConfig } from '../config/browser-config.js';
import { VncPasswordManager } from '../server/vnc-password-manager.js';

// Use a standard Chrome User-Agent to avoid detection as automation
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let browserController: BrowserController | null = null;
let snapshotGenerator: SnapshotGenerator | null = null;
let pageManager: PageManager | null = null;
let vncPasswordManager: VncPasswordManager | null = null;

// Initialize browser, context, page, and page manager
async function initializeBrowser() {
  const { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight } = getBrowserConfig();

  console.error(`[System] Starting Playwright browser in ${headless ? 'headless' : 'headed'} mode (scale: ${deviceScaleFactor}x, locale: ${locale}, timezone: ${timezoneId}, viewport: ${viewportWidth}x${viewportHeight})...`);

  // Launch browser
  browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  // Create browser context with custom user agent, viewport, HiDPI, locale and timezone
  context = await browser.newContext({
    userAgent: CHROME_USER_AGENT,
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor,
    ignoreHTTPSErrors: true,
    locale,
    timezoneId,
  });

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

  console.error('[System] Browser reset complete');
}

async function main() {
  const { headless, deviceScaleFactor, locale, timezoneId, viewportWidth, viewportHeight } = getBrowserConfig();

  console.log(`Starting Playwright browser in ${headless ? 'headless' : 'headed'} mode (scale: ${deviceScaleFactor}x, locale: ${locale}, timezone: ${timezoneId}, viewport: ${viewportWidth}x${viewportHeight})...`);

  // Initialize browser
  await initializeBrowser();

  // Initialize browser controller and snapshot generator
  browserController = new BrowserController(page!, context!);
  snapshotGenerator = new SnapshotGenerator(page!);

  // Initialize VNC password manager if VNC_PASSWORD and VNC_PASSWDFILE are set
  const vncPassword = process.env.VNC_PASSWORD;
  const vncPasswdFile = process.env.VNC_PASSWDFILE;
  if (vncPassword && vncPasswdFile) {
    const ttlSeconds = process.env.VNC_PASSWORD_TTL_SECONDS
      ? Number.parseInt(process.env.VNC_PASSWORD_TTL_SECONDS, 10)
      : undefined;
    vncPasswordManager = new VncPasswordManager({
      basePassword: vncPassword,
      passwdFilePath: vncPasswdFile,
      ttlSeconds,
    });
    // Password file is created by docker/entrypoint.sh before supervisord starts.
    // Do NOT call initializeFile() here to avoid overwriting the file while x11vnc is running.
    vncPasswordManager.start();
    console.log(`VNC password manager started (file: ${vncPasswdFile})`);
  }

  // Start API server with reset callback
  const apiPort = process.env.API_PORT || 39000;
  await startApiServer(Number(apiPort), browserController, snapshotGenerator, {
    resetBrowser,
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
