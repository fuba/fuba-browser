import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { BrowserController } from '../browser/controller.js';

interface PageStub {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  isClosed: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
}

function createController(overrides: Partial<PageStub> = {}): {
  controller: BrowserController;
  pageStub: PageStub;
} {
  const pageStub: PageStub = {
    on: vi.fn(),
    off: vi.fn(),
    isClosed: vi.fn().mockReturnValue(false),
    evaluate: vi.fn().mockResolvedValue('complete'),
    url: vi.fn().mockReturnValue('about:blank'),
    ...overrides,
  };

  const contextStub = {};
  const controller = new BrowserController(
    pageStub as unknown as Page,
    contextStub as unknown as BrowserContext
  );

  return {
    controller,
    pageStub,
  };
}

describe('BrowserController health check', () => {
  it('returns healthy when page is open and renderer is reachable', async () => {
    const { controller } = createController({
      url: vi.fn().mockReturnValue('http://example.com/app'),
      evaluate: vi.fn().mockResolvedValue('complete'),
    });

    const result = await controller.checkHealth();

    expect(result).toEqual({
      ok: true,
      pageClosed: false,
      currentUrl: 'http://example.com/app',
      readyState: 'complete',
    });
  });

  it('returns unhealthy when page is already closed', async () => {
    const { controller, pageStub } = createController({
      isClosed: vi.fn().mockReturnValue(true),
    });

    const result = await controller.checkHealth();

    expect(result).toEqual({
      ok: false,
      pageClosed: true,
      error: 'Browser page is closed',
    });
    expect(pageStub.evaluate).not.toHaveBeenCalled();
  });

  it('returns unhealthy when renderer check fails', async () => {
    const { controller } = createController({
      evaluate: vi.fn().mockRejectedValue(new Error('Execution context was destroyed')),
    });

    const result = await controller.checkHealth();

    expect(result.ok).toBe(false);
    expect(result.pageClosed).toBe(false);
    expect(result.error).toContain('Execution context was destroyed');
  });
});
