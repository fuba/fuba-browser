# Browser TLS verification and emergency CA distrust

Browser contexts verify HTTPS certificates, including contexts created for device
profiles or after automatic recovery. The shared context factory overrides any
caller-provided `ignoreHTTPSErrors` value. Self-signed and otherwise untrusted
servers now fail navigation rather than silently accepting a connection.

Chromium has a root store independent of the operating system CA bundle.
Playwright's Chromium also cannot be assumed to have received Chrome's component
updates. Updating `ca-certificates` or Node alone therefore does not establish
that browser navigation rejects a compromised CA.

The image entrypoint imports the October 2026 eMudhra incident certificates with
NSS distrust flags (`p,p,p`) before Chromium starts. This includes the sixteen
known intermediate certificates (eight keys and their cross-signs), together
with their four disclosed parent/root certificates. The bundled PEM filenames
are their SHA-256 certificate fingerprints. These are public certificates, with
no private keys.

The initializer preserves an existing legacy `$HOME/.pki/nssdb` database;
otherwise it uses `$HOME/.local/share/pki/nssdb`, Chromium's default since M146.
It adds distrust records without replacing user-installed certificate entries.
The initializer runs at every container start so an existing mounted database
also receives the records.

Sources, checked 2026-10-22:

- [Mozilla incident](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449)
- [Incident certificate list](https://emudhra.we-have-a-problem.com/impacted-intermediates.json)
- [Incident parent/root list](https://emudhra.we-have-a-problem.com/roots.json)
- [Chromium Linux certificate management](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md)

Validation uses an actual local HTTPS server with a temporary self-signed
certificate and Chromium: regular HTTP succeeds, while the untrusted HTTPS
connection must fail even if a caller requests `ignoreHTTPSErrors: true`.
Deployment verification additionally checks the incident's real HTTPS endpoints
through the navigation API, with `https://example.com` as a successful control.
