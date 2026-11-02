# Tilburg pilot implementation record

Date: October 30, 2026. Branch: `feature/tilburg-netherlands`.

The goal is a locally testable Tilburg implementation of the supplied October 30–November 4 roadmap. No global data library, production deployment or tested-release tag has been created. On November 2 the user authorized pushing the completed implementation to this branch.

## Phase 0 — protected baseline

- `c185f57` on `backup/five-city-wip-20261030` preserves the previous shared-engine work and unfinished five-city expansion.
- `6651c56` freezes the Skopje/Boston baseline on this pilot branch. The three unfinished extra providers and their assets are removed here, preserved on the backup branch.
- Baseline: 147 Node test cases and all standalone regression scripts passed. Full output: `baseline-tests.txt`.

Single-city assumption audit:

| Area | Handling on this branch |
| --- | --- |
| `city-providers.js`, `meta-catalog.js` | Tilburg provider, Amsterdam timezone, detection area, regional bounds, capabilities and approved notice sources. Registry drives city selection. |
| `transit.js`, `gtfs.js`, `schedule.js` | Shared normalized timetable; separate national feed adapter; dated calendar/after-midnight behavior retained. Skopje supplemental live integration remains intact. |
| `app.js`, `meta.js` | Switch actual database, clear old maps/requests, persist manual selection, optionally select network with GPS. Opening Copilot no longer changes the city. |
| `news.js` | City-scoped sources and timezone, late-response guard, operator validity instead of fabricated publication dates. Tilburg notices refresh at 30-second intervals while open. |
| Saved/Home/Work/shared links | Existing city-scoped storage reused. Walking limit retained in saved and shared journeys. |
| `offline.js` | Offline reader defaults to the last selected city when no explicit link city is supplied. No live information is claimed offline. |
| Tickets | Skopje-specific ticket button hidden in other cities. |
| Routing/search | Existing city bounds govern place searches and routing validation. Street walking refinement still needs the existing D1 binding; approximate walks remain labelled. |
| Attribution | Tilburg map credits OVapi and the shape licence; original licence metadata retained in the asset. |

## Phases 1 and 2 — static feed, map and planner implemented

Source SHA-256, filtering bounds, operators and counts are recorded in `ingestion.json`.

The pipeline streams the nationwide stop-times twice: first to select relevant routes and their regional connections, then to retain every call of every selected trip. Selection does not clip a trip at a municipal or partition boundary. All selected routes, trips, stops, parent stations, shapes, service exceptions and applicable transfer records are carried into the shared compiler.

The resulting asset contains 100 routes, 16,873 trips, 407,058 stop calls, 2,606 stops used by bus trips and 625 parent records. There are 251 retained records outside the connection rectangle. All trip/route/stop references passed validation. The source uses `calendar_dates.txt` rather than `calendar.txt`.

`verify-netherlands.py` independently compares every retained call with the original national ZIP: identifiers, stop sequence, arrival/departure seconds, pickup and drop-off restrictions. `source-verification.json` records zero mismatches, with 6,109 calls at or beyond 24:00.

The shared planner passed university → Centraal, Reeshof → ETZ Elisabeth (transfer), and arrive-by checks. Every bus leg's time is checked against the corresponding original service-date call. Source-expired dates do not fabricate service. Maximum total walking time is applied to actual estimated walking legs, excluding transfer waiting buffers.

Shape validation accepts published geometry for 15,719 trips. The other 1,154 trips use labelled approximate outlines: 41 unique patterns have no shape and 3 fail validation. No guessed road geometry is presented as exact. The selected Centraal platform exposes five distinct route colors, with the same colors on its route controls.

The regional snapshot contains **zero applicable explicit transfer rows** after filtering the national records by retained stops/routes/trips. Transfer journeys use the existing nearby-stop graph (250 m), the user's minimum buffer, and up to three bus rides. Transfer rules from other modes were not fabricated or imported as bus transfers.

## Phase 3 — conditional live information implemented

`server/netherlands.js` filters the national protobuf feeds by retained trip, route and stop identifiers before serving them. The original entity bytes and timestamps are preserved. The exact numeric trip IDs observed in the live feed match the static timetable; no speculative alias matching is used.

The initial fresh diagnostic matched 1,216 national live trip IDs to this regional dataset, yielding 10,604 usable stop updates, and 297 usable vehicle records. Counts fluctuate; they are observed snapshot counts, not promises of continuous coverage. Later browser checks also displayed actual tracked buses and live ETAs at Tilburg Centraal.

Vehicles require fresh timestamps, valid coordinates, matching trip/route, active service date and consistent stop sequence. Tilburg rejects positions more than 1.5 km from the trip's shape/stop corridor. Records older than 120 seconds are not live. Missing live data is not treated as a cancellation.

National URLs are fixed server-side, response size is bounded, and feeds are cached for 30 seconds. Operational notices reuse the alerts feed. This matters because OVapi returned HTTP 429 on immediate duplicate fetches during investigation. Client responses remain private behind the existing session login; the internal Cache API stores a reusable public-source copy.

## Phase 4 — official disruption layer implemented, field testing pending

The adapter retains only regional GTFS-RT alerts, drops expired validity periods, preserves original advice, and deduplicates title/description pairs. The UI matches selectors to actual stops/routes/trips and shows source-supplied advice. Missing alerts do not imply normal service.

No article publication time is invented: GTFS-RT supplies validity and feed freshness, not publication dates. Dutch notices remain in their original language unless the provider supplies English. No unverified translation changes operational advice.

The feed often omits a direct article URL. In that case the UI links the Bravo operational-notices portal; it must not imply this is a recovered deep link. The roadmap's specific Line 5/Besterdring case remains an external acceptance case. An inaccessible Arriva webpage was not scraped around its restrictions, and no synthetic notice was created to satisfy the example.

## Phase 5 — constrained Meta handoff implemented, live-provider check pending

A dedicated authenticated endpoint requests one structured `plan_transit_journey` tool call. It validates supported places, mode, date/time, preference and walking limit, and rejects extra fields such as invented trip IDs. It accepts no model itinerary as a journey result.

The client resolves places against current-city stops, asks the rider to choose among matching platforms, and exposes the interpreted constraints in the standard planner. If no exact stop matches, the existing address search/pin remains available. The rider presses Find journeys; the existing deterministic engine produces the actual cards and explanations. This uses the existing Meta integration; no secondary model provider was added.

Automated tests cover the tool contract and invalid constraints. Browser testing uses a mocked interpretation response with real Tilburg schedule planning. **A real provider round trip is not yet verified locally: the user will add Meta and Baseten tokens later.** Add `MODEL_API_KEY` through the ignored `.env` (`npm run dev:meta`) (never commit it). Model-generated explanations beyond the deterministic result cards are deferred until the live integration is accepted.

## Phase 6 — automated checks complete; external acceptance pending

`tests/tilburg-check.mjs` adds dataset, source-date, direct/transfer/arrive-by, walking constraint, route color, storage isolation, realtime filtering, stale/distant position, notice expiry, AI-contract and cross-city news race checks. Existing Skopje/Boston checks continue to run. See `tests.txt`, `browser-checks.json`, and screenshots in this directory.

Your friend must still verify these in Tilburg:

- [ ] Open Tilburg, locate nearby stops and verify positions on the street.
- [ ] Compare a displayed route against the actual bus route.
- [ ] Travel to Tilburg Centraal using a suggested journey.
- [ ] Test a real transfer and assess its margin.
- [ ] Compare scheduled versus live arrivals with the stop/bus display.
- [ ] Check an active operator disruption, especially Line 5 if applicable.
- [ ] Check an alternative around a cancelled/skipped stop.
- [ ] Test the live Meta request with a real start, destination and deadline.
- [ ] Report incorrect stops, routes, times, geometry or missing live coverage.

Requested but not yet supplied: the tester's actual start/destination stops or landmarks and arrival deadline. Automated candidate journeys are not a substitute for these field checks.

## Phase 7 — not released

Docs, evidence and source attribution are recorded. Fixes from field testing, the final demo recording, release tag and submission remain pending. Do not call Tilburg “finished” or start global expansion before acceptance. The user authorized the GitHub branch push on November 2. Deployment to the password-protected Meta host remains a separate action.

## Sources and attribution

- Static: <https://gtfs.ovapi.nl/nl/gtfs-nl.zip>, feed version 9652, service range 2026-10-29 through 2026-12-12.
- Live: <https://gtfs.ovapi.nl/nl/tripUpdates.pb>, <https://gtfs.ovapi.nl/nl/vehiclePositions.pb>, <https://gtfs.ovapi.nl/nl/alerts.pb>.
- Official operational guidance: <https://www.bravo.info/reizen/omleidingen-en-storingen-bus> and <https://www.arriva.nl/plan-je-reis/storingen-en-werkzaamheden/>.
- Retained operators: `BRAVO:ARR`, `DELIJN`, `IFF:NS`, `RRREIS`. These include connecting and replacement bus services; the partition is bus-only.
- The source `licenses.txt` declares CC0-1.0 for general tables and ODbL-1.0 for `shapes.txt`. Original metadata is retained. The derived regional database and compiled shape data are supplied under the applicable source licences; source and build commands are available above and in README. ODbL: <https://opendatacommons.org/licenses/odbl/1-0/>; CC0: <https://creativecommons.org/publicdomain/zero/1.0/>.
- Ticketing tables marked CC-BY-NC-ND-4.0 in the source metadata are **not** included in this partition.
- Map tiles retain their existing OpenFreeMap/OpenStreetMap attribution.

The dataset is a build-time snapshot. Rebuild the binary and its regional realtime index together when publishing a new source feed. Live updates do not extend the published static service calendar.

## November 2 verification and publication

- Full suite: 158 Node test cases pass, plus all standalone map, geometry, ride and screen regressions.
- Browser checks pass for manual persistence, location-based network selection, Boston/Tilburg data and Saved isolation, five distinct route colors, 16 official notices returned during the check, and a 390 × 844 phone viewport. No JavaScript page errors were reported. Browser service workers were disabled for instrumented app inspection; the separate offline regression suite passed.
- Mocked Meta interpretation was handed to the actual Tilburg planner for a future arrive-by journey with a ten-minute total walking limit. A real token call remains intentionally deferred.
- `npm run build:meta` and Wrangler Worker bundling with `--dry-run` pass. No deployment was performed.
- `.env` is prepared locally, ignored, and explicitly loaded by `npm run dev:meta`. Only the blank `.env.example` is tracked. Existing `.dev.vars` remains ignored. Baseten is a reserved token field, not an enabled integration.
- Publishing this branch is authorized. The main branch and production sites are not changed.
