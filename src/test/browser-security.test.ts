// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { assertSecureBrowserVersion } from '../config/browser-security.js';

describe('browser security baseline', () => {
  it.each(['148.0.7778.96', '153.0.8010.12', '156.0.8078.4', '156.0.8078.78', '', '156.0.8078.80-extra'])('rejects an outdated or malformed version: %s', version => {
    expect(() => assertSecureBrowserVersion(version)).toThrow();
  });

  it.each(['156.0.8078.79', '156.0.8078.80', '156.0.8079.1', '157.0.8103.26'])('accepts a version at or above the security baseline: %s', version => {
    expect(() => assertSecureBrowserVersion(version)).not.toThrow();
  });
});
