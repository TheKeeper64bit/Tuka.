# Network Inspector and Travel Preferences verification

- Full Node suite passed (198 tests plus standalone regressions), including Skopje, Boston and Tilburg shared-screen and geometry checks. The Meta asset build passed.
- Deterministic ZIP tests cover clean inputs, invalid references, suspicious geometry, ambiguous directions, expired calendars and unsupported files. Provider tests cover no-call clean input, duplicate caching, Meta failure with Baseten fallback, both providers unavailable, opt-out, and unsupported output.
- Chromium verified preferences at 320, 390, 768 and 1280 CSS pixels. Walking speed, route priority, walking limit and transfer buffer persisted with the expected values. The route action stayed enabled. Journey calculations were exercised by the existing planner regressions.
- The Wellington ZIP passed review and import in Chromium with the optional model response mocked. Local review retained 3,123 stops, 245 routes and 10,080 trips. A padded 49 MiB copy also passed local review. That exercises the compressed file limit near its boundary, rather than the maximum expanded-table workload.
- The mocked fallback reported 139 fixture tokens. Live usage and cost were not measured because provider credentials were unavailable. Provider usage is shown when returned. Failed provider calls can still incur usage, and fallback totals can differ from the successful response's usage.
- Geometry checks are sampled and bounded. A warning is a prompt to check the operator export. Direction/headsign overlap can be valid. Existing importer errors still block import. The app never applies AI suggestions.
- No new dependency or database binding is needed. Optional server settings are `NETWORK_INSPECTOR_ENABLED=false`, `NETWORK_INSPECTOR_INPUT_BYTES` (8,000 by default), `NETWORK_INSPECTOR_INPUT_TOKENS` (4,000 by default, conservatively estimated from UTF-8 bytes plus overhead), and `NETWORK_INSPECTOR_OUTPUT_TOKENS` (750 by default). Cache, request coalescing and rate limiting are per server instance.

[Importer before](import-before.png) · [Importer after, with mocked AI](import-after.png) · [Preferences before](preferences-before.png) · [Mobile after](preferences-390.png) · [Desktop after](preferences-1280.png)

## Files changed

- Import review and diagnostics: `dist/network-picker.js`, `dist/feed-import.js`, `dist/feed-import-worker.js`, `dist/feed-profile.js`, `dist/gtfs-zip.js`.
- Preferences and asset references: `dist/index.html`, `dist/planner.css`, `dist/app.js`, `dist/meta.js`, `dist/sw.js`, `dist/transit.js`.
- Protected backend: `server/network-inspector.js`, `server/meta-site.js`.
- Tests and documentation: `tests/imported-feed-check.mjs`, `README.md`, and this report with screenshots.
