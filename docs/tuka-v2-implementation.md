# Tuka v2 — AI Transit Guardian + UI/UX 2.0

User implementation brief accepted 3 November 2026. Work on a separate feature branch; improve the current app, never replace the transit engine. Preserve Skopje, Boston, Tilburg, imports, realtime, route shapes, favorites, ride notifications and city switching. Only described features/UI may change. Secrets remain server-side. No merge or deployment without explicit approval.

## P0

- Repository-wide architecture inventory and passing baseline before modifications: architecture-baseline.md.
- Preserve the already-fixed Change stop pointer behavior and three-state details sheet.
- Reuse active journey, selected stop/route, network, preferences, deadlines and current progress. Do not ask for information already held by the application.
- Assess current live predictions, cancellations/skips, official alerts/closures and transfer feasibility. Missing GPS must never mean cancellation. Distinguish reported cancellations, estimated delay, official notices and stale/missing data.
- Calculate feasible alternatives with the deterministic planner. Exclude confirmed closures/cancellations as appropriate, preserve deadlines and walking constraints, and retain current guidance if nothing works.
- AI receives a bounded summary of public transit facts and feasible alternatives, not raw GPS, private pin coordinates or Home/Work labels. Validate every response. Never let AI invent an itinerary, departure, delay, stop or vehicle.
- Meta is the preferred configured intelligence provider, with Baseten as an available fallback/specialist through the existing gateway. No constant polling of AI, unnecessary parallel models or automatic repeated requests.
- Dismissible contextual Guardian panel with explicit local comparison, optional AI explanation and direct map action for a verified alternative. Normal planning works without AI.

## P1

- Context-aware questions: connection risk, missed/missing bus, less walking, arrival deadline, closure avoidance and cautious alternatives. Ambiguity must ask for clarification rather than guess.
- Explanations compare actual alternatives, show source/update time and live/scheduled/official/unknown distinctions. Model-selected reason codes must be supported by supplied facts.
- Refine stop details, arrival hierarchy, route badges and Copilot/Guardian identity with shared white/blue surfaces and existing style conventions. Keep map controls, markers, gestures and navigation usable.
- Add demonstration using a genuine live event or clearly labeled replay of a captured public event; do not label synthetic fixtures as real captures. Separate newly implemented work from v1 capabilities.

## P2

- Refine floating navigation, transfer markers, directional indicators, origin/destination distinction, spacing, radii, shadows and active states; never replace verified GTFS shapes with prettier invented paths.
- Lightweight transitions for panels, routes, loading and recommendations. Respect reduced motion. Avoid recurring layout/animation costs on mid-range Android.

## Acceptance and reporting

Run functional city/GTFS/realtime/planner/shape/favorite/notification/switching regressions. AI scenarios: normal; delayed transfer; closure; missing live data; no feasible alternative; ambiguous question; deadline; least walking; provider failure/timeout; stale/conflicting data. Use mocked AI by default to protect token budgets. Interact with each changed control in a running browser, capture screenshots, test realistic phone/landscape viewports, scrolling, focus/keyboard behavior and slow/error states. Physical Android, real virtual keyboard, rotation sensors and field-trip checks must be disclosed if not performed.

Final report must list completed changes, files, reused vs new features, bugs, tests/results, limits, screenshots, city acceptance, local run instructions and review branch/PR. Never claim unfinished or unverified work is complete.
