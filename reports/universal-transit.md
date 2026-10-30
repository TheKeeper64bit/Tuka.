# Universal transit implementation · 29 October 2026

## Actual failure

Boston was rendered as a separate snapshot/test-location view. Its stops, route catalogue and live results did not replace the normalized `db` used by the main application. Consequently Bus lines and the existing journey planner still read Skopje trips. A sampled snapshot also lacked the complete calendar-aware timetable needed to calculate departures reliably. This was a data-flow problem, not merely missing map styling.

## Implemented flow

1. `city-providers.js` selects static/realtime sources, bounds, center, time zone and refresh policy.
2. Skopje downloads its existing ZIP. Boston loads a compact, lossless bus-only representation built from the official ZIP, retaining original IDs, calendars, calls and shapes.
3. `gtfs.js` normalizes either representation into the same stops/routes/trips/times/calendar indexes. It sorts sequences and rejects broken trips as whole units. Recently used call lists are materialized on demand to avoid retaining millions of JavaScript objects.
4. `app.js` replaces the shared database and city-specific saved state atomically after loading. Old route selections, vehicles, planner endpoints and overlays are cleared. Request generations prevent late responses from restoring an old city.
5. `stop-network.js` follows individual directional trips. `map-ui.js` validates extent, length, ordered stop proximity and direction before drawing a published shape. Distinct variants are preserved; approximate geometry is marked.
6. `schedule.js` and `planner.js` use agency time zones, active calendars, exceptions and extended times. GTFS service origins use local noon minus twelve hours, including DST dates.
7. The protected Worker proxies only fixed official MBTA protobuf feeds. `transit.js` validates freshness and resolves predictions to exact trips, stop sequences and service dates; unknown or stale vehicles are omitted. Vehicle GPS alone does not create an ETA.

## Feed evidence

The companion JSON reports include source hashes, timestamps, required/optional files, reference integrity, rejected trips, shape coverage, active service IDs, selected-stop departures, and realtime freshness/matches. They are point-in-time diagnostics, not uptime promises.

| Check | Skopje | Boston bus subset |
| --- | ---: | ---: |
| Stops | 1,430 | 7,081 |
| Routes | 107 | 369 |
| Source trips | 4,090 | 87,003 |
| Usable trips | 4,090 | 86,996 |
| Stop calls | 105,328 | 2,486,683 |
| Valid published-geometry trips | 3,882 | 85,985 |
| Approximate-geometry trips | 208 | 1,011 |
| Invalid shape patterns rejected | 10 | 13 |
| Missing shape patterns | 4 | 0 |

Neither feed had missing route/stop references or invalid stop coordinates in this sample. Boston's seven rejected trips are named single-stop sample shuttles. The Boston snapshot includes future and special services; the full route catalogue must not be interpreted as today's operating fleet. The bundled MBTA calendars cover 20 October–12 December 2026.

## Validation

- Existing regression checks cover authentication, public/private builds, Skopje arrivals and merging, planner preferences and transfers, walking bounds, ride guidance, map geometry, saved filters, languages, offline behavior, tickets and news.
- Two new city fixtures cover distinct IDs/time zones, both route directions, missing/reversed shapes, calendar exceptions, after-midnight trips, static-only departures/planning and arrive-by results.
- Additional tests cover exact realtime sequence matching, stale/unmatched vehicles, DST wall-clock input, city-isolated storage, Boston shared links, untimed calls, bounded provider endpoints, and delayed city-load/realtime responses.
- A real Boston timetable smoke check produced a route 47 journey from Washington St opp Ruggles St to Broadway. Stop 1 exposed eleven directional patterns with validated published geometry in that feed.
- Final `npm test`: **147 Node test cases passed**, plus all seven standalone regression scripts, including the expanded shared-screen/race checks. The Meta asset build passed.
- Headless Chrome exercised the actual protected login and built frontend with the official Boston schedule and live feeds. Boston showed 369 lines; route 1 rendered its geometry and live bus markers. Stop 1 displayed six boarding routes, 100 reachable stops, official alerts and live ETA rows. The number of live vehicles varied with the feed.
- At 390 × 844 pixels the selected-stop screen had no horizontal overflow. Switching back restored 107 Skopje lines; returning to Boston restored 369. A fresh `?city=boston&stop=1` link opened Washington St opp Ruggles St. No uncaught page JavaScript errors occurred. Map tile requests cancelled during city transitions were expected; the separate passenger-report DNS failure is noted below.

## Remaining limitations

Road routing is optional and currently unconfigured; the validated stop outline is an explicit fallback. The Meta Worker has no walking-cache D1 binding, so street walking refinement is unavailable there. Boston static feed refresh is a build step; no automated schedule updater was added. Incomplete timetable times are never interpolated. Supabase passenger reports are an existing Skopje service and its DNS was unavailable during browser testing.

No deployment or push was performed. The production site remains unchanged.

## Route colour follow-up

The browser's map style validator rejected a feature-dependent `line-dasharray` expression. The GeoJSON routes existed, but only their pale halo rendered. Published paths and approximate paths now use separate solid/dashed layers supported by the bundled MapLibre version. Colours are assigned across the full set of boarding routes before filtering, avoiding palette collisions at a stop and keeping filters, departure badges and paths consistent. Regression checks cover the layer configuration and stable distinct colours when routes are filtered.
