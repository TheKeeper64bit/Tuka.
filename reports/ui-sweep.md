# Shared city UI sweep — November 2, 2026

Reference: the current Skopje UI on `codex/meta-hackathon`.

Boston and Tilburg already render through the same main app functions for Stops, selected-stop details, Bus lines, Journey, News and Saved. No city-specific home renderer remains. This sweep removes obsolete Boston test-explorer CSS from both shared and Meta stylesheets so those overrides cannot diverge again.

Changes:
- City switches retain Skopje's “Find your next bus.” home heading and uppercase city label.
- News city changes update the text inside the existing footer paragraph, retaining the shared icon, spacing and typography.
- Headers with city/Copilot controls can wrap; the desktop floating header has enough room for these controls. Mobile map controls and labels follow the measured header height from the existing ResizeObserver instead of assuming one fixed row.
- The city selector exposes the current city in its accessible name. Vehicle popups use the selected provider when a source label is missing.
- Entry-point asset versions are refreshed.

Verification: full existing suite passed (163 Node tests and standalone regressions). Added shared-screen checks exercise Boston and Tilburg through the actual app module and confirm common stop panels, route chips, arrivals containers, actions, line cards, Saved metadata and home headings. These additional checks passed. Meta build and Worker dry-run passed.

Visual verification is incomplete: the local runtime has no Chromium executable; the official browser download returned invalid/truncated ZIP files. The remote browser cannot connect to this runtime's localhost preview (`ERR_CONNECTION_REFUSED`). No screenshots or pixel-level, responsive-layout or live-map visual pass are claimed. Header wrapping needs a real phone/desktop browser check before release. Existing field-test screenshots predate this sweep.

Transit data and planning logic were not changed. No live deployment was performed.
