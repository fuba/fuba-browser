import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, resolveCorsOptions } from '../server/index.js';

describe('CORS config helpers', () => {
  it('disables CORS by default when env is missing or blank', () => {
    expect(parseCorsOrigins(undefined)).toBeNull();
    expect(parseCorsOrigins('')).toBeNull();
    expect(parseCorsOrigins('   ')).toBeNull();
    expect(resolveCorsOptions(undefined)).toBeNull();
  });

  it('accepts wildcard only when explicitly set to *', () => {
    expect(parseCorsOrigins('*')).toBe('*');
    expect(resolveCorsOptions('*')).toEqual({});
  });

  it('parses comma-separated origin allowlist', () => {
    expect(parseCorsOrigins('http://localhost:3000, https://example.com  ,')).toEqual([
      'http://localhost:3000',
      'https://example.com',
    ]);
    expect(resolveCorsOptions('http://localhost:3000,https://example.com')).toEqual({
      origin: ['http://localhost:3000', 'https://example.com'],
    });
  });
});
