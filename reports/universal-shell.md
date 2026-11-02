# Universal GTFS shell

## Contract

A network provides metadata (`id`, name, agency label, time zone, center, bounds, capabilities) and a normalized schedule (`stops`, routes, trips, ordered stop times, calendars, exceptions, shapes and transfers). The map, departure reader and planner use that contract. Built-in providers retain optional live, news, ticket and compiled-asset integrations; imported profiles have the `scheduled` capability.

## Import and storage

1. Choose a ZIP and optional network name. No server upload is involved.
2. A module worker reads relevant GTFS tables, validates the schedule and derives its profile. A review shows counts, published coverage, time zone and diagnostics.
3. IndexedDB saves the complete ZIP and profile in one transaction. Registration happens only after that transaction succeeds. Invalid feeds and storage failures leave the current network available.
4. A content SHA-256 identifies the first installation and each feed version. Explicitly updating an existing imported network keeps its original network ID and saved-state namespace. Version-aware loading bypasses the old in-memory schedule.
5. Profiles are restored before startup selection, shared-link parsing or offline loading. The city picker lists built-in and imported networks without depending on `/api/cities`.
6. Removing an inactive import deletes its stored ZIP and profile. Saved stops/commutes remain namespaced for a later reimport. The active or currently loading network cannot be removed.

Favorites, commutes, Home/Work and downloaded schedules remain separate even when different feeds reuse the same GTFS identifiers. A local share URL does not distribute the ZIP; recipients need the matching installed network. Uninstalled import links request installation instead of opening Skopje.

## Supported schedule behavior

- Multiple agencies in the GTFS-required common agency time zone; original identifiers, Unicode names, native-script search and all supplied route types.
- Calendars and exceptions, service times beyond 24:00, ordered stops, pickup/drop-off rules, inherited station coordinates, validated shapes and clearly marked stop-outline fallback.
- Frequency templates expanded within browser limits. Non-exact frequency departures are explicitly estimates. Missing intermediate timepoints are interpolated between timed stops.
- Stop-to-stop minimum/forbidden transfers, parent-station matching and trip/route-specific transfer restrictions in both departure and arrival-deadline planning. Published transfer endpoints can extend the ordinary nearby-stop search.
- Planning up to two transfers with the existing four-hour horizon, arrival deadlines, walking preferences, ride guidance and saved-state behavior.

## Boundaries

- 50 MB compressed, 200 MB expanded, at most 512 ZIP entries, and at most 50,000 frequency runs / one million generated frequency stop calls. ZIP64, encrypted and multi-volume archives are unsupported. Oversized regional/national feeds need a smaller export or a future compiled partition.
- Fixed-route GTFS Schedule is the implemented baseline. Flexible booking, GTFS-Flex, fare calculation, pathways and guaranteed in-seat continuation are not modeled. Walking geometry remains approximate for local imports. This is not a full GTFS conformance certification or a guarantee that every valid extension is supported.
- Static GTFS does not discover or authenticate realtime feeds. Imported schedules do not call Skopje/MBTA/OVapi, news, passenger-report or Copilot services. Live connections require a separate optional integration. Maps and address search still use their normal external services.
- Browsers can evict local storage, and private browsing may limit it. Keep the original source ZIP. Removing browser storage removes local imports and saves.
- A managed global feed catalog, automatic refresh, remote feed hosting and cross-network journeys are future work. Built-in snapshot compilation remains available for the pilots.

## Verification

- 184 Node tests plus standalone regression checks passed, including existing Skopje/Boston/Tilburg behavior.
- Controlled browser checks at 320, 390 and 1280 pixels cover worker review, import, native stop search, route/journey selection, saved state after reload, duplicate IDs across networks, switching back, removal, failed imports, version updates preserving saves, offline reading and capability fallback. No page errors.
- The public Metlink feed was downloaded from the operator-linked URL, then imported without provider code: 3,123 served stops, 245 routes, 10,080 trips, 568 shapes and 22 agencies. All trips survived normalization. A scheduled transit journey and published geometry were verified. The 390-pixel browser check covers worker import, route selection and reload. See `imported-metlink-check.json` and `metlink-import-browser-check.json`.
- Browser captures use a neutral basemap because external street tiles are not reliable in this environment. This does not constitute a field journey or live-service verification.
- Meta build and Wrangler deployment dry run pass. Production deployment is not performed by these checks.

Official source: https://www.metlink.org.nz/legal/general-transit-feed-specification
Feed: https://static.opendata.metlink.org.nz/v1/gtfs/full.zip

## Reproduce an independent feed check

Download an operator's public GTFS ZIP, then run:

```sh
node scripts/check-imported-feed.mjs /path/to/feed.zip "Network name" 2026-11-03
```

Choose a date in that feed's published calendar. The command reports derived coverage, normalization counts, a sample departure/journey and geometry status without editing the city registry. It does not upload or modify the original ZIP.
