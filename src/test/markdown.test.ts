import { describe, expect, it } from 'vitest';
import { convertToMarkdown } from '../utils/markdown.js';

describe('convertToMarkdown', () => {
  it('converts interactive elements without throwing', async () => {
    const html = '<html><body><a href="https://example.com">Example</a><button>Click</button></body></html>';

    await expect(convertToMarkdown(html, [])).resolves.toContain('[Example](https://example.com');
  });
});
