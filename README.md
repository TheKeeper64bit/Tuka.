# Tuka · Skopje
English personal JSP PWA, with a map-first home screen.

## Flow
Stops: the app locates you automatically; select a stop on the map or in the nearby list. Starting location is locked by default. Use Correct location to temporarily enable dragging/tapping a correction pin, then save or cancel. Stop direction markers remain separate. Select bus-number chips to filter both arrivals and vehicle positions. Bus lines: every route in the current JSP feed, searchable by number, with route geometry, directions, stop lists and only that route's live vehicles. Journey: the confirmed origin stays fixed; search or drag a separate red destination pin, then compare earliest-arrival trips with up to two transfers. Saved stop stars remain device-local.

## Data and privacy
Public JSP/Modeshift GTFS schedule and combined realtime feed:
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfs/gtfs.zip
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfsrt/tripupdates.pb

The combined realtime feed includes both trip updates and vehicle positions. September 30, 2026 testing: 1,419 stops, 106 routes and 161 vehicle positions (160 matched to scheduled trips). Only GPS positions within 120 seconds of the device time are displayed. Stop filtering additionally requires a matching trip serving that stop and checks the reported stop sequence where available. Vehicles are not inferred from the timetable. Feed polling runs every 30 seconds while visible. The schedule reloads on opening, with a cached offline fallback; calendar and exceptions control service validity. Live arrivals fall back to scheduled times when fresh updates are missing.

MapLibre 5.6.2 is bundled locally; the modern vector basemap comes from OpenFreeMap, with map attribution retained. Photon place search receives entered address queries and a fixed Skopje bias, not the GPS origin. It searches building/street variants and separates missing house numbers from exact mapped matches. Unit numbers may not exist in map data. No invented address locations. Red map pin placement is always available. Coordinates and favourites are kept in the browser; no account, analytics or location storage on our servers. Map tiles and place queries go to their respective providers.

## Journey limits
Earliest-arrival rounds compare walking access, waiting, rides, transfers and walking egress. Up to three bus rides, transfer walks within 250m, and a two-minute connection buffer. Access/egress stops within 800m. Walking times use straight-line distances multiplied by 1.3 at 75m/min, without pedestrian street routing or crossing verification. Real-time updates are used at individual stops when fresh and matching; timetable estimates fill gaps. Rankings are estimates, not guaranteed connections. No ticketing or push notifications.

## GitHub Pages
Upload the source to a GitHub repository. Choose Settings → Pages → GitHub Actions. The included workflow publishes `dist/` on pushes to `main`. Relative local asset paths support repository subpaths. Remove `.openai/hosting.json` if using only GitHub Pages. A public repository and Pages URL can be viewed by others; favourites and location remain local. Requires HTTPS for geolocation/PWA installation and a recent browser with WebGL and DecompressionStream(deflate-raw).

## Validation
JavaScript syntax, actual schedule and realtime parsing, vehicle coordinates, all 106 rendered line entries, origin confirmation flow, independent destination pin, stop selection and tab navigation checked. Routing regression verifies an immediate 17-minute transfer journey outranks a 50-minute direct journey, and rejects a connection with less than the two-minute buffer. Full visual testing on a physical phone remains necessary.

October 1 refresh: standalone Tuka wordmark (no repeated initial), floating map controls and navigation, quieter vector map, larger stop tap targets. Stop selection keeps the map visible, immediately opens arrivals, refreshes GPS and fits the selected stop plus up to eight nearest matching vehicles in view. Scheduled arrivals render before the realtime request completes. Schedule requests time out after 12 seconds and fall back to an existing cached feed; realtime requests time out after 10 seconds. Auto-GPS/correction/stop-tap flows tested with a DOM/map stub and explicit schedule fixture; full phone visual testing remains necessary.
