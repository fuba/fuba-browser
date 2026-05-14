import { describe, it, expect } from 'vitest';
import { buildChromeUserAgent } from '../main/user-agent.js';

describe('buildChromeUserAgent', () => {
  it('extracts major version from a plain Chromium version', () => {
    expect(buildChromeUserAgent('148.0.7778.96')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    );
  });

  it('extracts major version from a HeadlessChrome-prefixed version', () => {
    expect(buildChromeUserAgent('HeadlessChrome/148.0.7778.96')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    );
  });

  it('handles three-digit major versions', () => {
    expect(buildChromeUserAgent('200.0.0.1')).toContain('Chrome/200.0.0.0');
  });

  it('throws when the version string has no numeric prefix', () => {
    expect(() => buildChromeUserAgent('not-a-version')).toThrow(/Cannot parse/);
  });
});
