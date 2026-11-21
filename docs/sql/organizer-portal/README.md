# Organizer portal and live room backend (Handover 7)

Three scripts, run in this order in WKSP_GCODE2 (take a backup first; everything is additive):

1. `01_tables.sql`: tables and columns.
2. `02_packages.sql`: the packages (`GCODE_EVENT_PORTAL_API`, `GCODE_EVENT_LIVE_API`, `GCODE_EVENT_HTTP_API`).
3. `03_ords.sql`: the REST routes.

## Before running

- Your DBA runs `GRANT EXECUTE ON SYS.DBMS_CRYPTO TO <schema>` once (tokens, hashing, signatures).
- After script 1, insert into `GCODE_PORTAL_SETTINGS` (see the comment in the script): at minimum
  `JWT_SECRET` (so callers are verified, not just decoded) and, for the live room,
  `VIDEOSDK_API_KEY`, `VIDEOSDK_SECRET`, `WEBHOOK_SECRET`.
- `01_tables.sql` adds `PANELIST_ROLE` / `INVITE_NOTE` to the panelists table only if it can find it
  (`GCODE_EVENT_PANELISTS`); otherwise it prints what to add by hand.

## What is built, and what is not

Built and enforced on the server:

- Team invites and view-only share links: 256-bit tokens, only the SHA-256 hash is stored, a token
  is shown once, expiry and revoke are checked on every read, co-organizer needs a signed-in
  account, share links can never be co-organizer.
- `GET /shared/:token` has no side effects; `POST /shared/:token/open` counts a view or activates an invite.
- `/shared/:token/data` returns only what the role may see and never emails or phones.
- Communications: the browser sends a recipient group, the server resolves recipients and returns the real
  count; max 5 sends per event per hour. "Paid" is rejected until payment status can be told.
- Live room decisions: role (host / speaker / attendee), registration, door state on the server clock,
  room-shaping settings locked once doors open, removed people get no credential, the replay URL only
  reaches ticket holders when it is published.
- Host actions (go live, stop, record, captions, end) are written to `GCODE_EVENT_LIVE_COMMANDS`; the
  live/recording flags only change when a provider event is recorded (`record_provider_event`).

Not built, because the request and response shapes are unverified until the provider spike
(Handover 7, Part 0b):

- Creating the provider room (`ROOM_REF` stays empty, so `POST /events/:id/live/token` answers "not switched on").
- The worker that reads `GCODE_EVENT_LIVE_COMMANDS` and calls the provider (HLS start, recording, end, remove).
- The webhook relay that verifies the provider's RSA signature and calls `POST /webhooks/live`.
- Moving the recording into our own bucket and storing its URL in `RECORDING_URL`.
- The mailer job that sends `GCODE_EVENT_COMM_RECIPIENTS` rows. Until it exists nothing is emailed.
- The token claims in `h_live_token` follow the v2 docs and are untested against the provider.

Frontend flags (default off): `NEXT_PUBLIC_ORGANIZER_PORTAL`, `NEXT_PUBLIC_LIVE_ROOM`.
