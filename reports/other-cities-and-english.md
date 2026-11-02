# Boston / Tilburg geometry audit and English notices

November 2, 2026. The audit uses the exact bundled timetable assets currently served by the Meta build, not a newly downloaded national feed.

Boston: 369 routes, 86,996 trips and 962 unique shape/stop-order patterns. The shared ordered-segment fix restores 11 patterns on routes 94, 112, 119, 120, 216 and 217. Of all patterns, 960 pass published-shape validation, none lack a shape and two Newburyport Line Shuttle patterns still fail validation. Their outlines remain approximate; the audit does not claim those source shapes are correct. See `boston-route-audit.json`.

Tilburg: 100 routes, 16,873 trips and 434 unique patterns. The shared fix restores three patterns: route 131 and two route 4 patterns. There are now 393 validated published paths, zero rejected shapes, and 41 patterns whose source has no shape. These remain labelled approximations. See `tilburg-route-audit.json`.

Both audits checked trimming at the start, midpoint and penultimate call. Zero-length results were confined to termini within 25 m of the boarding point. No non-colocated boarding/terminal pair collapsed into a zero-length path. New regression checks protect every recovered pattern and retain rejection of the two invalid Boston patterns.

## English notices

Tilburg notice cards prefer complete official English text when present. Otherwise **Read in English** requests a translation of the current official notice. The source remains accessible under **Original Dutch notice** (or **Original operator notice** when its language is unspecified). Machine output is explicitly labelled. Dates, validity periods, affected route/stop selectors and official URLs always remain source-controlled.

The authenticated endpoint accepts only a content hash, not arbitrary text or a URL. It looks up the still-current notice, uses the existing server-side Meta/Baseten credentials, and validates the single structured translation response. Changed numeric details or extra fields are rejected. Translations are cached by exact original title/body for one day; source changes or expiry still require a fresh valid notice. Translation failures leave the original readable. Per-card on-demand translation avoids automatically translating all 60 notices per rider.

Tests cover source retention, official English preference, numeric changes, extra fields, unavailable providers, caching, expired/changed notices, request limits and login. The browser check clicked the translation control, displayed English and expanded the Dutch original with zero page errors and one translation request. That browser response and provider unit tests are mocked; a real model request was not made. `tilburg-english-preview.png` is a browser test example, not evidence that this particular disruption is currently active.

Validation: 172 Node tests and all standalone regressions pass; the Meta asset build and Worker dry-run pass. No live deployment was performed.
