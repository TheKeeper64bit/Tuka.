# Tuka development log

## Tuka v1 — final feature update · 3 November 2026

- Added Nederlands (Dutch) alongside English, Albanian and Macedonian, including saved language choice, early loading copy, offline reader, journey/transfer messages and stop controls.
- Kept timetable stop names, operator notices and passenger-entered names intact. Dutch UI does not replace the original operator notice or trigger AI translation requests.
- Retained the completed Change stop and three-state details-sheet fixes, universal GTFS import and existing city/provider integrations.
- Baseline: 191 Node tests; Dutch closeout: 192 Node tests plus standalone regressions. Focused language tests and browser interaction checks at 320, 390 and 1280 pixels passed with Tilburg's actual bundled timetable and controlled external services.
- Browser checked four-language switching, reload persistence, planner controls, Change stop and hide/restore without losing selection. Neutral basemap; no physical-device or field-journey claim.
- This is the final v1 feature update. Release branch: `release/v1-final-dutch`. No deployment is implied by the branch push.

## Tuka v2 — development begins · 3 November 2026

AI Transit Guardian and UI/UX 2.0 begin on a separate feature branch based on the final v1 closeout. Preserve the existing application and deterministic planner. Journey context, verified disruptions, locally calculated alternatives, bounded optional AI explanations, nonintrusive map actions and focused visual refinements are the new scope.

The v2 implementation and evidence will be reported separately. No v2 merge or deployment without explicit approval.

## Tuka v2 — Transit Guardian preview

- Assesses selected journeys against current transit predictions and official alerts, calculates alternatives in Tuka, and offers optional Meta explanations.
- Refines stop details, mobile navigation, journey markings, and the Copilot layout.
- Adds a labeled replay of a captured MBTA prediction and browser regression evidence. See the [v2 development report](docs/tuka-v2-development-report.md).
