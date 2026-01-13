import { BrowserWindow } from 'electron';
import CDP from 'chrome-remote-interface';
import { ElementInfo, PageContent, PdfExportOptions, PdfExportResult, BrowserState } from '../types/browser.js';
import { convertToMarkdown } from '../utils/markdown.js';

export class BrowserController {
  private window: BrowserWindow;
  private client: any | null = null;
  
  constructor(window: BrowserWindow) {
    this.window = window;
  }
  
  async connect(): Promise<void> {
    if (this.client) return;
    
    const port = await this.getDebuggerPort();
    this.client = await CDP({ port });
    
    await this.client.Page.enable();
    await this.client.DOM.enable();
    await this.client.Runtime.enable();
  }
  
  private async getDebuggerPort(): Promise<number> {
    // Get the Chrome DevTools debugger URL
    this.window.webContents.debugger.attach('1.3');
    // Default Chrome debugging port
    return 9222;
  }
  
  async navigate(url: string): Promise<void> {
    await this.connect();
    await this.window.loadURL(url);
  }
  
  async scroll(x: number, y: number): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      window.scrollTo(${x}, ${y});
    `);
  }
  
  async click(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        element.click();
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async dblclick(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async hover(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async focus(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        element.focus();
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async fill(selector: string, text: string): Promise<void> {
    await this.connect();
    const escapedSelector = selector.replace(/'/g, "\\'");
    const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${escapedSelector}');
      if (element) {
        element.focus();
        element.value = '';
        element.value = '${escapedText}';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error('Element not found: ${escapedSelector}');
      }
    `);
  }

  async check(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        if (!element.checked) {
          element.click();
        }
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async uncheck(selector: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (element) {
        if (element.checked) {
          element.click();
        }
      } else {
        throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
      }
    `);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.connect();
    const escapedSelector = selector.replace(/'/g, "\\'");
    const escapedValue = value.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${escapedSelector}');
      if (element) {
        element.value = '${escapedValue}';
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error('Element not found: ${escapedSelector}');
      }
    `);
  }
  
  async type(selector: string, text: string): Promise<void> {
    await this.connect();
    await this.window.webContents.executeJavaScript(`
      const element = document.querySelector('${selector}');
      if (element) {
        element.focus();
        element.value = '${text.replace(/'/g, "\\'")}';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        throw new Error('Element not found: ${selector}');
      }
    `);
  }
  
  async screenshot(): Promise<Buffer> {
    const image = await this.window.webContents.capturePage();
    return image.toPNG();
  }
  
  async getPageContent(): Promise<PageContent> {
    await this.connect();
    
    const html = await this.window.webContents.executeJavaScript(`
      document.documentElement.outerHTML
    `);
    
    const elements = await this.getInteractiveElements();
    const markdown = await convertToMarkdown(html, elements);
    
    return {
      html,
      markdown,
      elements,
      url: this.window.webContents.getURL(),
      title: await this.window.webContents.executeJavaScript('document.title')
    };
  }
  
  async getInteractiveElements(): Promise<ElementInfo[]> {
    await this.connect();
    
    const elements = await this.window.webContents.executeJavaScript(`
      const elements = [];
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
          elements.push({
            tagName: node.tagName.toLowerCase(),
            selector: getUniqueSelector(node),
            text: node.textContent.trim().substring(0, 100),
            bbox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            attributes: {
              id: node.id,
              class: node.className,
              href: node.href,
              type: node.type,
              role: node.getAttribute('role')
            },
            isVisible: rect.top < viewport.height && rect.bottom > 0,
            areaPercentage: areaPercentage
          });
        }
      });
      
      function getUniqueSelector(element) {
        if (element.id) return '#' + element.id;
        
        let path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
          let selector = element.nodeName.toLowerCase();
          if (element.className) {
            selector += '.' + element.className.split(' ').join('.');
          }
          path.unshift(selector);
          element = element.parentNode;
        }
        return path.join(' > ');
      }
      
      return elements;
    `);
    
    return elements;
  }
  
  async getCookies(): Promise<any[]> {
    const cookies = await this.window.webContents.session.cookies.get({});
    return cookies;
  }
  
  async setCookie(cookie: any): Promise<void> {
    await this.window.webContents.session.cookies.set(cookie);
  }
  
  async clearCookies(): Promise<void> {
    await this.window.webContents.session.clearStorageData({
      storages: ['cookies']
    });
  }

  async exportPDF(options: PdfExportOptions = {}): Promise<{ data: Buffer; result: PdfExportResult }> {
    await this.connect();

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

    // Build printToPDF options
    const pdfOptions: Electron.PrintToPDFOptions = {
      landscape: options.landscape ?? false,
      printBackground: options.printBackground ?? true,
      scale: options.scale ?? 1,
      pageRanges: options.pageRanges || '',
      displayHeaderFooter,
      headerTemplate: headerTemplate || '<span></span>',
      footerTemplate: footerTemplate || '<span></span>',
    };

    // Paper size (convert from microns if provided, or use defaults)
    if (options.paperWidth !== undefined) {
      pdfOptions.pageSize = {
        width: options.paperWidth,
        height: options.paperHeight ?? 297000, // Default A4 height
      };
    }

    // Margins
    if (options.marginTop !== undefined || options.marginBottom !== undefined ||
        options.marginLeft !== undefined || options.marginRight !== undefined) {
      pdfOptions.margins = {
        top: options.marginTop ?? 0,
        bottom: options.marginBottom ?? 0,
        left: options.marginLeft ?? 0,
        right: options.marginRight ?? 0,
      };
    }

    const data = await this.window.webContents.printToPDF(pdfOptions);

    const result: PdfExportResult = {
      success: true,
      size: data.length,
      url: this.window.webContents.getURL(),
      title: await this.window.webContents.executeJavaScript('document.title'),
      timestamp: options.timestamp?.enabled ? timestampStr : undefined,
    };

    return { data, result };
  }

  // Wait methods
  async waitForSelector(selector: string, options: { timeout?: number; visible?: boolean } = {}): Promise<boolean> {
    const { timeout = 30000, visible = true } = options;
    const startTime = Date.now();
    const escapedSelector = selector.replace(/'/g, "\\'");

    while (Date.now() - startTime < timeout) {
      const found = await this.window.webContents.executeJavaScript(`
        (function() {
          const element = document.querySelector('${escapedSelector}');
          if (!element) return false;
          if (${visible}) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden';
          }
          return true;
        })()
      `);

      if (found) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  async waitForText(text: string, options: { timeout?: number; selector?: string } = {}): Promise<boolean> {
    const { timeout = 30000, selector } = options;
    const startTime = Date.now();
    const escapedText = text.replace(/'/g, "\\'");
    const escapedSelector = selector ? selector.replace(/'/g, "\\'") : '';

    while (Date.now() - startTime < timeout) {
      const found = await this.window.webContents.executeJavaScript(`
        (function() {
          const root = ${escapedSelector ? `document.querySelector('${escapedSelector}')` : 'document.body'};
          if (!root) return false;
          return root.textContent.includes('${escapedText}');
        })()
      `);

      if (found) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for text: ${text}`);
  }

  async waitForUrl(pattern: string, options: { timeout?: number } = {}): Promise<string> {
    const { timeout = 30000 } = options;
    const startTime = Date.now();

    // Convert glob pattern to regex
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));

    while (Date.now() - startTime < timeout) {
      const currentUrl = this.window.webContents.getURL();
      if (regex.test(currentUrl)) {
        return currentUrl;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for URL matching: ${pattern}`);
  }

  async waitForLoad(state: 'load' | 'domcontentloaded' | 'networkidle', options: { timeout?: number } = {}): Promise<void> {
    const { timeout = 30000 } = options;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for load state: ${state}`));
      }, timeout);

      if (state === 'networkidle') {
        // Wait for network to be idle (no requests for 500ms)
        let lastRequestTime = Date.now();
        let checkInterval: NodeJS.Timeout;

        const checkIdle = () => {
          if (Date.now() - lastRequestTime > 500) {
            clearTimeout(timeoutId);
            clearInterval(checkInterval);
            resolve();
          }
        };

        this.window.webContents.session.webRequest.onCompleted(() => {
          lastRequestTime = Date.now();
        });

        checkInterval = setInterval(checkIdle, 100);
      } else {
        if (state === 'load') {
          this.window.webContents.once('did-finish-load', () => {
            clearTimeout(timeoutId);
            resolve();
          });
        } else {
          this.window.webContents.once('dom-ready', () => {
            clearTimeout(timeoutId);
            resolve();
          });
        }
      }
    });
  }

  // Getter methods for element information
  async getText(selector: string): Promise<string> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');
        return element.textContent.trim();
      })()
    `);
  }

  async getHtml(selector: string): Promise<string> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');
        return element.innerHTML;
      })()
    `);
  }

  async getValue(selector: string): Promise<string> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');
        return element.value || '';
      })()
    `);
  }

  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    const escapedAttr = attribute.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');
        return element.getAttribute('${escapedAttr}');
      })()
    `);
  }

  async getCount(selector: string): Promise<number> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      document.querySelectorAll('${escapedSelector}').length
    `);
  }

  async getBoundingBox(selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })()
    `);
  }

  async isVisible(selector: string): Promise<boolean> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
               style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
      })()
    `);
  }

  async isEnabled(selector: string): Promise<boolean> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) return false;
        return !element.disabled;
      })()
    `);
  }

  async isChecked(selector: string): Promise<boolean> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('${escapedSelector}');
        if (!element) return false;
        return !!element.checked;
      })()
    `);
  }

  // Keyboard methods
  async press(key: string): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: key,
    });
    await this.window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: key,
    });
  }

  async keyDown(key: string): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: key,
    });
  }

  async keyUp(key: string): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: key,
    });
  }

  // Mouse methods
  async mouseMove(x: number, y: number): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'mouseMove',
      x,
      y,
    });
  }

  async mouseDown(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'mouseDown',
      button,
      x: 0,
      y: 0,
    });
  }

  async mouseUp(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'mouseUp',
      button,
      x: 0,
      y: 0,
    });
  }

  async mouseWheel(deltaY: number, deltaX: number = 0): Promise<void> {
    await this.window.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: 0,
      y: 0,
      deltaX,
      deltaY,
    });
  }

  // Storage methods
  async getLocalStorage(): Promise<Record<string, string>> {
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const items = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          items[key] = localStorage.getItem(key);
        }
        return items;
      })()
    `);
  }

  async getLocalStorageItem(key: string): Promise<string | null> {
    const escapedKey = key.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      localStorage.getItem('${escapedKey}')
    `);
  }

  async setLocalStorageItem(key: string, value: string): Promise<void> {
    const escapedKey = key.replace(/'/g, "\\'");
    const escapedValue = value.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      localStorage.setItem('${escapedKey}', '${escapedValue}')
    `);
  }

  async removeLocalStorageItem(key: string): Promise<void> {
    const escapedKey = key.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      localStorage.removeItem('${escapedKey}')
    `);
  }

  async clearLocalStorage(): Promise<void> {
    await this.window.webContents.executeJavaScript('localStorage.clear()');
  }

  async getSessionStorage(): Promise<Record<string, string>> {
    return await this.window.webContents.executeJavaScript(`
      (function() {
        const items = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          items[key] = sessionStorage.getItem(key);
        }
        return items;
      })()
    `);
  }

  async getSessionStorageItem(key: string): Promise<string | null> {
    const escapedKey = key.replace(/'/g, "\\'");
    return await this.window.webContents.executeJavaScript(`
      sessionStorage.getItem('${escapedKey}')
    `);
  }

  async setSessionStorageItem(key: string, value: string): Promise<void> {
    const escapedKey = key.replace(/'/g, "\\'");
    const escapedValue = value.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      sessionStorage.setItem('${escapedKey}', '${escapedValue}')
    `);
  }

  async removeSessionStorageItem(key: string): Promise<void> {
    const escapedKey = key.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      sessionStorage.removeItem('${escapedKey}')
    `);
  }

  async clearSessionStorage(): Promise<void> {
    await this.window.webContents.executeJavaScript('sessionStorage.clear()');
  }

  // Debug methods
  async evaluate(script: string): Promise<unknown> {
    return await this.window.webContents.executeJavaScript(script);
  }

  async highlight(selector: string): Promise<void> {
    const escapedSelector = selector.replace(/'/g, "\\'");
    await this.window.webContents.executeJavaScript(`
      (function() {
        // Remove any existing highlights
        document.querySelectorAll('.fuba-highlight').forEach(el => el.remove());

        const element = document.querySelector('${escapedSelector}');
        if (!element) throw new Error('Element not found: ${escapedSelector}');

        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'fuba-highlight';
        highlight.style.cssText = \`
          position: fixed;
          top: \${rect.top}px;
          left: \${rect.left}px;
          width: \${rect.width}px;
          height: \${rect.height}px;
          border: 2px solid red;
          background: rgba(255, 0, 0, 0.1);
          pointer-events: none;
          z-index: 999999;
        \`;
        document.body.appendChild(highlight);

        // Remove after 3 seconds
        setTimeout(() => highlight.remove(), 3000);
      })()
    `);
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
    await this.connect();

    // Get cookies
    const cookies = await this.window.webContents.session.cookies.get({});

    // Get localStorage
    const localStorage = await this.getLocalStorage();

    // Get sessionStorage
    const sessionStorage = await this.getSessionStorage();

    // Get current URL
    const url = this.window.webContents.getURL();

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
    await this.connect();

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

        // Build cookie object for setting
        const cookieToSet: Electron.CookiesSetDetails = {
          url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite as 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined,
        };

        // Set expiration if not session cookie
        if (cookie.expirationDate) {
          cookieToSet.expirationDate = cookie.expirationDate;
        }

        await this.window.webContents.session.cookies.set(cookieToSet);
      } catch (e) {
        // Skip invalid cookies
        console.warn(`Failed to set cookie ${cookie.name}:`, (e as Error).message);
      }
    }

    // Navigate to URL first if requested (needed to set storage)
    if (options.navigateToUrl && state.url && state.url !== 'about:blank') {
      await this.navigate(state.url);
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 1000));
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