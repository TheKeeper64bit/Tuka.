# Journey recovery and map controls verification

- Missed departures now replan from a fresh accurate location or the current journey step, retain the destination and arrival deadline, exclude the missed trip, and select a replacement on the map. If no replacement exists, current guidance remains available.
- The planner removes avoidable out-and-back transfers when a legal earlier exit arrives at least two minutes sooner, is within 250 metres of the later exit and adds no more than 150 metres of walking. Walking barriers and forbidden exits remain respected.
- Destination-filtered stop networks end at the selected stop. Regression checks use all five route 56 patterns from the current public Modeshift Skopje GTFS feed; full-line views retain the complete route.
- Mobile selected-stop card, animated map-tools menu, and expanded/normal/minimized stop sheet verified at 320, 390 and 1280 pixels.
- Meta: 176 Node tests plus all standalone regression checks passed. Meta build and Wrangler deployment dry run passed.
- Original Skopje backport: 101 Node tests plus standalone checks passed; public bundle built against a placeholder API origin as a build smoke check.

Browser checks use deterministic transit fixtures and a neutral basemap. They verify UI and recovery behavior, not live service availability or a field trip. The photographed journey was not reproduced with its exact origin, destination and departure time. The route 56 fix addresses drawing past a chosen exit; it does not independently certify every published road segment.

Dashed lines indicate approximate stop-to-stop connections where street geometry is unavailable. They are not a claim that a bus follows that straight line.
