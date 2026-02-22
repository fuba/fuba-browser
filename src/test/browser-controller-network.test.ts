import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { BrowserController } from '../browser/controller.js';

describe('BrowserController network data URL decoding', () => {
  it('decodes percent-escaped base64 data URLs when reading response bodies', async () => {
    const pageStub = {
      on: vi.fn(),
      off: vi.fn(),
    };
    const contextStub = {};

    const controller = new BrowserController(
      pageStub as unknown as Page,
      contextStub as unknown as BrowserContext
    );

    const internal = controller as unknown as {
      networkRequestById: Map<string, { id: string; url: string; contentType?: string }>;
    };

    internal.networkRequestById.set('req-1', {
      id: 'req-1',
      url: 'data:text/plain;base64,SGVsbG8%3D',
      contentType: 'text/plain',
    });

    const result = await controller.getNetworkResponseBody('req-1');
    expect(result.contentType).toBe('text/plain');
    expect(result.body.toString('utf-8')).toBe('Hello');
  });
});
