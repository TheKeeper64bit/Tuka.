# Web app installation and header polish

November 2, 2026.

## Installation

The universal manifest now identifies the app as **Tuka**, with a city-neutral description, standalone display, and verified 192/512-pixel icons. Its relative identity, scope and start URL are retained so path-based installations and existing app identities stay consistent. The page includes manifest credentials and Apple home-screen metadata; the login page links the manifest and branding assets too.

The protected Meta Worker exposes only the manifest and listed branding assets without a session, so browser metadata requests do not become login redirects. App code, transit APIs and AI endpoints remain protected. Read-only methods are enforced for those metadata assets. This does not make the private app publicly accessible.

**More (•••) → Install** opens platform-appropriate instructions. A browser-provided install prompt is invoked only after the rider chooses Install. Android, desktop Chrome/Edge, iPhone/iPad and Safari on Mac each have appropriate guidance. The control hides in standalone mode and after the browser reports installation. Offline behavior remains the existing authenticated preparation and offline-reader model.

A local Chromium check of the built artifact returned no manifest or installability errors and confirmed an active service worker. The install dialog opened with no page errors. This checks browser eligibility and UI, not installation on a physical phone. Safari behavior is covered by platform-guidance tests, not a Safari device run. See `install-browser-check.json` and `install-preview.png`.

## Header

The primary row retains the Tuka brand, named city selector, Copilot and a More disclosure. Language, ticket access where applicable, installation, appearance and the current feed status are grouped in that disclosure. Existing control nodes are moved rather than replaced, preserving their handlers.

The menu closes after choosing an action, on an outside click or with Escape. Escape returns focus to its summary. It uses a native details/summary disclosure with ordinary buttons, avoiding menu keyboard semantics that the interface does not implement.

Browser coverage: Skopje, Boston and Tilburg at 320, 390, 768 and 1280 pixels. All 12 combinations passed with a single-row header, no document-width overflow, no offscreen primary buttons and no page JavaScript errors. Theme, language and install dialogs and Escape dismissal were exercised. Screenshots use a neutral test basemap, not live street tiles. See `header-browser-check.json`, `header-preview.png` and `header-menu-preview.png`.

## Initial loading copy

Before a city is resolved, the decorative label reads **YOUR CITY, IN MOTION**. Once a city is selected it uses that city's name. Boot-language checks cover the neutral label and retain the immediate readiness behavior.

Validation: 175 Node tests and all standalone regressions pass. The Meta build and Worker dry-run pass. No live deployment was performed.
