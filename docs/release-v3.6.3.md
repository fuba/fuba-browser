# v3.6.3 release

This patch releases #208: Vitest 5.0.3 migration, compatible test callback types, updated suite API, and Node.js 22 in CI and Docker publishing. Production remains on its existing Node.js 26 image.

Validation: the migration passed all 189 tests in a Node.js 26 Compose container, including real-browser offline API E2E, root and CLI typechecks/builds, and lint. Main CI and secret scanning passed after merging #208. The version-only release PR and final main CI are checked before tagging.

The root package and lockfile are synchronized to 3.6.3; the CLI keeps its independent version. The release tag triggers multi-platform Docker publishing.
