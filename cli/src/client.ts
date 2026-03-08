// API client for fuba-browser REST API

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ClientOptions {
  host: string;
  port: number;
  timeout: number;
}

export interface DocsIndexEntry {
  id: string;
  title: string;
  path: string;
  sourceUrl: string;
}

export interface DocsIndexData {
  documents: DocsIndexEntry[];
  bundleEndpoint: string;
}

export interface DocsDocumentData {
  id: string;
  title: string;
  path: string;
  sourceUrl: string;
  markdown: string;
  fetchedAt: string;
}

export interface DocsBundleData {
  documents: DocsIndexEntry[];
  markdown: string;
  format: string;
  fetchedAt: string;
}

export interface HealthData {
  status: 'ok' | 'unhealthy';
  version: string;
  application: string;
  error?: string;
}

export class FubaClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: Partial<ClientOptions> = {}) {
    const host = options.host || process.env.FBB_HOST || 'localhost';
    const port = options.port || parseInt(process.env.FBB_PORT || '39000');
    this.timeout = options.timeout || parseInt(process.env.FBB_TIMEOUT || '30000');
    this.baseUrl = `http://${host}:${port}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle binary responses (anything non-JSON)
      const contentType = response.headers.get('content-type') ?? '';
      const isJson = /\bjson\b/i.test(contentType);

      if (!isJson) {
        const buffer = await response.arrayBuffer();
        return { success: response.ok, data: Buffer.from(buffer) as unknown as T };
      }

      return await response.json() as ApiResponse<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: (error as Error).message };
    }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  // Health check - /health returns {status, version, application, error?} instead of standard ApiResponse
  async health(): Promise<ApiResponse<HealthData>> {
    const result = await this.get<HealthData>('/health');
    // /health endpoint doesn't follow standard {success, data} format
    // If we got a raw health response (has 'status' field), wrap it
    const raw = result as unknown as Partial<HealthData>;
    if (raw.status === 'ok' || raw.status === 'unhealthy') {
      const data = raw as HealthData;
      return {
        success: data.status === 'ok',
        data,
        error: data.status === 'ok' ? undefined : data.error ?? 'Application health check failed',
      };
    }
    return result;
  }

  // Navigation
  async open(url: string): Promise<ApiResponse<{ url: string }>> {
    return this.post('/api/navigate', { url });
  }

  // Snapshot
  async snapshot(options: {
    interactive?: boolean;
    compact?: boolean;
    depth?: number;
    selector?: string;
  } = {}): Promise<ApiResponse<unknown>> {
    const params = new URLSearchParams();
    if (options.interactive) params.set('interactive', 'true');
    if (options.compact) params.set('compact', 'true');
    if (options.depth) params.set('depth', options.depth.toString());
    if (options.selector) params.set('selector', options.selector);

    const query = params.toString();
    return this.get(`/api/snapshot${query ? '?' + query : ''}`);
  }

  // Action by ref
  async action(ref: string, action: string, value?: string): Promise<ApiResponse<unknown>> {
    return this.post('/api/action', { ref, action, value });
  }

  // Click
  async click(selector: string): Promise<ApiResponse<{ selector: string }>> {
    // Check if selector is a ref
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'click') as Promise<ApiResponse<{ selector: string }>>;
    }
    return this.post('/api/click', { selector });
  }

  // Type
  async type(selector: string, text: string): Promise<ApiResponse<{ selector: string; text: string }>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'type', text) as Promise<ApiResponse<{ selector: string; text: string }>>;
    }
    return this.post('/api/type', { selector, text });
  }

  // Fill (clear and type)
  async fill(selector: string, text: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'fill', text);
    }
    return this.post('/api/action', { ref: selector, action: 'fill', value: text });
  }

  // Scroll
  async scroll(direction: string, pixels: number = 100): Promise<ApiResponse<{ x: number; y: number }>> {
    let x = 0, y = 0;
    switch (direction) {
      case 'up':
        y = -pixels;
        break;
      case 'down':
        y = pixels;
        break;
      case 'left':
        x = -pixels;
        break;
      case 'right':
        x = pixels;
        break;
      default:
        // Treat as absolute coordinates
        if (direction.includes(',')) {
          [x, y] = direction.split(',').map(n => parseInt(n.trim()));
        } else {
          y = parseInt(direction);
        }
    }
    return this.post('/api/scroll', { x, y });
  }

  // Screenshot
  async screenshot(selector?: string): Promise<ApiResponse<Buffer>> {
    const params = selector ? `?selector=${encodeURIComponent(selector)}` : '';
    return this.get(`/api/screenshot${params}`);
  }

  // Get page content
  async content(): Promise<ApiResponse<unknown>> {
    return this.get('/api/content');
  }

  // Get elements
  async elements(): Promise<ApiResponse<unknown>> {
    return this.get('/api/elements');
  }

  // Documentation for LLM consumption
  async docsIndex(ids?: string[]): Promise<ApiResponse<DocsIndexData>> {
    const params = new URLSearchParams();
    if (ids && ids.length > 0) {
      params.set('docs', ids.join(','));
    }
    const query = params.toString();
    return this.get(`/api/docs${query ? '?' + query : ''}`);
  }

  async docsDocument(id: string): Promise<ApiResponse<DocsDocumentData>> {
    return this.get(`/api/docs/${encodeURIComponent(id)}`);
  }

  async docsBundle(ids?: string[]): Promise<ApiResponse<DocsBundleData>> {
    const params = new URLSearchParams();
    if (ids && ids.length > 0) {
      params.set('docs', ids.join(','));
    }
    const query = params.toString();
    return this.get(`/api/docs/llm${query ? '?' + query : ''}`);
  }

  // Get page info
  async getTitle(): Promise<ApiResponse<{ title: string }>> {
    return this.get('/api/get/title');
  }

  async getUrl(): Promise<ApiResponse<{ url: string }>> {
    return this.get('/api/get/url');
  }

  // Cookies
  async cookies(): Promise<ApiResponse<unknown[]>> {
    return this.get('/api/cookies');
  }

  async clearCookies(): Promise<ApiResponse<unknown>> {
    return this.delete('/api/cookies');
  }

  // Hover
  async hover(selector: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'hover');
    }
    return this.post('/api/hover', { selector });
  }

  // Focus
  async focus(selector: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'focus');
    }
    return this.post('/api/focus', { selector });
  }

  // Check/Uncheck
  async check(selector: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'check');
    }
    return this.post('/api/check', { selector });
  }

  async uncheck(selector: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'uncheck');
    }
    return this.post('/api/uncheck', { selector });
  }

  // Web VNC token
  async vncToken(vncHost?: string): Promise<ApiResponse<{ token: string; expiresAt: string }>> {
    return this.post('/api/web-vnc/token', vncHost ? { vncHost } : {});
  }

  /** Return the base URL used by this client (for building noVNC URLs). */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // Select
  async select(selector: string, value: string): Promise<ApiResponse<unknown>> {
    if (selector.startsWith('@') || /^e\d+$/.test(selector)) {
      return this.action(selector, 'select', value);
    }
    return this.post('/api/select', { selector, value });
  }

  // Network
  async networkList(): Promise<ApiResponse<{ entries: unknown[]; count: number }>> {
    return this.get('/api/network');
  }

  async networkClear(): Promise<ApiResponse<{ cleared: number }>> {
    return this.delete('/api/network');
  }

  async networkBody(id: string, type: 'binary' | 'base64' = 'base64'): Promise<ApiResponse<unknown>> {
    return this.get(`/api/network/body/${encodeURIComponent(id)}?type=${type}`);
  }

  // Device
  async deviceInfo(): Promise<ApiResponse<unknown>> {
    return this.get('/api/device');
  }

  async deviceProfiles(): Promise<ApiResponse<{ profiles: unknown[] }>> {
    return this.get('/api/device/profiles');
  }

  async deviceSet(profile: string): Promise<ApiResponse<unknown>> {
    return this.post('/api/device', { profile });
  }

  // PDF
  async pdf(options: Record<string, unknown> = {}): Promise<ApiResponse<Buffer>> {
    return this.post('/api/pdf', options);
  }

  async pdfInfo(options: Record<string, unknown> = {}): Promise<ApiResponse<unknown>> {
    return this.post('/api/pdf/info', options);
  }

  // DOM
  async dom(): Promise<ApiResponse<unknown>> {
    return this.get('/api/dom');
  }

  // Session info
  async session(): Promise<ApiResponse<{ url: string; title: string; cookiesCount: number }>> {
    return this.get('/api/session');
  }

  // Set cookie
  async setCookie(cookie: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.post('/api/cookies', cookie);
  }

  // Clear snapshot
  async clearSnapshot(): Promise<ApiResponse<unknown>> {
    return this.delete('/api/snapshot');
  }
}
