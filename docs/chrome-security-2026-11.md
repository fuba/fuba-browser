# Chrome security baseline (2026-11-04)

The October 29 Chrome stable security update fixes 21 vulnerabilities, including
Critical CVE-2026-76024 (MediaStream memory corruption). Linux stable was updated
to 156.0.8078.79. The reviewed Chrome for Testing stable artifact is
156.0.8078.80, available for both linux64 and linux-arm64.

Updating Playwright alone does not establish remediation: Playwright 1.64.1
still bundles Chromium 156.0.8078.4, below the patched version. This image now
installs Chrome for Testing 156.0.8078.80 independently of Playwright, from
versioned Google URLs, with separate SHA-256 checksums for each architecture.
The full archive, including its license notices, is retained after extraction.
Playwright and playwright-core are pinned to 1.64.1 (published October 14, more
than 24 hours before this change). No other lockfile dependency versions changed.
Image dependency installation also sets npm's minimum release age to one day.

The image sets `FUBA_BROWSER_EXECUTABLE_PATH=/opt/chrome/chrome`. Startup and
recovery pass that path explicitly to Playwright, log the running browser
version, and refuse to start the API if the actual version is below
156.0.8078.79 or cannot be parsed. The browser is closed on rejection. A custom
executable must also satisfy this baseline. Development outside the image must
set the path to a patched browser; Playwright's bundled browser is insufficient.

Validation in Docker Compose, using the pinned linux64 browser:

- ESLint, TypeScript typecheck, and build passed.
- All 200 tests across 25 files passed, including offline API E2E, popup tracking,
  and actual HTTPS certificate rejection.
- The final production image started its headed browser at 156.0.8078.80;
  health, real HTTPS navigation to example.com, JavaScript evaluation, and API
  browser reset passed. Reset again launched the pinned browser. An actual
  outdated browser failed startup before the API was opened.
- Ten baseline cases cover old browser majors, the outdated same-major bundled
  build, the patch boundary, newer builds, and invalid versions.
- Both architecture archives were downloaded, checked for ZIP integrity, and
  hashed. Native arm64 execution has not been tested on this amd64 host.

Deployment requires building and replacing existing containers; pulling source
or restarting an old image does not update its browser. Preserve persistent
profiles/storage and coordinate active jobs before replacing containers.
At inspection, twelve local browser containers still used Chrome 147, 148, or
151; this source change alone does not remediate them.

Review: the browser URL and hashes are fixed in source, unsupported architectures
fail the build, the executable override cannot bypass the version baseline, and
TLS verification plus the existing NSS CA distrust setup remain covered by tests.
A numerical version check is a release baseline, not a guarantee against future
vulnerabilities or a deliberately forged executable version.

Sources:

- https://chromereleases.googleblog.com/ (October 29, 2026 desktop update)
- https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json
- https://raw.githubusercontent.com/microsoft/playwright/v1.64.1/packages/playwright-core/browsers.json
- https://registry.npmjs.org/playwright
- https://registry.npmjs.org/playwright-core
