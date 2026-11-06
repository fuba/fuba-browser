# UA-derived browser identity

The literal User-Agent is the source of the advertised browser identity. The default is Windows desktop Chrome, with the major version taken from the running Chromium and the remaining components reduced to zero.

## Configuration

- Set `FUBA_BROWSER_USER_AGENT` at startup to supply a literal UA.
- `GET /api/identity` returns the applied identity in `data`.
- `POST /api/identity` accepts `{"userAgent":"<literal UA>"}` and resets the browser before returning the applied identity.
- `POST /api/identity` with `{"userAgent":null}` clears the override and uses the active device profile UA, or the Windows desktop default.
- A custom UA takes precedence over the device profile UA. Profile viewport and scale remain unchanged; mobile and touch options are derived from the effective UA.
- Browser resets close tabs and discard the current in-memory session. Save authentication state first when needed. Runtime overrides last until process restart; use the environment variable for persistent startup configuration.
- Invalid, unsupported, empty, non-ASCII or control-character input is rejected with HTTP 400 before resetting. Startup configuration with such a UA fails startup.

Supported identity parsing covers Windows, macOS, Linux, Chrome OS, Android and iOS; browser families include Chrome/Chromium, Edge, Firefox and Safari. This is identity emulation, not a change of browser engine.

## Consistency

The effective UA determines HTTP `User-Agent`, navigator platform/vendor, mobile/touch context settings, low-entropy Client Hints, and high-entropy metadata (brands, full version list, OS version, architecture, bitness, model and WOW64 where represented in the UA). `/api/device` reports the same effective UA and mobile/touch settings.

Chromium CDP overrides are combined with context initialization scripts and per-request CDP Fetch header normalization. Context scripts also cover the first document in a popup and child frames. Only Client Hint headers already selected by Chromium are normalized: high-entropy headers are not added without negotiation. Safari/Firefox identities do not advertise Chromium UA Client Hints or `navigator.userAgentData` in supported document/worker realms.

**Redirect security:** Identity normalization uses CDP `Fetch.continueRequest`, whose overrides affect one request only, not subsequent redirect hops. Every hop is normalized from the headers Chromium currently provides, after its credential stripping and cookie selection. It does not use Playwright `route.fallback({headers})` / `route.continue({headers})`, which persist overrides across redirects and can replay `Authorization` across an origin boundary. Original authentication headers remain intact on the original request and same-origin redirect, but are not restored at a cross-origin destination. No Playwright normalization route or explicit HTTP-cache disable is installed. Service-worker-intercepted requests remain outside the guarantee.

## Explicit limits

- **SharedWorker is deferred.** Its initial JS values and requests are not guaranteed to match the document identity. No CDP pipe wrapper, startup gate or debugger-breakpoint workaround is included.
- Service Worker identity is also not guaranteed by this change. These independent worker lifecycles are excluded from the identity bridge; they are not blocked or disabled.
- Dedicated Workers are covered by real-browser tests, including immediate UA/platform reads, but this is not a general anti-fingerprinting guarantee.
- A reduced UA cannot reveal the real browser patch version, detailed OS version, CPU type or hardware. Advertised metadata uses the UA's values and deterministic fallbacks; it does not copy the host's real full browser version. For example, `Chrome/156.0.0.0` yields a `156.0.0.0` full-version entry rather than the host patch version. Windows NT and macOS version tokens are normalized to three components, not treated as proof of an exact installed OS release.
- Screen geometry, locale, timezone, fonts, GPU/WebGL, codecs, engine-specific APIs and TLS fingerprints are not inferred from the UA. Safari/Firefox UAs still run on Chromium.
- An ephemeral debugging port is opened on container loopback only, with no new published Docker port. Do not expose it or use host networking with untrusted local processes.

## Verification

`npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:ci` cover parser/API regressions. The browser identity tests run when `FUBA_BROWSER_EXECUTABLE_PATH` points to an installed Chromium executable. They verify Windows, Linux, macOS, Android, iOS Safari, Firefox and Edge identities, document/popup initial values, negotiated headers and dedicated Workers. They do not assert SharedWorker or Service Worker consistency.
