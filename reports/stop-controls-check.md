# Stop controls verification

Change stop inherited `pointer-events: none` from the map label after being moved inside it. Its delegated `data-back-stops` handler already existed. Explicitly enabling pointer events on the button fixes real clicks without making the whole label intercept the map.

The details sheet now has a quiet text-and-chevron Hide panel action instead of the blue square. Collapsing hides that secondary action, leaves the full-width restore handle and moves keyboard focus to it. Ride mode retains a visible restore label.

Controlled browser checks passed at 320, 390 and 1280 pixels: normal unforced Change stop clicks clear selection; another stop can be selected; Hide panel minimizes the sheet; its handle restores it. Existing import, planning, saved-state, offline and capability checks also pass with no page errors. See stop-controls-browser-check.json. The preview uses a test timetable and neutral basemap.

Shared-screen regression checks and Meta build pass. No live AI request was made for these changes. These changes are local; no push or deployment performed.

Copilot grounding remains unchanged: server network profiles and selected city/stop context; an optional Boston stop realtime lookup; structured journey requests validated and handed to the client planner. General chat does not receive the complete normalized timetable, and imported local feeds are not sent to Copilot.
