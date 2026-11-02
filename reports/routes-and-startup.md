# Route geometry and city startup — November 2, 2026

The current public Skopje GTFS download was audited: 101 routes, 4,051 trips and 273 unique shape/stop-order patterns. Before this change, 261 patterns passed shape validation, eight were rejected and four had no shape. The ordered segment matcher restores seven legitimate published patterns: 5Н, б05, 63А, both affected directions of 21, 51 and 68. Now 268 patterns use published geometry. The corrupt 47а П shape remains rejected; 8 and 9 П each have two patterns with no published shape. These remaining cases retain explicitly labelled approximate stop connections, not invented road paths. Details and trip IDs are in `skopje-route-audit.json`.

The former greedy geometry matcher could jump to a later pass at a loop, then reject the subsequent stop as out of order. Matching now follows ordered segments across the whole stop sequence. Boarding and journey legs trim at projected segment positions instead of snapping to the nearest stored vertex. A compact fixture from the current feed protects all seven recovered patterns. Existing corrupt-shape and outlier tests continue to pass. Line detail marks approximations with dashes as well as a notice. Dashed walking links remain distinct from bus geometry.

Startup resolves GPS before downloading a timetable. A supported location selects its city even if another city was previously saved in manual mode. An explicit shared city/stop link remains authoritative. If GPS is unavailable, an existing last-selected city may be restored with an explanatory label; a first visit opens the city chooser rather than loading Skopje. Unsupported GPS locations also open the chooser. The loader starts with “YOUR LOCATION, IN MOTION”, then uses the selected city's name. Readiness ends the loader immediately; the forced ten-second minimum is removed.

Normalized timetables are reused for five minutes per city and concurrent loads share one request. Live data still refreshes independently. This avoids repeated downloads, decompression and normalization on return switches without extending a snapshot indefinitely.

## Validation

- Full suite: 166 Node tests and all standalone regressions pass. The protected Meta build and Worker deployment dry-run pass.
- Browser: 30 shared-screen observations across three cities at 390 and 1280 pixels recorded no page JavaScript errors or document-width overflow.
- Actual browser GPS test: Tilburg was selected over a stale saved manual Skopje preference, with no Skopje GTFS request. A denied-location first visit opened the city chooser without downloading any default network.
- Browser switch timings, including opening the picker: first Boston load 2,411 ms; returning to Tilburg 204 ms, Boston 316 ms, Tilburg 180 ms. One timetable download per city. These are local preview measurements, not mobile-network guarantees. Raw results are in `city-switch-browser-check.json`.
- Browser rendering: selected stops and line details were exercised against the current Skopje feed and the Boston/Tilburg snapshots. Street tile loading was unreliable in this environment. `route-preview.png` uses a neutral test basemap to verify actual published route/stop overlay rendering independently of tile availability; it is not a successful live street-basemap check. No browser screenshot is used as evidence that the source's missing geometry is accurate.

No live deployment or Tilburg field acceptance is claimed.
