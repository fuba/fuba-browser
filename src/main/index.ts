import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';
import { PageManager } from '../browser/page-manager.js';

// Use a standard Chrome User-Agent to avoid detection as automation
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let browserController: BrowserController | null = null;
let snapshotGenerator: SnapshotGenerator | null = null;
let pageManager: PageManager | null = null;

async function main() {
  // Determine headless mode from environment variable
  const headless = process.env.HEADLESS !== 'false';

  // Device scale factor for HiDPI (default: 2)
  const deviceScaleFactor = Number(process.env.DEVICE_SCALE_FACTOR) || 2;

  console.log(`Starting Playwright browser in ${headless ? 'headless' : 'headed'} mode (scale: ${deviceScaleFactor}x)...`);

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

  // Create browser context with custom user agent, viewport and HiDPI
  context = await browser.newContext({
    userAgent: CHROME_USER_AGENT,
    viewport: { width: 1200, height: 2000 },
    deviceScaleFactor,
    ignoreHTTPSErrors: true,
  });

  // Create the main page
  page = await context.newPage();

  // Initialize page manager to handle popups and target="_blank" links
  pageManager = new PageManager(context, page);
  await pageManager.setup();

  // Navigate to blank page
  await page.goto('about:blank');

  // Initialize browser controller and snapshot generator
  browserController = new BrowserController(page, context);
  snapshotGenerator = new SnapshotGenerator(page);

  // Start API server
  const apiPort = process.env.API_PORT || 39000;
  await startApiServer(Number(apiPort), browserController, snapshotGenerator);

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

  browserController = null;
  snapshotGenerator = null;
  pageManager = null;

  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to start Fuba Browser:', error);
  process.exit(1);
});
