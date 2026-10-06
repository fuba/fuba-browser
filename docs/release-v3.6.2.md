# v3.6.2 release

Dependabot opened additional updates during the v3.6.1 release process. This patch includes #221 (proxy-addr 2.0.8) and #223 (source-map-js 1.2.2), both of which passed CI and secret scanning before merging.

#222 remains open because its typecheck failed. #206 and #208 remain outside this release for the reasons recorded in the v3.6.1 release notes.

The release PR must pass CI and secret scanning; final main must pass all CI jobs, including offline API end-to-end tests, before tagging. The tag triggers multi-platform Docker publishing.
