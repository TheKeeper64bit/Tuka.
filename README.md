# Tuka · Meta Hackathon build

This work lives on `codex/meta-hackathon`. The judging host is [tuka.meta-cerebralvalley.rand0m.net](https://tuka.meta-cerebralvalley.rand0m.net), protected by a form login and session cookie. **The universal transit changes described below are local, tested work awaiting deployment approval.** The production Skopje deployment has not been changed by this work.

## Before the hackathon

Tuka already provided a Skopje transit PWA: stops and bus routes on a map, live arrivals, a transfer planner with leave-at/arrive-by preferences, saved stops and commutes, offline schedules, JSP news, language selection, dark mode, and a local QR-card wallet. These are the foundation, not new hackathon features.

## New work on this branch

- **Two cities through one transit engine.** Boston now replaces the actual timetable database used by Stops, Bus lines, Journey, and Saved. It no longer sits in a separate snapshot screen while the shared tabs retain Skopje data.
- **Complete Boston bus timetable.** The official MBTA feed is compiled into a compact asset containing 7,081 stops, 369 bus/shuttle routes and 2,486,683 stop calls. Seven unusable single-stop sample trips are excluded, leaving 86,996 usable trips. These are feed inventory counts; service calendars determine what runs on a selected day.
- **Directional route geometry.** Each trip uses its ordered stops and validated published shape. Different directions and variants remain distinct. Missing or invalid geometry uses an optional validated road path, then an explicitly approximate stop outline.
- **Real arrivals across cities.** MBTA GTFS-Realtime trip updates, vehicle positions and alerts enter the same passenger interface as Skopje. Predictions require matching identifiers and fresh data; scheduled departures continue when live feeds fail.
- **City-aware planning and storage.** Agency time zones, service dates, calendar exceptions and after-midnight trips feed the existing journey planner. Switching cities clears old overlays and ignores late requests. Saved stops, commutes, Home/Work and shared links retain their city.
- **Grounded Meta Copilot.** The existing hackathon integration uses the Meta Model API server-side, with verified city-context tools and an optional live MBTA stop check. It must not invent routes, departures or guarantees. The browser never receives the model token. This pass does not add a new AI journey-planning tool.
- **Feed diagnostics and acceptance tests.** Reports use the application's parser, geometry validation and realtime matching—not a separate approximation of those checks.

See [implementation and validation](reports/universal-transit.md), [Boston diagnostics](reports/boston-gtfs-diagnostic.json), and [Skopje diagnostics](reports/skopje-gtfs-diagnostic.json).

## Run and verify

Use Node 22 or newer.

```sh
npm test
npm run build:meta
npx wrangler dev --config wrangler.meta.jsonc
```

Local secrets belong in `.dev.vars`: `META_AUTH_PASSWORD` for the login and `MODEL_API_KEY` for Copilot. Do not commit secrets. The username is configured in `wrangler.meta.jsonc`.

Open **Meta Copilot**, choose **Boston**, close the panel, and use the normal Stops, Bus lines and Journey tabs. Switch to Skopje through the same selector. **Correct location** lets you choose a manual starting point on the current map.

To refresh Boston's static timetable, download the official [MBTA GTFS ZIP](https://cdn.mbta.com/MBTA_GTFS.zip), then rebuild the asset and rerun checks:

```sh
python3 scripts/build-transit-feed.py /path/to/MBTA_GTFS.zip dist/boston-network.bin
node scripts/diagnose-transit.mjs boston dist/boston-network.bin reports/boston-gtfs-diagnostic.json 2026-10-29 1
node scripts/diagnose-transit.mjs skopje /path/to/skopje.zip reports/skopje-gtfs-diagnostic.json 2026-10-29 2575
npm test
npm run build:meta
```

Replace the diagnostic dates with the date being assessed. The asset preserves every bus timetable row; it is not a continuously refreshed schedule service. Rebuild when the agency publishes a new feed. Live feeds refresh separately every 30 seconds.

## Provider limitations

Boston currently covers buses and shuttles, not rail or ferries. Rail realtime records are intentionally unmatched. The bundled feed's service range is finite; no trips are invented beyond it. Untimed calls remain untimed, and trips with incomplete timing are excluded from journey planning instead of receiving fabricated times.

`BUS_ROUTER_URL` can point to an operator-approved HTTPS OSRM driving route endpoint. It is not configured by default, so invalid shapes retain labelled stop outlines. A computed driving path remains an estimate of a bus route. Walking refinement needs the existing `AUTH_DB` cache/budget binding; the Meta Worker currently falls back to labelled approximate walks without that binding.

The Skopje passenger-report service is separate and may be unavailable. Its outage does not block schedules, maps or official realtime data. JSP news and the SkopjeBus ticket handoff remain Skopje-specific features.

## Deployment boundary

Deploy this branch only after explicit approval, using `npm run deploy:meta`. It targets the separate Meta Worker; do not deploy it over the production Skopje site. No deployment or GitHub push was performed for the universal transit update.
