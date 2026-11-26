# Organizer portal and live room (Handover 7)

APEX holds **tables only**. Everything else (tokens, who may do what, the video
provider, webhooks, replay streaming) is Next.js server code in
`src/server/portal` and `src/app/api/portal`, which reads and writes the tables
through a small ORDS module. No packages, no `DBMS_CRYPTO` grant, no ORDS
security privileges (AutoREST and OAuth clients were tried and blocked with ORA-01031).

## Run, in WKSP_GCODE2

0. `99_revert.sql` (only if an earlier attempt left objects behind).
1. `01_tables.sql`: the tables and read-only views. Re-runnable: it first drops
   the Handover 7 objects of an earlier attempt.
2. Make a key and store it in your existing `GCODE_APP_SECRETS` (see the top of
   `02_rest.sql`): generate 64 hex characters, then `DELETE FROM gcode_app_secrets
   WHERE secret_name = 'ORDS_PORTAL_KEY'; INSERT INTO gcode_app_secrets
   (secret_name, secret_value) VALUES ('ORDS_PORTAL_KEY', '<key>'); COMMIT;`
3. `02_rest.sql`: creates the module `gcode.portal.v1` (base `/v1/portal/`) with
   plain SELECT / INSERT / UPDATE / DELETE routes. Every route checks the key in
   the `X-Portal-Key` header, so nothing answers without it. It lists every step
   that failed in one error.

## Vercel environment

Required for the portal:

| Variable | What |
|---|---|
| `ORDS_PORTAL_KEY` | the key from step 2 (server only, never `NEXT_PUBLIC_`) |
| `JWT_SECRET` | the secret that signs sign-in tokens (it lives in the database). Without it callers are only decoded, not verified |
| `NEXT_PUBLIC_ORGANIZER_PORTAL=true` | shows Team & access |

Required for the live room:

| Variable | What |
|---|---|
| `VIDEOSDK_API_KEY`, `VIDEOSDK_SECRET` | provider credentials |
| `OCI_RECORDINGS_BUCKET_NAME` | a **private** bucket for recordings (the other `OCI_*` vars already exist) |
| `PUBLIC_BASE_URL` | optional; the site origin the provider calls back, default the request origin |
| `ROOM_LIMIT_INTERACTIVE`, `ROOM_LIMIT_VIEWERS` | optional plan limits, default 50 and 100 |
| `ORDS_ROOT`, `REPLAY_SECRET` | optional overrides (`REPLAY_SECRET` defaults to the portal key) |

Register `https://<site>/api/portal/webhooks/live` as the provider's webhook URL.

## What is enforced where

- Team invites and share links: 256-bit tokens, only the SHA-256 hash is stored, shown once; expiry and revoke
  checked on every read; co-organizer needs a signed-in account and only the organizer can grant it; links can
  never be co-organizer.
- `GET /shared/:token` has no side effects; `POST .../open` counts a view or activates an invite;
  `.../data` returns only what the role may see, never contacts.
- Live room: role, registration and door state come from the server; room-shaping settings lock once doors
  open; removed people get no credential; host actions run against the provider from the server.
- Replay: the recording is copied into the private bucket and streamed through a signed, short-lived,
  ticket-bound route. There is no public link.

## Not proven yet

- **No provider call has been run against a real VideoSDK account.** The room, HLS, recording, end and remove
  calls, the join token claims, the webhook signature (RSA-SHA256 over the raw body) and the payload mapping
  all follow the public docs but need the spike (Handover 7, Part 0b). The adapter is `provider.ts`.
- **Nothing here has run against your ORDS.** The module calls and the handler SQL (header parameter, POST
  returning the new id, timestamp text parsing) are the first thing to test.
- Recordings over 200 MB are not copied (held in memory); that needs a worker.
- Communication (emailing attendees) and a mailer are removed for now. The tables were dropped from
  `01_tables.sql`; its clean-up block still drops any left from an earlier run.

## What the VideoSDK spike proved (2026-11-23, a real account)

- Rooms, join tokens and HLS go-live work as `provider.ts` builds them, with two fixes: the host token needs
  `allow_join` AND `allow_mod` (`allow_mod` alone cannot join), and HLS stops at `/v2/hls/end`.
- **A meeting token holder can publish.** An attendee holding only `allow_join` joined, switched mode with
  `changeMode`, and the host received their audio and video. VideoSDK does not enforce "viewer".
  So in the **Webinar** format attendees never get a meeting token: they get the HLS address
  (`GCODE_EVENT_WEBINAR.HLS_URL`, server-only, returned only while live) and play it with hls.js. Only the host and
  speakers join the meeting.
- The HLS address has no token or expiry; anyone holding it can watch. It is handed out only to ticket holders.
- **Interactive format:** attendees are meant to publish (it is the Meet/Zoom model, up to 50 people), so a
  meeting token for them is correct. They get none until the host has gone live, they never carry `allow_mod`,
  and the host can mute or remove anyone from the room (removal also blocks new tokens).
- Door times: `events.start_date` / `end_date` are stored as UTC; the portal view's `start_ist` / `end_ist` names
  are misleading and the server reads them as UTC.
- Not tested: the webhook signature and payload mapping (VideoSDK cannot reach localhost; needs a public
  URL), recording (out of scope for now), speakers publishing together with the host, captions.
