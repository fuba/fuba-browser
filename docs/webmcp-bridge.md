# WebMCP bridge implementation

The `/mcp` endpoint exposes the controlled page's WebMCP tools as native MCP tools
over the official SDK's stateful Streamable HTTP transport. Clients retain their
own discovery snapshots. Native `RegisteredTool` objects remain in browser-side
Playwright handles; only serializable descriptors cross into the API server.

The browser bridge supports the current document API and older navigator/testing
APIs without changing website registration code. Same-origin frame collisions
receive distinct aliases. Document identity is retained for each owning frame:
checking `WindowProxy` alone is insufficient because it survives navigation.

The endpoint handles changes, cancellation, input validation, bounded execution,
origin allowlists, session expiry, session capacity, and handle cleanup. It uses
the existing server port and browser recovery path. The initial scope is the
main controlled page and same-origin frames discoverable by that page; other
tabs and cross-origin frame aggregation remain outside this implementation.

User-facing connection details are in [WebMCP bridge](../doc/WEBMCP.md).

## Validation

Validation used an isolated Compose container with the project's pinned Chrome
for Testing 156.0.8078.80. Proxy environment variables were cleared for the local
fixture tests.

- TypeScript typecheck, ESLint, and application build passed.
- All 450 tests passed, including existing offline API and browser identity tests.
- The final document-identity refinement passed the 14 focused bridge tests,
  typecheck, lint, and build.
- The real application was started separately on a free port. An SDK MCP client
  initialized, discovered a tool registered through native WebMCP, called it, and
  verified the resulting page title through the existing REST API. The temporary
  application was then stopped.
- The new dependency graph contains 20 packages; registry publication times were
  independently checked to exceed 24 hours. `.npmrc` enforces a one-day minimum
  release age for supported npm versions. Existing platform-specific optional
  lockfile entries were preserved.
- `npm audit --omit=dev` reported no vulnerabilities. The full audit still reports
  existing moderate development-tool advisories outside this change.

Self-review covered tool/document identity across navigation, iframe alias
collisions, cross-client isolation, session disposal during discovery, concurrent
initialization capacity, schema namespaces, cancellation propagation, and origin
validation on each transport method. No additional agent review was delegated.
