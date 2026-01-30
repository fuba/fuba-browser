import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { PageManager } from '../browser/page-manager.js';

describe('PageManager', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let pageManager: PageManager;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    pageManager = new PageManager(context, page);
    await pageManager.setup();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('target="_blank" rewriting', () => {
    it('should rewrite target="_blank" to "_self"', async () => {
      // Navigate to a data URL to trigger addInitScript
      // addInitScript only runs on navigation, not on setContent
      const html = `
        <html>
          <body>
            <a id="test-link" href="https://example.com" target="_blank">Test Link</a>
          </body>
        </html>
      `;
      await page.goto(`data:text/html,${encodeURIComponent(html)}`);

      // Wait for MutationObserver to process
      await page.waitForTimeout(100);

      // Check that target has been rewritten
      const target = await page.getAttribute('#test-link', 'target');
      expect(target).toBe('_self');
    });

    it('should rewrite dynamically added links with target="_blank"', async () => {
      // Navigate to a data URL to trigger addInitScript
      const html = `
        <html>
          <body>
            <div id="container"></div>
          </body>
        </html>
      `;
      await page.goto(`data:text/html,${encodeURIComponent(html)}`);

      // Add link dynamically
      await page.evaluate(() => {
        const container = document.getElementById('container');
        const link = document.createElement('a');
        link.id = 'dynamic-link';
        link.href = 'https://example.com';
        link.target = '_blank';
        link.textContent = 'Dynamic Link';
        container?.appendChild(link);
      });

      // Wait for MutationObserver to process
      await page.waitForTimeout(100);

      // Check that target has been rewritten
      const target = await page.getAttribute('#dynamic-link', 'target');
      expect(target).toBe('_self');
    });
  });

  describe('popup tracking', () => {
    it('should detect and track popup pages', async () => {
      const stderrSpy = vi.spyOn(console, 'error');

      await page.setContent(`
        <html>
          <body>
            <button id="open-popup" onclick="window.open('about:blank', '_blank')">Open Popup</button>
          </body>
        </html>
      `);

      // Click button to open popup
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.click('#open-popup'),
      ]);

      // Wait for event handling
      await page.waitForTimeout(100);

      expect(pageManager.getPopupCount()).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('2 pages open'));

      // Close popup
      await popup.close();
      await page.waitForTimeout(100);

      expect(pageManager.getPopupCount()).toBe(0);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('All popups closed'));

      stderrSpy.mockRestore();
    });

    it('should allow popups for OAuth-like flows', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="oauth-btn" onclick="window.open('about:blank', 'oauth', 'width=500,height=600')">Sign in with OAuth</button>
          </body>
        </html>
      `);

      // Open OAuth popup
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.click('#oauth-btn'),
      ]);

      // Popup should be accessible
      expect(popup).toBeTruthy();
      expect(await popup.url()).toBe('about:blank');

      await popup.close();
    });
  });

  describe('getMainPage', () => {
    it('should return the main page', () => {
      const mainPage = pageManager.getMainPage();
      expect(mainPage).toBe(page);
    });
  });

  describe('getAllPages', () => {
    it('should return all pages including popups', async () => {
      await page.setContent(`
        <html>
          <body>
            <button id="popup-btn" onclick="window.open('about:blank')">Open</button>
          </body>
        </html>
      `);

      const initialCount = pageManager.getAllPages().length;

      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.click('#popup-btn'),
      ]);

      await page.waitForTimeout(100);
      expect(pageManager.getAllPages().length).toBe(initialCount + 1);

      await popup.close();
      await page.waitForTimeout(100);
      expect(pageManager.getAllPages().length).toBe(initialCount);
    });
  });
});
