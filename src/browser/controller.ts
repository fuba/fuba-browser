import { Page, BrowserContext, Cookie } from 'playwright';
import { ElementInfo, PageContent, PdfExportOptions, PdfExportResult, BrowserState, BrowserCookie } from '../types/browser.js';
import { convertToMarkdown } from '../utils/markdown.js';

export class BrowserController {
  private page: Page;
  private context: BrowserContext;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
  }

  /**
   * Update the page and context references (used after browser reset).
   */
  setPageAndContext(page: Page, context: BrowserContext): void {
    this.page = page;
    this.context = context;
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async scroll(x: number, y: number): Promise<void> {
    await this.page.evaluate(([scrollX, scrollY]) => {
      window.scrollTo(scrollX, scrollY);
    }, [x, y]);
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async dblclick(selector: string): Promise<void> {
    await this.page.dblclick(selector);
  }

  async hover(selector: string): Promise<void> {
    await this.page.hover(selector);
  }

  async focus(selector: string): Promise<void> {
    await this.page.focus(selector);
  }

  async fill(selector: string, text: string): Promise<void> {
    await this.page.fill(selector, text);
  }

  async check(selector: string): Promise<void> {
    await this.page.check(selector);
  }

  async uncheck(selector: string): Promise<void> {
    await this.page.uncheck(selector);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  async type(selector: string, text: string): Promise<void> {
    await this.page.locator(selector).pressSequentially(text);
  }

  async screenshot(selector?: string): Promise<Buffer> {
    if (selector) {
      const element = this.page.locator(selector).first();
      return await element.screenshot({ type: 'png' });
    }
    return await this.page.screenshot({ type: 'png' });
  }

  async getPageContent(): Promise<PageContent> {
    const html = await this.page.evaluate(() => document.documentElement.outerHTML);

    const elements = await this.getInteractiveElements();
    const markdown = await convertToMarkdown(html, elements);

    return {
      html,
      markdown,
      elements,
      url: this.page.url(),
      title: await this.page.title()
    };
  }

  async getInteractiveElements(): Promise<ElementInfo[]> {
    const elements = await this.page.evaluate(() => {
      const result: any[] = [];
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      // Get all potentially interactive elements
      const selectors = 'a, button, input, select, textarea, [onclick], [role="button"], [role="link"]';
      const nodes = document.querySelectorAll(selectors);

      nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        const viewportArea = viewport.width * viewport.height;
        const areaPercentage = (area / viewportArea) * 100;

        // Filter elements with sufficient area (>= 0.1% of viewport)
        if (areaPercentage >= 0.1 && rect.width > 0 && rect.height > 0) {
          result.push({
            tagName: node.tagName.toLowerCase(),
            selector: getUniqueSelector(node),
            text: (node.textContent || '').trim().substring(0, 100),
            bbox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            attributes: {
              id: node.id,
              class: node.className,
              href: (node as HTMLAnchorElement).href,
              type: (node as HTMLInputElement).type,
              role: node.getAttribute('role')
            },
            isVisible: rect.top < viewport.height && rect.bottom > 0,
            areaPercentage: areaPercentage
          });
        }
      });

      function getUniqueSelector(element: Element): string {
        if (element.id) return '#' + element.id;

        const path: string[] = [];
        let currentElement: Element | null = element;
        while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
          let selector = currentElement.nodeName.toLowerCase();
          if (currentElement.className) {
            selector += '.' + currentElement.className.split(' ').join('.');
          }
          path.unshift(selector);
          currentElement = currentElement.parentElement;
        }
        return path.join(' > ');
      }

      return result;
    });

    return elements;
  }

  async getCookies(): Promise<BrowserCookie[]> {
    const cookies = await this.context.cookies();
    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
    }));
  }

  async setCookie(cookie: BrowserCookie): Promise<void> {
    await this.context.addCookies([{
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }]);
  }

  async clearCookies(): Promise<void> {
    await this.context.clearCookies();
  }

  async exportPDF(options: PdfExportOptions = {}): Promise<{ data: Buffer; result: PdfExportResult }> {
    const now = new Date();
    const timestampStr = this.formatTimestamp(now, options.timestamp?.format);

    // Build header/footer templates with timestamp if requested
    let headerTemplate = options.headerTemplate || '';
    let footerTemplate = options.footerTemplate || '';

    if (options.timestamp?.enabled) {
      const timestampHtml = this.buildTimestampHtml(timestampStr, options.timestamp.align || 'right');

      if (options.timestamp.position === 'header') {
        headerTemplate = timestampHtml + (headerTemplate || '');
      } else {
        // Default to footer
        footerTemplate = (footerTemplate || '') + timestampHtml;
      }
    }

    // Determine if header/footer should be displayed
    const displayHeaderFooter = options.displayHeaderFooter ||
      options.timestamp?.enabled ||
      !!options.headerTemplate ||
      !!options.footerTemplate;

    // Build PDF options for Playwright
    const pdfOptions: Parameters<Page['pdf']>[0] = {
      landscape: options.landscape ?? false,
      printBackground: options.printBackground ?? true,
      scale: options.scale ?? 1,
      pageRanges: options.pageRanges || '',
      displayHeaderFooter,
      headerTemplate: headerTemplate || '<span></span>',
      footerTemplate: footerTemplate || '<span></span>',
    };

    // Paper size (convert from microns to mm string)
    if (options.paperWidth !== undefined) {
      pdfOptions.width = `${options.paperWidth / 1000}mm`;
      pdfOptions.height = `${(options.paperHeight ?? 297000) / 1000}mm`;
    }

    // Margins (convert from microns to mm string)
    if (options.marginTop !== undefined || options.marginBottom !== undefined ||
        options.marginLeft !== undefined || options.marginRight !== undefined) {
      pdfOptions.margin = {
        top: `${(options.marginTop ?? 0) / 1000}mm`,
        bottom: `${(options.marginBottom ?? 0) / 1000}mm`,
        left: `${(options.marginLeft ?? 0) / 1000}mm`,
        right: `${(options.marginRight ?? 0) / 1000}mm`,
      };
    }

    const data = await this.page.pdf(pdfOptions);

    const result: PdfExportResult = {
      success: true,
      size: data.length,
      url: this.page.url(),
      title: await this.page.title(),
      timestamp: options.timestamp?.enabled ? timestampStr : undefined,
    };

    return { data, result };
  }

  // Wait methods - using Playwright's built-in waiting
  async waitForSelector(selector: string, options: { timeout?: number; visible?: boolean } = {}): Promise<boolean> {
    const { timeout = 30000, visible = true } = options;
    try {
      await this.page.waitForSelector(selector, {
        timeout,
        state: visible ? 'visible' : 'attached'
      });
      return true;
    } catch {
      throw new Error(`Timeout waiting for selector: ${selector}`);
    }
  }

  async waitForText(text: string, options: { timeout?: number; selector?: string } = {}): Promise<boolean> {
    const { timeout = 30000, selector } = options;
    try {
      const locator = selector
        ? this.page.locator(selector).getByText(text, { exact: false })
        : this.page.getByText(text, { exact: false });
      await locator.first().waitFor({ timeout });
      return true;
    } catch {
      throw new Error(`Timeout waiting for text: ${text}`);
    }
  }

  async waitForUrl(pattern: string, options: { timeout?: number } = {}): Promise<string> {
    const { timeout = 30000 } = options;
    // Convert glob pattern to regex
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

    try {
      await this.page.waitForURL(regex, { timeout });
      return this.page.url();
    } catch {
      throw new Error(`Timeout waiting for URL matching: ${pattern}`);
    }
  }

  async waitForLoad(state: 'load' | 'domcontentloaded' | 'networkidle', options: { timeout?: number } = {}): Promise<void> {
    const { timeout = 30000 } = options;
    await this.page.waitForLoadState(state, { timeout });
  }

  // Getter methods for element information
  async getText(selector: string): Promise<string> {
    const element = this.page.locator(selector).first();
    const text = await element.textContent();
    return (text || '').trim();
  }

  async getHtml(selector: string): Promise<string> {
    const element = this.page.locator(selector).first();
    return await element.innerHTML();
  }

  async getValue(selector: string): Promise<string> {
    const element = this.page.locator(selector).first();
    return await element.inputValue();
  }

  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    const element = this.page.locator(selector).first();
    return await element.getAttribute(attribute);
  }

  async getCount(selector: string): Promise<number> {
    return await this.page.locator(selector).count();
  }

  async getBoundingBox(selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const element = this.page.locator(selector).first();
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Element not found or not visible: ${selector}`);
    }
    return box;
  }

  async isVisible(selector: string): Promise<boolean> {
    const element = this.page.locator(selector).first();
    return await element.isVisible();
  }

  async isEnabled(selector: string): Promise<boolean> {
    const element = this.page.locator(selector).first();
    return await element.isEnabled();
  }

  async isChecked(selector: string): Promise<boolean> {
    const element = this.page.locator(selector).first();
    return await element.isChecked();
  }

  // Keyboard methods
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async keyDown(key: string): Promise<void> {
    await this.page.keyboard.down(key);
  }

  async keyUp(key: string): Promise<void> {
    await this.page.keyboard.up(key);
  }

  // Mouse methods
  async mouseMove(x: number, y: number): Promise<void> {
    await this.page.mouse.move(x, y);
  }

  async mouseDown(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.page.mouse.down({ button });
  }

  async mouseUp(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.page.mouse.up({ button });
  }

  async mouseWheel(deltaY: number, deltaX: number = 0): Promise<void> {
    await this.page.mouse.wheel(deltaX, deltaY);
  }

  // Storage methods - using page.evaluate
  async getLocalStorage(): Promise<Record<string, string>> {
    return await this.page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items[key] = localStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  async getLocalStorageItem(key: string): Promise<string | null> {
    return await this.page.evaluate((k) => localStorage.getItem(k), key);
  }

  async setLocalStorageItem(key: string, value: string): Promise<void> {
    await this.page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
  }

  async removeLocalStorageItem(key: string): Promise<void> {
    await this.page.evaluate((k) => localStorage.removeItem(k), key);
  }

  async clearLocalStorage(): Promise<void> {
    await this.page.evaluate(() => localStorage.clear());
  }

  async getSessionStorage(): Promise<Record<string, string>> {
    return await this.page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          items[key] = sessionStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  async getSessionStorageItem(key: string): Promise<string | null> {
    return await this.page.evaluate((k) => sessionStorage.getItem(k), key);
  }

  async setSessionStorageItem(key: string, value: string): Promise<void> {
    await this.page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [key, value]);
  }

  async removeSessionStorageItem(key: string): Promise<void> {
    await this.page.evaluate((k) => sessionStorage.removeItem(k), key);
  }

  async clearSessionStorage(): Promise<void> {
    await this.page.evaluate(() => sessionStorage.clear());
  }

  // Debug methods
  async evaluate(script: string): Promise<unknown> {
    return await this.page.evaluate(script);
  }

  async highlight(selector: string): Promise<void> {
    await this.page.evaluate((sel) => {
      // Remove any existing highlights
      document.querySelectorAll('.fuba-highlight').forEach(el => el.remove());

      const element = document.querySelector(sel);
      if (!element) throw new Error(`Element not found: ${sel}`);

      const rect = element.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.className = 'fuba-highlight';
      highlight.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid red;
        background: rgba(255, 0, 0, 0.1);
        pointer-events: none;
        z-index: 999999;
      `;
      document.body.appendChild(highlight);

      // Remove after 3 seconds
      setTimeout(() => highlight.remove(), 3000);
    }, selector);
  }

  private formatTimestamp(date: Date, format?: string): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    if (!format) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    return format
      .replace('YYYY', year.toString())
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  private buildTimestampHtml(timestamp: string, align: 'left' | 'center' | 'right'): string {
    const alignStyle = {
      left: 'text-align: left; margin-left: 10px;',
      center: 'text-align: center; width: 100%;',
      right: 'text-align: right; margin-right: 10px;',
    };

    return `<div style="font-size: 9px; color: #666; ${alignStyle[align]}">${timestamp}</div>`;
  }

  // State management methods for saving/loading authentication
  async saveState(): Promise<BrowserState> {
    // Get cookies
    const cookies = await this.getCookies();

    // Get localStorage
    const localStorage = await this.getLocalStorage();

    // Get sessionStorage
    const sessionStorage = await this.getSessionStorage();

    // Get current URL
    const url = this.page.url();

    const state: BrowserState = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      url,
      cookies,
      localStorage,
      sessionStorage,
    };

    return state;
  }

  async loadState(state: BrowserState, options: { navigateToUrl?: boolean } = {}): Promise<void> {
    // Clear existing state
    await this.clearCookies();
    await this.clearLocalStorage();
    await this.clearSessionStorage();

    // Restore cookies
    for (const cookie of state.cookies) {
      try {
        // Skip cookies without domain
        if (!cookie.domain) {
          console.warn(`Skipping cookie ${cookie.name}: missing domain`);
          continue;
        }

        // Handle 'expires' field (also support legacy 'expirationDate' for backwards compatibility)
        const expires = (cookie as any).expirationDate ?? cookie.expires;

        const cookieToSet: Cookie = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          expires: expires ?? -1,
          httpOnly: cookie.httpOnly ?? false,
          secure: cookie.secure ?? false,
          sameSite: cookie.sameSite || 'Lax',
        };

        await this.context.addCookies([cookieToSet]);
      } catch (e) {
        // Skip invalid cookies
        console.warn(`Failed to set cookie ${cookie.name}:`, (e as Error).message);
      }
    }

    // Navigate to URL first if requested (needed to set storage)
    if (options.navigateToUrl && state.url && state.url !== 'about:blank') {
      await this.navigate(state.url);
      // Wait for page to load
      await this.page.waitForLoadState('domcontentloaded');
    }

    // Restore localStorage
    for (const [key, value] of Object.entries(state.localStorage)) {
      try {
        await this.setLocalStorageItem(key, value);
      } catch (e) {
        console.warn(`Failed to set localStorage item ${key}:`, (e as Error).message);
      }
    }

    // Restore sessionStorage
    for (const [key, value] of Object.entries(state.sessionStorage)) {
      try {
        await this.setSessionStorageItem(key, value);
      } catch (e) {
        console.warn(`Failed to set sessionStorage item ${key}:`, (e as Error).message);
      }
    }
  }
}
