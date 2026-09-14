# Anonymous emoji reactions

Already executed directly against the local dev DB (`gcodedb` / `WKSP_GCODE2`
on `localhost:1521/FREEPDB1`) via the SQLcl MCP connection — full
`CREATE`/`ALTER` privilege locally, see `docs/sql/additional-info/README.md`
for why that's different from the cloud ADB. Kept here for reference and the
eventual cloud-ADB deploy.

## Why

Emoji reactions were tied to a real Attendee-category registration
(`RATER_ATTENDEE_ID`) — same identity model as numeric audience *scoring*.
Decision: **audience scoring stays registered-users-only** (a real Attendee
row, emailed their unique link), but **reactions are now fully anonymous** —
no registration, no link personalization, just a client-generated device
token so repeated taps from one browser can be throttled. This is a full
replace, not a dual-mode: the old attendee-tied reaction path is gone.

## Shape

- `GCODE_EVENT_REACTIONS.DEVICE_TOKEN` (new, nullable `VARCHAR2(64)`) — a
  random UUID the browser generates once and persists in localStorage
  (`src/lib/reactions/device-token.ts`), sent with every tap. `RATER_ATTENDEE_ID`
  stays on the table (nullable, FK intact) but is dead going forward.
- `GCODE_RATINGS_API.submit_reaction` — no longer takes/validates a rater
  participant id at all; takes `p_device_token` instead, still validates the
  performer, and enforces a **1-second-per-device server-side throttle**
  (silently drops a too-fast repeat tap rather than erroring — reactions are
  fire-and-forget, a dropped duplicate isn't a user-facing failure).
- `POST /events/:id/reactions` (new route, `gcode.events.v1`) replaces
  `PUT /participants/:id/reactions` (deleted, `gcode.participants.v1`).
- Client also debounces for 1s after any tap (`rate/page.tsx`) — pure UX
  feedback, not the actual enforcement (a scripted client bypasses it
  trivially; the server throttle is what matters).

**Organizer-facing side effect**: since reactions no longer need a
per-attendee link, the Live tab's link-sharing button now branches on
`event.ratingMode` — Competitive still bulk-emails personalized rating
links (`sendRatingLinks`, unchanged); Casual now just copies one plain
`/events/:id/rate` URL to the clipboard (`live-round-panel.tsx`), since
that URL is identical for every viewer.

Run in this order:

1. `01_tables.sql` — new `DEVICE_TOKEN` column + `IX_REACTIONS_DEVICE_TOKEN` index.
2. `02_gcode_ratings_api_patch.sql` — net diff to `GCODE_RATINGS_API.submit_reaction`
   (reference/comments — the real runnable body is in `GCODE-Backend/packages/GCODE_RATINGS_API/`).
3. `03_ords_endpoints.md` — old route deleted, new route added.

`00_run_all_on_prod.sql` is the one consolidated, directly-runnable script —
assembled from the real `GCODE-Backend` files, same as
`docs/sql/additional-info/00_run_all_on_prod.sql`. Run it top to bottom in
WKSP_GCODE2 SQL Workshop on the cloud ADB (the ATHARVA MCP connection has no
`CREATE`/`ALTER` privilege there). Take a backup first.

Verified end-to-end locally: direct PL/SQL calls (2 rapid taps from the same
device_token → exactly 1 row inserted; a different device_token in between →
inserted immediately; no device_token → errors), then the equivalent ORDS
route via curl against `http://localhost:8080/ords/wksp_gcode2/v1`.
