# Organizer portal and live room (Handover 7)

The database holds **tables only**. Everything else (tokens, who may do what,
the video provider, webhooks, replay streaming) is Next.js server code in
`src/server/modules/portal` behind `/api/v1`, which reads and writes the tables
with plain SQL over the app's own connection (`GCODE_EVENTS_APP`). No packages,
no `DBMS_CRYPTO` grant, no ORDS module.

## Run, in WKSP_GCODE2

0. `99_revert.sql` (only if an earlier attempt left objects behind).
1. `01_tables.sql`: the tables and read-only views. Re-runnable: it first drops
   the Handover 7 objects of an earlier attempt.
2. As ADMIN: the "Organizer portal + live room" and "Event delete" grants at
   the end of `docs/sql/app-user/01_create_events_app_user.sql`.

If the old ORDS module from an earlier version is installed, drop it (and its
key) once the app using `/api/v1` is live:

```sql
BEGIN ORDS.DELETE_MODULE(p_module_name => 'gcode.portal.v1'); COMMIT; END;
/
DELETE FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY'; COMMIT;
```

## Vercel environment

Besides the usual `DB_*` and `AUTH_SECRET`:

| Variable | What |
|---|---|
| `NEXT_PUBLIC_ORGANIZER_PORTAL=true` | shows Team & access |
| `VIDEOSDK_API_KEY`, `VIDEOSDK_API_SECRET` (or `VIDEOSDK_SECRET`) | provider credentials |
| `JOIN_LINK_SECRET` | signs the emailed join links. Optional (defaults to `AUTH_SECRET`), but set it so rotating the login secret doesn't break links already sent |
| `REPLAY_SECRET` | signs replay URLs. Optional (defaults to `AUTH_SECRET`) |
| `OCI_RECORDINGS_BUCKET_NAME` | a **private** bucket for recordings (the other `OCI_*` vars already exist) |
| `PUBLIC_BASE_URL` | optional; the site origin the provider calls back and join links use, default the request origin |
| `ROOM_LIMIT_INTERACTIVE`, `ROOM_LIMIT_VIEWERS` | optional plan limits, default 50 and 100 |
| `LIVE_ATTENDEE_STREAM_ONLY=1` | optional; Webinar attendees get only the HLS address, never a room token |

`ORDS_PORTAL_KEY` and `ORDS_ROOT` are no longer used.

Register `https://<site>/api/v1/webhooks/live` as the provider's webhook URL.

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
- **The `/api/v1` port has not run against the database yet** (unit-tested only). Check the grants and one
  pass through invite → open link → check-in → webinar settings → go live.
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
