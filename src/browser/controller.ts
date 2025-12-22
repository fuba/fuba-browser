import { BrowserWindow } from 'electron';
import CDP from 'chrome-remote-interface';
import { ElementInfo, PageContent } from '../types/browser.js';
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
      const element = document.querySelector('${selector}');
      if (element) {
        element.click();
      } else {
        throw new Error('Element not found: ${selector}');
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
}