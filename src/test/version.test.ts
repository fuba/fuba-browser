import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readPackageVersion, resolveAppVersion } from '../utils/version.js';

const actualVersion = (
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
  ) as { version: string }
).version;

describe('resolveAppVersion', () => {
  const originalAppVersion = process.env.APP_VERSION;

  afterEach(() => {
    if (originalAppVersion === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = originalAppVersion;
    }
  });

  it('reads the version from package.json', () => {
    delete process.env.APP_VERSION;
    expect(readPackageVersion()).toBe(actualVersion);
    expect(resolveAppVersion()).toBe(actualVersion);
  });

  it('does not return the stale hardcoded 0.1.0', () => {
    delete process.env.APP_VERSION;
    expect(resolveAppVersion()).not.toBe('0.1.0');
  });

  it('honors the APP_VERSION environment override', () => {
    process.env.APP_VERSION = '9.9.9';
    expect(resolveAppVersion()).toBe('9.9.9');
  });
});
