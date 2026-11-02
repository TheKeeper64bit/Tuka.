# Tuka · Meta Hackathon build

The Netherlands pilot lives on `feature/tilburg-netherlands`, based on the earlier `codex/meta-hackathon` work. The judging host is [tuka.meta-cerebralvalley.rand0m.net](https://tuka.meta-cerebralvalley.rand0m.net), protected by a form login and session cookie. **The universal transit changes described below are local, tested work awaiting deployment approval.** The production Skopje deployment has not been changed by this work.

## Before the hackathon

Tuka already provided a Skopje transit PWA: stops and bus routes on a map, live arrivals, a transfer planner with leave-at/arrive-by preferences, saved stops and commutes, offline schedules, JSP news, language selection, dark mode, and a local QR-card wallet. These are the foundation, not new hackathon features.

## Earlier hackathon work retained here

- **Two cities through one transit engine.** Boston now replaces the actual timetable database used by Stops, Bus lines, Journey, and Saved. It no longer sits in a separate snapshot screen while the shared tabs retain Skopje data.
- **Complete Boston bus timetable.** The official MBTA feed is compiled into a compact asset containing 7,081 stops, 369 bus/shuttle routes and 2,486,683 stop calls. Seven unusable single-stop sample trips are excluded, leaving 86,996 usable trips. These are feed inventory counts; service calendars determine what runs on a selected day.
- **Directional route geometry.** Each trip uses its ordered stops and validated published shape. Different directions and variants remain distinct. Missing or invalid geometry uses an optional validated road path, then an explicitly approximate stop outline.
- **Real arrivals across cities.** MBTA GTFS-Realtime trip updates, vehicle positions and alerts enter the same passenger interface as Skopje. Predictions require matching identifiers and fresh data; scheduled departures continue when live feeds fail.
- **City-aware planning and storage.** Agency time zones, service dates, calendar exceptions and after-midnight trips feed the existing journey planner. Switching cities clears old overlays and ignores late requests. Saved stops, commutes, Home/Work and shared links retain their city.
- **Grounded Meta Copilot.** The existing hackathon integration uses the Meta Model API server-side, with verified city-context tools and an optional live MBTA stop check. It must not invent routes, departures or guarantees. The browser never receives the model token. The Tilburg pilot adds a separate, validated travel-constraint tool described below.
- **Feed diagnostics and acceptance tests.** Reports use the application's parser, geometry validation and realtime matching—not a separate approximation of those checks.

See [implementation and validation](reports/universal-transit.md), [Boston diagnostics](reports/boston-gtfs-diagnostic.json), and [Skopje diagnostics](reports/skopje-gtfs-diagnostic.json).

## New in the Tilburg pilot — October 30

- A dedicated Netherlands ingestion adapter streams the national OVapi ZIP into a **complete-trip regional bus dataset**. The browser downloads a 2.1 MB schedule instead of the roughly 205 MB national archive.
- **100 regional routes, 2,606 boarding stops and 16,873 trips**, with 625 additional parent-station records retained. Calendars determine which of these services run on any date. Every retained call was compared with the original national ZIP: **407,058 calls, zero mismatches**, including 6,109 calls after midnight.
- Tilburg uses the existing map, colored route overlays, departures, shared journey planner and city-scoped Saved tab. A separate **City** button supports manual selection and location-based selection. Startup checks GPS first; the last selected city is a fallback when location is unavailable.
- A Netherlands realtime adapter filters national trip updates, vehicles and alerts before delivery to the browser. Exact trip/stop/sequence matching, freshness and vehicle-position checks keep unreliable data out of live results. Feed outages leave scheduled departures available.
- Official operator notices from OVapi appear in the News tab and match affected routes/stops in the existing alert panels. Original advice and validity are retained. Expired notices are dropped; publication dates are not invented. Where no direct notice URL is supplied, the operator notices portal is linked explicitly.
- **English notices:** Tilburg notices include a **Read in English** control, a clearly labelled machine translation when needed, and the original operator text. Official English versions are preferred. Translation uses the existing server-side Meta/Baseten configuration and is cached by exact source text; no extra provider key is needed. A real model round trip is still unverified locally.
- **Meta travel-constraint handoff:** choose “Plan a journey” in Copilot. The server validates extracted places, date/time, preference and total walking limit. The rider chooses actual stops and reviews the fields, then the shared deterministic planner calculates the results. The new endpoint and UI have automated/mocked tests; a real Meta token is still needed locally to verify the full provider round trip.

This is a **pilot awaiting external acceptance**, not a finished release. The roadmap requires your friend’s real journeys in Tilburg, a live-token AI check, and a tested release/demo before completion. Further city expansion and the global feed library are paused. See the [phase-by-phase record](reports/tilburg/roadmap.md), [source comparison](reports/tilburg/source-verification.json), [feed diagnostics](reports/tilburg/gtfs-diagnostic.json), and [browser checks](reports/tilburg/browser-checks.json).

## Run and verify

Use Node 22 or newer.

```sh
npm test
npm run build:meta
npm run dev:meta
```

Copy `.env.example` to the ignored `.env` and set `META_AUTH_PASSWORD` for login and `MODEL_API_KEY` for Copilot. `npm run dev:meta` explicitly loads `.env` so an existing `.dev.vars` does not hide these values. For optional journey-interpretation fallback, set server-only `BASETEN_API_KEY` and `BASETEN_MODEL` to a tool-capable model available in your Baseten account. Meta is primary; Baseten is tried once on network, timeout, authentication, rate-limit or service failures, or used directly when Meta is unconfigured. Both use the same validated tool contract; neither supplies itinerary times. Malformed model output does not trigger another paid request. The general Copilot chat still uses Meta. See [Baseten Chat Completions](https://docs.baseten.co/reference/inference-api/chat-completions). Do not commit secrets. The username is configured in `wrangler.meta.jsonc`.

Open **City**, choose **Tilburg**, **Boston** or **Skopje**, and use the normal Stops, Bus lines and Journey tabs. **Use my location** selects a supported network when location access is available. **Correct location** lets you choose a manual starting point on the current map.

To refresh Boston's static timetable, download the official [MBTA GTFS ZIP](https://cdn.mbta.com/MBTA_GTFS.zip), then rebuild the asset and rerun checks:

```sh
python3 scripts/build-transit-feed.py /path/to/MBTA_GTFS.zip dist/boston-network.bin
node scripts/diagnose-transit.mjs boston dist/boston-network.bin reports/boston-gtfs-diagnostic.json 2026-10-29 1
node scripts/diagnose-transit.mjs skopje /path/to/skopje.zip reports/skopje-gtfs-diagnostic.json 2026-10-29 2575
npm test
npm run build:meta
```

Replace the diagnostic dates with the date being assessed. The asset preserves every bus timetable row; it is not a continuously refreshed schedule service. Rebuild when the agency publishes a new feed. Live feeds refresh separately every 30 seconds.

To rebuild the Tilburg partition and verify it against the national source:

```sh
python3 scripts/build-netherlands.py /path/to/gtfs-nl.zip /tmp/tuka-tilburg
cp /tmp/tuka-tilburg/tilburg-network.bin dist/tilburg-network.bin
cp /tmp/tuka-tilburg/tilburg-index.json dist/tilburg-index.json
cp /tmp/tuka-tilburg/tilburg-ingestion.json reports/tilburg/ingestion.json
python3 scripts/verify-netherlands.py /path/to/gtfs-nl.zip dist/tilburg-network.bin reports/tilburg/source-verification.json
node scripts/diagnose-transit.mjs tilburg dist/tilburg-network.bin reports/tilburg/gtfs-diagnostic.json 2026-10-30 4220128
npm test
npm run build:meta
```

Update the schedule and its regional realtime index together. The source currently covers October 29–December 12, 2026. The partition includes complete bus routes serving Tilburg and one connecting route hop within the regional connection area; it does not cover all Netherlands transport or rail. This snapshot contains no applicable explicit GTFS transfer records; the shared planner uses nearby stops and the rider’s transfer buffer.

OVapi’s `licenses.txt` identifies **CC0-1.0** for the general tables and **ODbL-1.0** for shapes. Shape data and this derived regional database remain available under their applicable source licence. See [data provenance and attribution](reports/tilburg/roadmap.md#sources-and-attribution). Ticketing tables with separate licences are not included.

## Provider limitations

Boston currently covers buses and shuttles, not rail or ferries. Rail realtime records are intentionally unmatched. The bundled feed's service range is finite; no trips are invented beyond it. Untimed calls remain untimed, and trips with incomplete timing are excluded from journey planning instead of receiving fabricated times.

`BUS_ROUTER_URL` can point to an operator-approved HTTPS OSRM driving route endpoint. It is not configured by default, so invalid shapes retain labelled stop outlines. A computed driving path remains an estimate of a bus route. Walking refinement needs the existing `AUTH_DB` cache/budget binding; the Meta Worker currently falls back to labelled approximate walks without that binding.

The Skopje passenger-report service is separate and may be unavailable. Its outage does not block schedules, maps or official realtime data. JSP news and the SkopjeBus ticket handoff remain Skopje-specific features.

## Deployment boundary

Deploy this branch only after explicit approval, using `npm run deploy:meta`. It targets the separate Meta Worker; do not deploy it over the production Skopje site. GitHub publication of `feature/tilburg-netherlands` was authorized on November 2. The production deployment remains unchanged; pushing this branch does not deploy it.
