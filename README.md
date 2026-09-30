# Тука · Скопје
Personal location-first JSP PWA, in Macedonian. Opens on nearby stops and arrivals, with opposite directions kept as separate stops. Requires HTTPS for location and installation. No accounts or location uploads.

## GitHub Pages
Upload this repository to your GitHub account. In Settings → Pages choose GitHub Actions. The included workflow publishes `dist/` on pushes to `main`. All local asset paths are relative, so repository subpaths work. GitHub Pages publishes a reachable URL; local favourites and location stay on your device. Source code in a public repo is public. Remove `.openai/hosting.json` if using only GitHub Pages.

## Data
Schedule ZIP and GTFS-Realtime from the publicly listed JSP Modeshift feeds:
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfs/gtfs.zip
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfsrt/tripupdates.pb
Tested September 30, 2026: both returned 200 and allowed the supplied browser Origin. 1,419 stops, 106 routes and 4,133 scheduled trips. Feed contents and access may change. Schedule is fetched when the app opens, with a cached offline fallback. Calendar and calendar exceptions govern service dates. No fabricated arrival data. Realtime is polled every 30 seconds while visible; only timestamps within 120 seconds of the current time are treated as live. Scheduled service is shown when live data is unavailable, stale or unmatched. Walking distances are straight-line estimates, not pedestrian routing.

## Features and limits
Nearby stops within 1.2km; map pin selection; stop/line/destination search; local favourite stops; stop arrival boards; trip stop lists; light/dark theme; installable PWA. The planner searches location-to-destination journeys with zero, one or two transfers and transfers up to 250m apart. It is a first version: no guaranteed connections, street-aware walking, push notifications or tickets. GPS cannot reliably determine the correct side of the road. Destination/direction labels and separate nearby stops help the rider choose.

The map uses Leaflet from unpkg and OpenStreetMap tiles. Map requests go to those providers. Transit feed requests go to Modeshift. Place search uses the public Photon geocoder; entered searches are sent to that service with a fixed Skopje search bias. Location coordinates are used in browser memory and are only sent to Google Maps when the rider explicitly opens walking directions.

## Local use
Run a static HTTP server in `dist`, e.g. `python -m http.server 8000`. Geolocation works on localhost or HTTPS. A recent browser supporting DecompressionStream(deflate-raw) is required. No build or package installation needed.

Destination search and map pins feed an earliest-arrival round-based planner. Walking access/egress cover stops within 800m, with a 1.3 distance multiplier. Up to three rides, transfers within 250m and a two-minute connection buffer. All candidate journeys are ranked by arrival time from now, not by number of transfers. Updated times at downstream stops are used when available; timetable estimates fill gaps. Walking geometry is not street-aware and therefore route choices remain estimates.
