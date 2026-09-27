# "I'm Interested" on events

Lightweight interest signal: a visitor clicks the heart icon button (next to
Share, on the event page). Logged-in users are recorded straight away; guests
enter an email + phone and verify the email with the existing guest OTP, then
the interest is stored. One row per (event, email). The phone is
regex-validated only — never OTP/SMS-verified.

Run in this order in WKSP_GCODE2 (take a backup first; additive only):

1. `01_tables.sql` — `GCODE_EVENT_INTEREST` + index.
2. `02_gcode_event_interest_api.sql` — notes; real package/`get_event` patch in `00_run_all_on_prod.sql`.
3. `03_ords_endpoints.md` — the new `POST /events/:id/interest` route.

`00_run_all_on_prod.sql` is the single consolidated script, assembled from the
real `GCODE-Backend` files. Step 4 in it is a manual edit: add the
`"interested_count"` column to the live `GCODE_EVENTS_API.get_event` (the full
package body is large, so it is not duplicated here).

Frontend: `src/app/(public)/events/[id]/_components/interest-button.tsx`,
`src/lib/api/interest.ts`.

Known gap (same as the rest of the guest flow): OTP send/verify has no rate
limit or attempt cap.
