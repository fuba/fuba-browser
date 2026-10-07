# v3.6.1 release

This patch release includes dependency and security fixes merged since v3.6.0.

- Merge #216: update brace-expansion in the root lockfile.
- Merge #217: update CLI chalk to 6.0.1.
- Merge #218: update CLI Node.js types to 26.6.4.
- Merge #219: update Node.js types and TypeScript ESLint development dependencies.
- Include previous main-branch dependency updates and security fixes (#199).
- Keep #206 open because its typecheck failed, and #208 open because it conflicts with main.

Validation: the four merged dependency PRs passed lint, typecheck, build, tests, and secret scanning. The release PR must pass CI and secret scanning before merging. The final main commit must also pass offline API end-to-end tests before tagging.

The root package and lockfile versions are synchronized to 3.6.1. The CLI package keeps its independent version. The release tag triggers the existing multi-platform Docker publishing workflow.
