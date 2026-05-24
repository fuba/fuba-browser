import { readFileSync } from 'node:fs';

const FALLBACK_VERSION = '0.0.0';
const MAX_VERSION_LENGTH = 64;

// True when the string contains any C0 control character or DEL. Such values
// are rejected so the version cannot smuggle CR/LF/NUL into logs or headers
// if it is ever reused outside a JSON body.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

// Normalize a version candidate before it is echoed into API responses:
// trim, then reject empty, over-long, or control-character-bearing values.
// Returns null when the value is unusable.
function normalizeVersion(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const value = input.trim();
  if (!value || value.length > MAX_VERSION_LENGTH || hasControlChars(value)) {
    return null;
  }
  return value;
}

// Read the application version from the bundled package.json.
// Returns null when the file cannot be read or the version is unusable.
export function readPackageVersion(): string | null {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    ) as { version?: unknown };
    return normalizeVersion(packageJson.version);
  } catch {
    return null;
  }
}

// Resolve the application version reported by the API.
// Order: APP_VERSION env override -> package.json version -> fallback.
export function resolveAppVersion(): string {
  return normalizeVersion(process.env.APP_VERSION) ?? readPackageVersion() ?? FALLBACK_VERSION;
}
