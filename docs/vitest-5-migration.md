# Vitest 5 migration

PR #208 resolves the shared upgrade blocker behind #206 and #222.

- Merge current main while preserving released package versions and subsequent dependency fixes.
- Regenerate the lockfile for Vitest 5 and its matching mocker.
- Type test callbacks explicitly and replace the removed sequential suite API; tests remain sequential by default.
- Use Node.js 22 in CI and Docker publishing; the production image already uses Node.js 26.
- Run lint, root and CLI typechecks/builds, and the complete test suite including real Playwright offline API E2E in a Node.js 26 Compose container.

The two Dependabot branches currently contain identical dependency changes. Once #208 lands, their upgrade is satisfied and they can be closed as superseded.
