# Tuka · Meta Hackathon build

This branch (`codex/meta-hackathon`) is the protected judging build at **https://tuka.meta-cerebralvalley.rand0m.net**. It keeps the existing Skopje transit experience intact while adding a reusable city/provider layer and a grounded Meta AI assistant.

## What exists today

Tuka is a working Skopje transit PWA with JSP/Modeshift schedules and live data, map-based stops, route filtering, walking-aware journey planning, saved commutes, service alerts, offline timetable basics, JSP news, language selection, dark mode, and a local QR-card wallet. The existing planner already supports leave-now, leave-at, arrive-by, walking speed, transfer buffer, fastest, fewest transfers, and least walking preferences.

## What this branch adds

- A city/provider registry with explicit timezones, data capabilities, and provider status.
- A second-city GTFS adapter profile for Boston using the official MBTA GTFS feed, kept separate from Skopje’s live provider.
- A city profile panel that makes scheduled versus realtime coverage visible to judges, with Boston as the featured demo. Boston uses the official MBTA GTFS snapshot for its map and schedule, and the MBTA V3 API for live predictions and vehicle positions when available.
- A Boston route explorer: choose a route to filter the map, search the stop inventory, select a stop, and compare scheduled departures with live MBTA results.
- Tuka Copilot through the Meta Model API. The model is server-side only and can call verified city-context tools, including the selected Boston stop and its live MBTA check; it must say when a live result is unavailable and cannot invent departures or guarantees.
- A separate Cloudflare Worker, custom domain, observability, and a real session-cookie login page for the judging build. Existing `tuka.rand0m.net` and the closed Hacktoberfest host are left unchanged.

## Run and test

```sh
npm test
npm run build:meta
```

For local Meta Worker testing, provide `META_AUTH_PASSWORD` and `MODEL_API_KEY` as local secrets. The deployment config keeps the judge username in a non-secret variable; both the judge password and Meta token are provisioned as Wrangler secrets and are intentionally not committed. After signing in, open **Meta Copilot**, choose **Boston**, click a route or stop, and inspect the scheduled/live split.

## Deployment

```sh
npm run build:meta
wrangler deploy --config wrangler.meta.jsonc
wrangler secret put META_AUTH_PASSWORD --config wrangler.meta.jsonc
wrangler secret put MODEL_API_KEY --config wrangler.meta.jsonc
```

The judge login is supplied separately to the judging team; credentials are not stored in this repository.
