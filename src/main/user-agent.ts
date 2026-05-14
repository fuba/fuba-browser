// Build a Chrome desktop User-Agent string for the given Chromium version.
// Mirrors Chrome's "user-agent reduction": only the major version is real;
// other parts are zeroed to avoid fingerprinting and version drift in tests.
export function buildChromeUserAgent(browserVersion: string): string {
  const major = extractMajorVersion(browserVersion);
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

function extractMajorVersion(browserVersion: string): string {
  // browser.version() may return "148.0.7778.96" or "HeadlessChrome/148.0.7778.96".
  const match = browserVersion.match(/(\d+)\./);
  if (!match) {
    throw new Error(`Cannot parse Chromium version: ${browserVersion}`);
  }
  return match[1];
}
