# Organizer portal backend (Handover 7, parts 1-2)

Run in this order in WKSP_GCODE2. Take a backup first; everything is additive.

1. `01_tables.sql`: `EVENTS.LIVE_ROOM_ENABLED`, team, share links, check-ins,
   communications and recipients, plus panelist role/note columns.
2. `02_gcode_event_portal_api.sql`: `GCODE_EVENT_PORTAL_API`. Needs
   `EXECUTE` on `DBMS_CRYPTO`, and the column assumptions listed at the top
   of the file checked first.
3. `03_ords_endpoints.md`: the routes to create, and what stays outside SQL.

`00_run_all_on_prod.sql` is steps 1 and 2 in one file.

Not included yet: the live-room tables (webinar config, speakers, attendance)
and the provider webhook. They come with Parts 3 and 4, after the VideoSDK
spike.

Frontend flags (both default off, set in Vercel when the backend is live):
`NEXT_PUBLIC_ORGANIZER_PORTAL=true`, `NEXT_PUBLIC_LIVE_ROOM=true`.
