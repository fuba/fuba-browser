import { readFileSync } from 'node:fs';

const FALLBACK_VERSION = '0.0.0';

// Read the application version from the bundled package.json.
// Returns null when the file cannot be read or has no version field.
export function readPackageVersion(): string | null {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    ) as { version?: string };
    return packageJson.version?.trim() || null;
  } catch {
    return null;
  }
}

// Resolve the application version reported by the API.
// Order: APP_VERSION env override -> package.json version -> fallback.
export function resolveAppVersion(): string {
  const override = process.env.APP_VERSION?.trim();
  if (override) {
    return override;
  }
  return readPackageVersion() ?? FALLBACK_VERSION;
}
