# Tuka development log

## Tuka v1 — Meta hackathon closeout · 3 November 2026

- Polished Copilot with a focused conversation, separate transit and journey modes, and compact network switching. Added short tab and button transitions with reduced-motion support.
- Added Nederlands (Dutch) alongside English, Albanian and Macedonian, including saved language choice, early loading copy, offline reader, journey/transfer messages and stop controls.
- Kept timetable stop names, operator notices and passenger-entered names intact. Dutch UI does not replace the original operator notice or trigger AI translation requests.
- Retained the completed Change stop and three-state details-sheet fixes, universal GTFS import and existing city/provider integrations.
- Baseline: 191 Node tests; Dutch closeout: 192 Node tests plus standalone regressions. Focused language tests and browser interaction checks at 320, 390 and 1280 pixels passed with Tilburg's actual bundled timetable and controlled external services.
- Browser checked four-language switching, reload persistence, planner controls, Change stop and hide/restore without losing selection. Neutral basemap; no physical-device or field-journey claim.
- This is the final v1 feature update. Release branch: `release/v1-final-dutch`. No deployment is implied by the branch push.
