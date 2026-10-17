# Tuka · Skopje
Public JSP journey-planning PWA for Skopje, with a map-first home screen and Македонски, Shqip and English interfaces.

## Flow
Stops: the app locates you automatically; select a stop on the map or in the nearby list. Starting location is locked by default. Use Correct location to temporarily enable dragging/tapping a correction pin, then save or cancel. Stop direction markers remain separate. Select bus-number chips to filter both arrivals and vehicle positions. Bus lines: every route in the current JSP feed, searchable by number, with route geometry, directions, stop lists and only that route's live vehicles. Journey: the confirmed origin stays fixed; search or drag a separate red destination pin, then compare earliest-arrival trips with up to two transfers. Saved stop stars remain device-local.

## Data and privacy
Public JSP/Modeshift GTFS schedule and combined realtime feed:
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfs/gtfs.zip
https://www.modeshift.app/api/v1/9814b106-2afe-47c8-919b-bdec6a5e521e/transport/gtfsrt/tripupdates.pb

The combined realtime feed includes both trip updates and vehicle positions. September 30, 2026 testing: 1,419 stops, 106 routes and 161 vehicle positions (160 matched to scheduled trips). Only GPS positions within 120 seconds of the device time are displayed. Stop filtering additionally requires a matching trip serving that stop and checks the reported stop sequence where available. Vehicles are not inferred from the timetable. Feed polling runs every 30 seconds while visible. The schedule reloads on opening, with a cached offline fallback; calendar and exceptions control service validity. Live arrivals fall back to scheduled times when fresh updates are missing.

MapLibre 5.6.2 is bundled locally; the modern vector basemap comes from OpenFreeMap, with map attribution retained. Photon place search receives entered address queries and a fixed Skopje bias, not the GPS origin. It searches building/street variants and separates missing house numbers from exact mapped matches. Unit numbers may not exist in map data. No invented address locations. Red map pin placement is always available. Saved places, favourites and commutes stay in the browser; no personal Tuka account is required on the public site; the custom-domain site requires browser approval. Map tiles and place queries go to their respective providers. Selecting a journey sends its walking-leg endpoints to the routing service through Tuka; the resulting public paths are cached for 24 hours as described under Pedestrian routing.

## Journey limits
The planner compares walking access, waiting, rides, transfers and walking egress across up to three bus rides, with transfer walks within 250 m and access/egress stops within 800 m. Walking speed and the minimum transfer buffer are adjustable; the default buffer is three minutes after walking. Initial walking estimates use straight-line distance multiplied by 1.3, then selected journeys request pedestrian paths where available. Fresh matching predictions update current journeys; future journeys use the selected service date and timetable. Rankings and connections remain estimates. Tuka shows official ticket fares and purchase links but does not issue tickets or send push notifications.

## Two deployment targets

- https://tuka.rand0m.net uses the original request-access flow. An owner-approved code is required for each browser; sessions, resend limits and sign-out remain enabled.
- https://thekeeper64bit.github.io/Tuka./ is the public GitHub Pages target, with no access page or custom domain. Publishing is configured by the Pages workflow.
- https://tuka-public-api.ignatij-tasevski.workers.dev serves only the read APIs needed by Pages. It does not serve the app, accept accounts, send codes, process payments or expose private sessions.

The public frontend source lives in dist/. The private build copies it into .build/private, adds the login/session files from private/, enables authentication before offline preparation, and adds sign-out. The public Pages build uses an explicit allowlist to produce .build/pages, without login files, secrets, Worker code or CNAME.

Both Worker backends share the existing AUTH_DB binding (database tuka-access) for news caching, Gemini refresh limits and walking caches/budgets. The custom-domain Worker additionally uses the original approval tables and AUTH_SECRET. The public API strips incoming credentials and only permits cross-origin browser reads from https://thekeeper64bit.github.io.

### Local development

Use Node 24 or later, npm ci, and copy .dev.vars.example to .dev.vars. Set a fresh local AUTH_SECRET of at least 32 characters for approval codes. GEMINI_API_KEY is optional for generated news summaries; without it, the feed can display official originals. Never commit these values. PUBLIC_ORIGIN defaults to http://localhost:8787 in the example.

Apply local migrations with npx wrangler d1 migrations apply tuka-access --local, then npm run dev. Wrangler runs the private build automatically. Local code delivery is simulated in .wrangler/tmp/email/. npm run access -- list and npm run access -- revoke <id> manage existing production browser approvals.

### Publishing

Apply pending production migrations with npx wrangler d1 migrations apply tuka-access --remote. npm run deploy builds and publishes the protected custom-domain site. Keep its existing AUTH_SECRET and server-only GEMINI_API_KEY configured as Worker secrets; do not rotate the access secret as part of a routine release.

npm run deploy:public-api publishes the separate read-only API Worker. Configure GEMINI_API_KEY there as a Worker secret. Its shared D1 limits apply across both sites.

Set the GitHub repository variable TUKA_API_BASE to https://tuka-public-api.ignatij-tasevski.workers.dev. The Pages workflow tests the app, creates .build/pages and deploys it on pushes to main. Pages must use GitHub Actions as its source and have no custom domain. A manual local build uses TUKA_API_BASE=https://tuka-public-api.ignatij-tasevski.workers.dev npm run build:pages. The generated config contains only the public API origin.

The repository path is retained in shared links, offline-reader URLs, service-worker scope and installation metadata. No static-hosting proxy or approval cookies are needed for Pages. The custom-domain deployment continues to require access for its app assets and transport APIs.

Run npm test for access, deployment separation, Pages subpath, API CORS, transit, storage, offline and UI regressions. The full suite passes for the deployment split. Production checks confirm that anonymous custom-domain requests redirect to login and protected assets/APIs return 401. The Pages API serves news, fares and walking routes with the expected GitHub origin, rejects other browser origins, and exposes no authentication routes.

October 17 deployment: protected Worker version `1f68600b-335a-4fb5-910d-cdbc3391d953`; public API Worker version `f94ea47e-fd8b-430b-ba7b-9829becd849a`. The public Pages build is ready, but GitHub rejected Pages activation for this private repository under the current account plan. Publishing requires an owner-approved visibility change or an eligible GitHub plan; the Pages URL is not yet live.

## Validation
JavaScript syntax, actual schedule and realtime parsing, vehicle coordinates, all 106 rendered line entries, origin confirmation flow, independent destination pin, stop selection and tab navigation checked. Routing regression verifies an immediate 17-minute transfer journey outranks a 50-minute direct journey, and rejects a connection with less than the two-minute buffer. Full visual testing on a physical phone remains necessary.

October 1 refresh: standalone Tuka wordmark (no repeated initial), floating map controls and navigation, quieter vector map, larger stop tap targets. Stop selection keeps the map visible, immediately opens arrivals, refreshes GPS and fits the selected stop plus up to eight nearest matching vehicles in view. Scheduled arrivals render before the realtime request completes. Schedule requests time out after 12 seconds and fall back to an existing cached feed; realtime requests time out after 10 seconds. Auto-GPS/correction/stop-tap flows tested with a DOM/map stub and explicit schedule fixture; full phone visual testing remains necessary.

October 1 map correction: fixed the vehicle badge overriding MapLibre absolute positioning, which caused full-width bus bars. Explicit dimensions keep badges at 44–72px wide and 38px tall. A clearer Liberty street basemap uses one preferred English/Latin label instead of repeated bilingual labels. Unselected stops appear only at zoom 14+, with the chosen stop highlighted at every zoom. Default overview includes GPS buses within 2.5km; the bus button explicitly fits all matching tracked vehicles. Every arrival separately labels live ETA/timetable and whether that exact incoming trip has fresh GPS. Stop 52 snapshot checked: earlier line 7 had timetable data but no GPS for its incoming trip; line 33 had both. Verified using actual feeds plus a DOM/map stub.

## Combined live sources (October 1)
Modeshift remains the schedule and primary live-trip source. The same-origin transport worker adds public Skopska/Trans Info data through its normal anonymous guest session. It exposes only fixed read endpoints, caches network metadata for an hour and live snapshots for ten seconds, and never receives the user's GPS location. Source sessions remain on the server. The current `server/cloudflare.js` entrypoint delegates these read endpoints to the transport Worker.

Additional GPS requires fresh position and vehicle-status timestamps, COURSE_EXECUTE status, an unambiguous bus-number mapping, a complete stop pattern matched by stop code and proximity, a reported sequence within the path, and a position within 350m of that path. Fresh Modeshift vehicles win same-label conflicts. Skopska delay updates affect the journey planner only when exactly one active GTFS trip has the same complete stop pattern and departure within one minute, and position/status timestamps agree within 30 seconds. Skopska stop predictions are labeled separately and never silently assigned to a GTFS trip. Nearby duplicate main-feed live arrivals are retained; nearby timetable rows are replaced by the source's prediction. Both sources fail independently, with timetable fallback when neither supplies fresh data. Backend API responses are never stored by the service worker.

The historical `scripts/build.mjs` packages the old Sites Worker. The current Cloudflare entrypoint protects the custom-domain application assets and API routes with request-access. GitHub Pages uses a separate public frontend build and read-only API Worker. Use the deployment commands described above rather than the historical build.

October 1 map/route repair: applied a quiet neutral street palette consistently to all maps, with a soft blue river and muted green parks. Map headings and controls sit above GPS badges. Vehicle markers are retained by physical label between refreshes instead of removed and recreated; fresh supplemental positions remain visible while the primary feed updates. Selecting a stop stays at local street zoom. The home map draws one relevant route using published GTFS shapes, and tapping a vehicle selects its route. Missing shapes are explicitly labeled as a stop outline. Line-detail markers now match the selected direction. Map geometry, overlay clearing, marker identity, stop selection, and line-detail rendering are checked with fixtures and a DOM/MapLibre stub; physical-phone visual QA remains unverified.

October 1 station network view: selecting a boarding stop shows all directional downstream routes and their reachable stops instead of automatically choosing the next arrival's line. The selected station stays fixed when another reachable stop is tapped; the target panel lists direct bus numbers and filters arrivals/GPS by the exact trip's ordered stop pattern. Pickup/drop-off restrictions and already-passed boarding stops are excluded. Shape geometry is clipped to start at the boarding stop, repeated timetable trips are deduplicated into route patterns, and colored line chips match map routes. Show all routes clears the destination/filter and fits the full network. Show live buses fits every fresh, confirmed approaching vehicle without the prior six-bus limit. A live-vehicle list provides access to buses whose badges overlap at city zoom. Latest real-feed Rekord east audit: 29 lines, 32 patterns, 178 reachable stops, all geometry starts within 150m of the selected station. Directional, restriction, destination, marker persistence and screen interaction checks passed; no claim of complete GPS coverage or phone visual perfection.

## ChatGPT Work version 17 sync — October 9, 2026

Merged cloud source `57e29934a14b5dd19c303e6e927e735176284048` (version 17), including journey route/transfer maps, late-boarding and GPS-resume tracking improvements, the official ticket shortcut and passenger-report UI. Both deployment targets retain these transit features and use a dedicated lightweight offline reader.

Passenger-report SQL functions already exist in the configured Supabase project, but anonymous sign-ins are currently disabled there. The incoming version explicitly checks that setting and leaves reports off when disabled. This sync preserves that setting; it does not enable new public database access or fabricate passenger reports. Normal transit functions operate independently of reporting.

Validation included the new community prompt and journey-map tests, existing transit regressions, and Wrangler deployment packaging.

## Ride map following — October 9, 2026

Starting a ride enables map following. Dragging the map, pinching/scrolling to zoom, or moving it with the keyboard pauses following. The location pin, route progress, and exit alerts continue to update while the map stays where the rider left it. Tap **Follow** on the location control to recenter and resume. GPS camera updates preserve the current zoom; the explicit recenter action returns to street-level zoom. Ending a ride resets the control.

Validation: transit/map/community regressions passed. The screen test injects GPS fixes during drag/zoom/keyboard browsing and confirms progress advances without camera movement, then explicit follow resumes. These checks do not establish physical-device or physical-ride accuracy.

## 47а П map correction — October 9, 2026

The Modeshift feed version `20261009122716` supplies the correct 23 outbound stops from Transport Centre to Ljuboten, but shape `24440` makes a roughly 1,096 km excursion into Bulgaria before returning. The return shape `24441` is valid. This is an upstream map-shape error, not a change in the bus destination or timetable.

`routeGeometry` now checks published coordinates against the trip's stop envelope (with 5 km padding) and rejects shapes longer than four times the stop outline plus 5 km. Invalid coordinates also reject the whole shape. Rejected geometry falls back to the verified stop sequence with an explicit approximate-outline label, across line details, the boarding-stop map, journey maps and Ride mode. It does not infer roads by deleting bad points or reversing the opposite direction. A corrected upstream shape will be accepted automatically if it passes these checks.

The full current feed audit covered 290 unique shape/stop sequences: 282 valid street shapes retained, seven existing missing-shape outlines retained, and only `24440` newly rejected. The original outbound and return data are preserved in `tests/fixtures/47a-geometry.json`; regressions cover both directions, downstream boarding, ride distances, invalid coordinates, excessive loops and visible fallback copy. All existing tests pass. Browser/physical-route verification remains unavailable in this session.

Published as Worker version `c688334c-9845-450f-b472-e077acc3891a` from commit `061501f`. Cloudflare confirmed the new map, app and route-network assets were uploaded to the existing custom domain. Those deployment checks predate the current split between protected and public hosting.


## JSP news, saved filters and dark maps — October 17, 2026

The News tab reads JSP Skopje’s official English RSS feed at `https://skopjebus.mk/en/feed/`. The Worker supplies its public article text to Gemini and renders concise articles using Tuka’s own styles. Source titles, publication dates and links always come from the feed, never from model-generated URLs. Article text is escaped, and failed generation falls back to the original JSP notice. If JSP is unreachable, the last successful articles remain visible with a stale-data message.

The shared D1 cache checks JSP at most every 30 minutes when News is opened. Gemini runs only for a changed feed or unprocessed notices, at least two hours apart, with at most 12 attempts per 24-hour budget window. Failed calls count; SDK retries are disabled. A database lease prevents concurrent browsers or Worker isolates from multiplying API calls. New notices can appear immediately as original text while waiting for the next permitted AI call. Refresh reads the shared cache and cannot bypass these limits. There is no background cron and no calls while the tab is unused. Other applications using the same Google project share its provider quotas.

Add `GEMINI_API_KEY` to the ignored `.dev.vars` for local development, or install it as a Wrangler secret for production. The optional server variable `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Neither value is exposed in the frontend. Apply migrations `0002_news.sql` and `0003_news_budget.sql` before serving the new endpoint. No Supabase configuration changes are required. The legacy Sites build is not supported for this news integration; use the native Cloudflare entrypoint.

Saving a stop also saves its selected bus lines and downstream destination. The Saved tab filters both its route chips and next arrivals, and opening the saved card restores that selection. Changing a saved stop’s filters shows **Save filters** to explicitly update the saved selection. Existing stop-only favourites retain all routes. An empty selection stays empty instead of reverting to all buses. Favourites remain on the device.

Dark mode applies to the actual vector basemap—land, water, buildings, roads and labels—on the Stops, line detail, destination and journey maps. Toggling the theme preserves camera positions, markers, chosen routes and ride state. Newly opened maps inherit the current theme; returning to light mode restores the light palette.

Validation covers legacy favourite migration and reload, selected/empty/all route filters, destination restoration, dark/light map colours, route overlay preservation, official-source filtering, AI output schema/source validation, persistent cache and concurrent requests, budget limits, provider/source failures, HTML escaping and the news endpoint responses.

Local browser validation: real JSP → Gemini → D1 → news articles succeeded; desktop and 390px news layouts were inspected. Rekord west saved with only bus 5 showed only bus 5 arrivals and restored that selection after reload. The actual map switched to the dark vector palette. The full regression suite and Wrangler deployment dry run passed.

## Ticket catalogue and news polish — October 17, 2026

The Ticket button opens live JSP fares, grouped by City or All lines. The public `/api/tickets` endpoint reads the official Modeshift catalogue, normalizes names/prices, and caches public data for 30 minutes per Cloudflare location. During an outage it can show dated fares for up to 24 hours, with a warning and a five-minute retry cooldown. Credentials, account records and payments are never sent to this catalogue endpoint.

Selecting a pass explains how to purchase it in SkopjeBus. Android opens the installed official app through its declared `com.modeshift.jsp` scheme, with Google Play as a fallback; iPhone and desktop offer the official store links. The app-opening link does not preselect the pass. Links also lead to JSP's active account and transport-card top-up pages. The existing paid call-to-185 option remains available. Tuka does not issue tickets, debit wallets or display account QR codes.

Full embedded checkout and QR access remain dependent on a supported Modeshift OAuth client/redirect for Tuka and a confirmed ticket integration contract. The official site's public settings use its own registered client and callback. Its `/app/ticketing` pages currently display “The functionality will be available soon”; `/app/tickets` returns 404. These disabled routes are deliberately excluded from the user flow. The active `/app/cards/load/` flow is for transport-card top-ups, not a substitute mobile-ticket checkout.

News now has a featured latest announcement, a compact dated article list, and cleaner typography and spacing in both themes. The feature uses a pale blue/teal surface with dark text in light mode; the navy dark-mode palette is preserved. Original publication dates, article text, official-source links and AI attribution remain intact. News cache and Gemini usage limits are unchanged.

Validation: full regression suite passes, including catalogue normalization/cache/outage handling, endpoint responses, rendering escapes and app-link fallbacks. Real upstream fares were checked against the phone catalogue. Local browser checks cover ticket coverage/selection, news expansion, mobile overflow and both themes. No purchase, wallet debit or QR validation was performed.

## Native ticketing investigation — October 17, 2026

Read-only USB inspection of the installed SkopjeBus Android app (`com.modeshift.jsp`, version `1.0.551.234540`) and its compiled React Native bundle confirms that direct ticketing requires more than changing the app-opening URL. The native app uses the same Modeshift tenant API as the public catalogue, with authenticated order, payment, wallet and ticket-QR operations.

- Native SMS login requests a code through `/PhoneNumber/sms-otp`, including a reCAPTCHA Enterprise token, login action and Android/iOS application type. The app obtains this token through the native reCAPTCHA SDK. Its `phone_otp_native` token exchange uses a different public client ID from the website. These code paths were inspected, not used to send an SMS or establish a new account session; server acceptance of another client was not tested.
- After login, the app registers its device identifier and account through `transport/public/account/token`. It handles `willInvalidateOtherTokens` and an account-in-use-on-another-device restriction. Reusing a login in another client could therefore disrupt the existing phone session.
- Pass QR data comes from authenticated `transport/public/account/tickets/qr` with ticket IDs and the registered device token. Wallet QR uses the separate `transport/public/account/wallet/qr` operation. The app caches server-provided QR content with an expiry and, when enabled, adds a rotating TOTP value. The shipped JSP configuration enables that extra protection with a 30-second period; runtime overrides and a real purchased ticket were not verified. A screenshot or copied QR payload is not a complete ticket integration.
- Payment creates an order and a provider transaction; the returned action supplies the bank form or redirect and the app checks the resulting order status. No order, payment, activation or validation request was submitted during this investigation.
- The hosted website blocks cross-origin framing. Its login additionally specifies `frame-ancestors 'none'`. An unauthenticated OAuth check accepted the configured JSP callback but rejected a Tuka callback with `invalid_request`. The standalone ticketing pages remain disabled despite returning HTTP 200.

The current app handoff remains in place. A reliable direct implementation needs a Modeshift client configured for Tuka, an approved login/reCAPTCHA flow, payment return URLs, and a confirmed device-enrollment/QR lifecycle. Modeshift advertises [third-party API integration](https://www.modeshift.com/products/account-based-fare-collection/), but no working Tuka integration or public self-service client registration was established. Investigation used application code and public portal resources; no account credentials or ticket payloads are stored in this repository.

## Loading animation — October 17, 2026

The loading screen now uses a simple inline SVG double-decker with Tuka branding, rotating wheels and gentle suspension. Muted silhouettes of Stone Bridge, Macedonia Gate and Kale Fortress pass behind the bus on a seamless loop. `boot.css` provides matching light and dark palettes and disables all motion for `prefers-reduced-motion`. The scene adds no runtime dependencies. Loading status, recovery buttons and existing timing remain unchanged. Mobile layouts and both themes were reviewed in the browser, and the existing screen smoke checks pass. The animation was approved; its appearance and timing remain unchanged.


## Planner preferences, dates and saved commutes

The Journey tab supports Fastest, Fewest transfers and Least walking, walking speeds from 3–6 km/h and a minimum transfer buffer (default three minutes, added after the walk). The search retains time/walking alternatives across up to three bus rides, removes dominated results, and highlights connections with less than two minutes left after walking and the buffer. Where found, a simpler non-tight result is linked. No connection is described as guaranteed. Initial walking estimates use straight-line × 1.3. Selecting a journey requests pedestrian paths and revises its walking time and connection margins; learned distances are reused when replanning.

Leave now uses fresh trip predictions. Leave at and Arrive by use the chosen Skopje date/time and timetable; Arrive by searches backward for the latest feasible departure before its deadline. Calendar exceptions, GTFS times beyond 24:00, distinct arrival/departure times, pickup/drop-off restrictions, and the [GTFS local-noon-minus-12-hour service origin](https://gtfs.org/documentation/schedule/reference/) are respected (including DST days). Missing spring-forward times are rejected; an ambiguous autumn clock time means the first occurrence. Searches cover a four-hour window, 800 m endpoint access/egress and 250 m transfer walks.

**Observed upstream limitation (17 October 2026):** the official feed contains 2,732 trips, all on service 9 for today, despite calendar rows and feed metadata mentioning future dates. Tuka does not assign those trips to a different service. A date with no published bus trips produces a clear unavailable message (or explicitly marked walk-only options). Future journeys work when the downloaded feed contains valid trips for that service date; tomorrow's commute cannot be promised from today's limited feed.

Save commute stores endpoints, route/stop pattern, walking/transfer preferences and an editable name under `tuka-journeys-v1` on the device. Check now recalculates current options and reports changed routes, tight connections or incomplete live coverage without claiming normal service from a timetable. Stop lists initially show six departures; View full timetable shows the next 24 hours as scheduled times. Destination ranking promotes exact place/address matches and shows place types and addresses.

`offline.html` is a lightweight reader with no external assets or live requests. It reads the existing `tuka-schedule` ZIP cache, saved stop filters and saved commutes, and can calculate timetable journeys for a chosen date/time. It requires one successful online load and storage availability; it does not cache maps. The service worker caches only the explicit reader/module allowlist, never substitutes cached content for an online error response, and keeps backend responses out of Cache Storage.

Validation: `npm test` includes planner/calendar/DST/midnight/arrive-by/future-live-isolation/search/storage regressions and service-worker network/offline cases. Browser checks exercise real search results, journey planning, whole-journey saving/checking, and the downloaded offline reader.


## Selected journeys and everyday tools

“Follow this journey” moves the chosen itinerary onto the main map. Bus legs, dashed walking paths, boarding/exit points and the destination remain visible across tabs. A compact panel shows the current step, fresh estimates (otherwise timetable), connection margins and manual next/previous controls. GPS following pauses when the map is moved; the follow button resumes it. End clears the selected itinerary. “Missed this bus?” searches from a fresh location fix or the displayed boarding stop, excluding that exact trip and service date. No automatic boarding or exit detection is claimed for whole journeys.

The planner has independent From/To searches, swap, and local Home/Work destination shortcuts. Journey links share endpoints and preferences, then recalculate times when opened; stop links open the selected stop. These links open directly on Pages; the custom-domain site preserves the destination through its access flow. Links expose their endpoint coordinates/names to their recipients.

The first visit asks for Македонски, Shqip or English. The choice persists on the device and can be changed in Saved. UI translations cover the navigation, planner and journey controls; source notices remain in their supplied language. The crowded header feed-status badge is hidden; freshness and source labels remain alongside departures and journey estimates.

Official GTFS-Realtime service alerts are matched by route, stop, trip, direction, service date and affected period. Empty/missing/stale alerts never imply normal service. Accessibility labels require explicit GTFS values for the bus and both stops; unknown values stay unknown, and pedestrian accessibility is unverified.

Selected journeys propagate fresh delays through intermediate stops before recalculating transfer margins and alert periods. Arrive-by deadlines stay visible and show a warning if refined street walking makes the arrival late. Stop alerts use the scheduled service as well as current predictions, so cancelled or skipped departures do not hide closures. Home/Work and shared links cover suburban JSP stops; invalid updates preserve the previous saved place and show an error. Offline-reader upgrades retain the last complete version until every replacement asset is ready. Complete warning translations preserve place names and source notices.

### Pedestrian routing

The public `/api/walk` endpoint requests the [FOSSGIS OSRM foot service](https://routing.openstreetmap.de/about.html), using a fixed upstream URL, bounded responses and Skopje-only coordinates. A D1 lease limits uncached calls across all clients to one per 1.2 seconds and 500 per UTC day; cached paths last 24 hours. Directions are fetched only for the selected journey, and failures retain labelled approximate paths. The provider receives route endpoints and may log requests as described on its about page. Attribution and a “Fix the map” link appear with the directions. Short pin-to-path gaps (up to 40 m) remain approximate and are included in the distance; distant snaps and non-walking responses are rejected.

The walking endpoint requires `migrations/0004_walking.sql`; the migration commands in the deployment instructions apply it alongside the news schema.
