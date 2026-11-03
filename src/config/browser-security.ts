// SPDX-License-Identifier: MIT
// Chrome's October 29, 2026 security update includes CVE-2026-76024.
export const MINIMUM_CHROMIUM_VERSION = '156.0.8078.79';

/** Refuse to serve requests with a browser below the reviewed security baseline. */
export function assertSecureBrowserVersion(version: string): void {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    const actual = version.split('.').map(Number);
    const minimum = MINIMUM_CHROMIUM_VERSION.split('.').map(Number);
    for (let index = 0; index < minimum.length; index++) {
      if (actual[index] > minimum[index]) return;
      if (actual[index] < minimum[index]) break;
      if (index === minimum.length - 1) return;
    }
  }
  throw new Error(`Chromium ${version} is below the security baseline ${MINIMUM_CHROMIUM_VERSION}. Rebuild the image with the pinned Chrome for Testing release.`);
}
