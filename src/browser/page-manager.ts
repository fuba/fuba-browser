import { Page, BrowserContext } from 'playwright';

/**
 * Manages browser pages, handling target="_blank" links and popup windows.
 * - Rewrites target="_blank" to "_self" to prevent unwanted new tabs
 * - Tracks popup windows (window.open) for OAuth and other legitimate use cases
 * - Logs page count changes to STDERR for monitoring
 */
export class PageManager {
  private context: BrowserContext;
  private mainPage: Page;
  private popupPages: Set<Page> = new Set();

  constructor(context: BrowserContext, initialPage: Page) {
    this.context = context;
    this.mainPage = initialPage;
  }

  /**
   * Initialize the page manager by setting up event handlers and init scripts.
   */
  async setup(): Promise<void> {
    // 1. Add init script to rewrite target="_blank" to "_self"
    await this.context.addInitScript(() => {
      const rewriteTargets = () => {
        document.querySelectorAll('a[target="_blank"]').forEach(link => {
          link.setAttribute('target', '_self');
        });
      };

      // Observe DOM changes to catch dynamically added links
      const observer = new MutationObserver(() => {
        rewriteTargets();
      });

      // Start observing when DOM is ready
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }

      // Also observe document changes for SPAs
      document.addEventListener('DOMContentLoaded', () => {
        rewriteTargets();
        if (document.documentElement) {
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
        }
      });

      // Initial rewrite
      rewriteTargets();
    });

    // 2. Listen for new pages (popups from window.open)
    this.context.on('page', async (newPage: Page) => {
      this.popupPages.add(newPage);
      this.logPageCount('opened');

      // Track when popup closes
      newPage.on('close', () => {
        this.popupPages.delete(newPage);
        this.logPageCount('closed');
      });
    });
  }

  /**
   * Log the current page count to STDERR.
   */
  private logPageCount(event: 'opened' | 'closed'): void {
    const total = 1 + this.popupPages.size;
    if (total > 1) {
      console.error(`[PageManager] Popup ${event}. ${total} pages open (1 main + ${this.popupPages.size} popups)`);
    } else {
      console.error(`[PageManager] All popups closed, 1 page remaining`);
    }
  }

  /**
   * Get the main page instance.
   */
  getMainPage(): Page {
    return this.mainPage;
  }

  /**
   * Get the number of popup pages currently open.
   */
  getPopupCount(): number {
    return this.popupPages.size;
  }

  /**
   * Get all pages including main page and popups.
   */
  getAllPages(): Page[] {
    return [this.mainPage, ...this.popupPages];
  }

  /**
   * Get all popup pages.
   */
  getPopupPages(): Page[] {
    return [...this.popupPages];
  }
}
