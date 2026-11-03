# Tuka v2 development report

Review branch: `feature/v2-transit-guardian`, based on `release/v1-final-dutch`. The branch is for review; no merge or deployment was performed.

The existing GTFS parser, city shell, planner, journey guidance, saved places and routes, and provider gateway remain in place. The existing Copilot already had access to Tuka transit tools. New in v2: Guardian assesses the selected journey against fresh predictions and relevant official alerts, distinguishes live, scheduled and missing data, and calculates feasible alternatives using Tuka's planner. Options can be applied to the map. Meta interprets requests and explains verified options on demand. The server validates suggested option IDs and constraints; Baseten is available through the existing provider fallback. A failed model request leaves the planner and recommendations usable.

The stop sheet keeps its selected stop and retains scroll on a refresh of the same panel. Fixed a minimum height rule that prevented collapse during guidance, and a landscape layout that could intercept the sheet toggle. Change Stop retains the corrected event path from v1 and was exercised in the running app. Old AI decisions are cleared when reanalyzing so they cannot refer to a new set of options. Transfer markers and walking, published, and approximate route segments are visually distinct; the GTFS shapes are unchanged. Copilot uses a modeless panel with contextual entry points and separate planner facts. Controls use shared surface, spacing and focus styles, with reduced-motion support.

| Area | Verification |
| --- | --- |
| Automated suite | 202 Node tests and standalone regressions passed; Meta asset build passed. |
| Guardian | Normal journey, delayed transfer, official stop closure, missing predictions, no feasible option, ambiguity, arrival deadline, less walking, timeout, and conflicting or stale evidence covered by the suite. |
| Browser | Chromium at 320, 390 and 1280 pixels, plus phone landscape. Exercised stop changes, keyboard collapse and restore, drag, planner selections, modeless Copilot, AI timeout fallback and local map updates. |
| Skopje | Running app exercised with controlled GTFS and realtime fixtures; actual Skopje geometry regressions covered route 56, damaged shapes and preserved published patterns. |
| Boston | Actual bundled Boston GTFS and a captured MBTA TripUpdates prediction replayed in Chromium; selected alternative was drawn on the map. Shared city regressions passed. |
| Tilburg | Bundled Tilburg timetable checked in Chromium with four-language switching, Dutch reload persistence, stop controls, and planner UI; shared city regressions passed. |

The Boston replay uses an MBTA prediction captured on 3 November 2026 at 18:30:49 UTC for bus 222. The prediction was 154 seconds later than the bundled timetable at the selected stop. It is historical prediction data, not a claim that the vehicle was observed to arrive late. The demo uses real planner output; browser verification used a mock for the AI response. No paid AI calls were made. A live Meta response, physical Android touch or keyboard behavior, and on-vehicle outcomes were not verified. Provider rate limiting is per running server instance. Automatic stop exclusion uses structured official closure data; text-only advisories are shown as evidence.

Run `npm ci`, copy `.env.example` to `.env`, then run `npm run dev:meta` and open `http://localhost:8793`. Set the judging password and optional model credentials only in the server environment. Open `/guardian-demo.html` for the replay. Run `npm test` for regressions. For the browser suite, run `node tests/browser/guardian.cjs` with Playwright installed; optionally set `TUKA_PLAYWRIGHT_MODULE` and `TUKA_CHROMIUM` to installed paths.

Screenshots: [Guardian on a phone](../reports/v2/v2-guardian-phone.png), [Copilot on a phone](../reports/v2/v2-copilot-phone.png), [landscape](../reports/v2/v2-landscape.png), [Boston replay](../reports/v2/v2-real-event-replay.png), [Tilburg in Dutch](../reports/v2/v2-tilburg-dutch.png). See [browser results](../reports/v2/v2-browser-check.json).

## Modified files

- `CHANGELOG.md`
- `VERSION`
- `dist/app.js`
- `dist/guardian-demo.html`
- `dist/guardian-demo.js`
- `dist/guardian-replay.json`
- `dist/guardian-view.js`
- `dist/guardian.css`
- `dist/guardian.js`
- `dist/index.html`
- `dist/journey-follow.js`
- `dist/journey-store.js`
- `dist/journey-tools.js`
- `dist/meta.js`
- `dist/offline.js`
- `dist/planner.js`
- `dist/service-alerts.js`
- `dist/sw.js`
- `dist/transit.js`
- `docs/tuka-v2-development-report.md`
- `docs/tuka-v2-implementation.md`
- `package.json`
- `reports/v2/v2-browser-check.json`
- `reports/v2/v2-copilot-phone.png`
- `reports/v2/v2-guardian-phone.png`
- `reports/v2/v2-landscape.png`
- `reports/v2/v2-real-event-replay.png`
- `reports/v2/v2-tilburg-browser-check.json`
- `reports/v2/v2-tilburg-dutch.png`
- `scripts/build-pages.mjs`
- `server/guardian.js`
- `server/meta-site.js`
- `tests/browser/guardian.cjs`
- `tests/fixtures/guardian-synthetic.zip`
- `tests/guardian-check.mjs`
- `tests/offline-check.mjs`
- `tests/screens-check.mjs`
