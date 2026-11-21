# Organizer portal and live room (Handover 7)

APEX holds **tables only**. Everything else (tokens, who may do what, the video
provider, webhooks, replay streaming) is Next.js server code in
`src/server/portal` and `src/app/api/portal`, which reads and writes the tables
through ORDS. No packages, no `DBMS_CRYPTO` grant.

## Run, in WKSP_GCODE2

1. `01_tables.sql`: the tables and read-only views. Re-runnable: it first drops
   the Handover 7 objects of an earlier attempt, including the packages that
   failed to compile.
2. `02_rest.sql`: turns on ORDS REST for those tables under `/portal_*`, locks
   that path behind an OAuth2 client, and creates the client. Then run the
   `SELECT` at the bottom (in SQL Commands) to read the client id and secret.

## Vercel environment

Required for the portal:

| Variable | What |
|---|---|
| `ORDS_CLIENT_ID`, `ORDS_CLIENT_SECRET` | from step 2 (server only, never `NEXT_PUBLIC_`) |
| `JWT_SECRET` | the secret that signs sign-in tokens (it lives in the database). Without it callers are only decoded, not verified |
| `NEXT_PUBLIC_ORGANIZER_PORTAL=true` | shows Communication and Team & access |

Required for the live room:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_LIVE_ROOM=true` | shows the live room |
| `VIDEOSDK_API_KEY`, `VIDEOSDK_SECRET` | provider credentials |
| `OCI_RECORDINGS_BUCKET_NAME` | a **private** bucket for recordings (the other `OCI_*` vars already exist) |
| `PUBLIC_BASE_URL` | optional; the site origin the provider calls back, default the request origin |
| `ROOM_LIMIT_INTERACTIVE`, `ROOM_LIMIT_VIEWERS` | optional plan limits, default 50 and 100 |
| `ORDS_ROOT`, `REPLAY_SECRET` | optional overrides |

Register `https://<site>/api/portal/webhooks/live` as the provider's webhook URL.

## What is enforced where

- Team invites and share links: 256-bit tokens, only the SHA-256 hash is stored, shown once; expiry and revoke
  checked on every read; co-organizer needs a signed-in account and only the organizer can grant it; links can
  never be co-organizer.
- `GET /shared/:token` has no side effects; `POST .../open` counts a view or activates an invite;
  `.../data` returns only what the role may see, never contacts.
- Communications: the browser names a group, the server resolves recipients and returns the real count; 5 sends
  per event per hour. "Paid" is rejected until payment status can be told. Rows are written as QUEUED.
- Live room: role, registration and door state come from the server; room-shaping settings lock once doors
  open; removed people get no credential; host actions run against the provider from the server.
- Replay: the recording is copied into the private bucket and streamed through a signed, short-lived,
  ticket-bound route. There is no public link.

## Not proven yet

- **No provider call has been run against a real VideoSDK account.** The room, HLS, recording, end and remove
  calls, the join token claims, the webhook signature (RSA-SHA256 over the raw body) and the payload mapping
  all follow the public docs but need the spike (Handover 7, Part 0b). The adapter is `provider.ts`.
- **Nothing here has run against your ORDS.** The AutoREST calls (filter syntax, POST returning the new row,
  PUT as full-row replace) follow the ORDS docs and are the first thing to test.
- The inside of the room is still the "Room opening soon" stub in `components/live-room.tsx`: the provider
  embed waits on the spike.
- Recordings over 200 MB are not copied (held in memory); that needs a worker.
- No mailer: Communication rows stay QUEUED.
