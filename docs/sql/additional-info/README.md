# Per-event additional-info settings (audio recording / age category / track submission / team members)

Already executed directly against the local dev DB (`gcodedb` / `WKSP_GCODE2` on
`localhost:1521/FREEPDB1`) via the SQLcl MCP connection — that connection is the
schema owner locally and has full `CREATE`/`ALTER` privileges, unlike the cloud
ADB connection used for the coupons feature (see `docs/sql/coupons/README.md`),
so no SQL Workshop hand-off was needed here. Kept here for reference and for the
eventual cloud-ADB deploy.

## Shape

Four organizer-configurable toggles on `EVENTS`, each gating a section on the
public participant additional-info page:

- `AUDIO_RECORDING_ENABLED` (existing feature, made toggleable)
- `AGE_CATEGORY_REQUIREMENT` — OFF / OPTIONAL / REQUIRED (existing feature, made toggleable)
- `TRACK_SUBMISSION_ENABLED` — new: when on, participants submit their own
  `{track name, YouTube URL}` rows (any number)
- `MEMBER_NAMES_ENABLED` — new: when on, participants submit their own team
  member names (any number)

Audio/age were already always-on for every participant, so those 2 columns
default to preserving that. Tracks/members are brand-new, so those 2 default
off.

**Important ownership note**: tracks and member names are **participant-submitted**,
not organizer-authored — same pattern as the existing audio submission. They
live in new tables keyed by `PARTICIPANT_ID` (`GCODE_EVENT_PARTICIPANTS.ID`),
not by `EVENT_ID`. An earlier pass of this work built them as an
organizer-authored per-event table; that was reworked after clarifying the
actual requirement, and the old `EVENT_YOUTUBE_TRACKS` table / `GCODE_EVENTS_API.replace_youtube_tracks`
proc / `/events/:id/youtube-tracks` route were all dropped in favor of the
shape below.

## Deploying to the cloud ADB (prod)

**`00_run_all_on_prod.sql` is the one to actually run** — a single consolidated,
directly-runnable script assembled from the real, verified `GCODE-Backend`
files (tables → both packages, spec then body → the 2 changed ORDS handlers →
the 2 new ORDS routes), in dependency order. Run it top to bottom in
WKSP_GCODE2 SQL Workshop on the cloud ADB — the ATHARVA MCP connection has no
`CREATE`/`ALTER` privilege there (confirmed via `session_privs`, matches the
coupons precedent), so this can't be run from an assistant session directly.
Take a backup/snapshot of WKSP_GCODE2 first, per normal prod-change process.
Verification queries are at the bottom of the script itself.

The numbered files below (`01`-`04`) are the same content broken out
per-object, kept for reference/readability — not meant to be run individually
against prod (`02`/`03` in particular are comments describing a diff, not
runnable SQL; the real runnable package bodies are in `00` and in
`GCODE-Backend/packages/`).

1. `01_tables.sql` — 4 new `EVENTS` columns + `PARTICIPANT_YOUTUBE_TRACKS` +
   `PARTICIPANT_TEAM_MEMBERS` tables (both FK to `GCODE_EVENT_PARTICIPANTS`).
2. `02_gcode_events_api_patch.sql` — net diff to `GCODE_EVENTS_API`: 4 new
   params on `create_event`/`update_event`, 4 new columns on `get_event`'s cursor.
3. `03_gcode_event_participants_api_patch.sql` — net diff to
   `GCODE_EVENT_PARTICIPANTS_API`: new `replace_youtube_tracks`/`replace_team_members`
   procedures (delete-then-bulk-insert, same pattern as `GCODE_EVENTS_API.replace_timeline`).
4. `04_ords_endpoints.md` — routes wired up: new `/participants/:id/youtube-tracks`
   and `/participants/:id/team-members` GET/POST, plus the 4 new binds added to
   the existing `POST /events/` and `PUT /events/:id` handlers.

(Applied live via CLOB search/replace on the existing package sources rather
than full rewrites — files 2-3 show the resulting shape for reference, not the
literal patch scripts.)

Verified end-to-end locally: direct PL/SQL calls (create event with all 4
flags, create a participant, submit tracks + members, confirm `ON DELETE
CASCADE` cleans up both child tables when the participant is deleted), then
the equivalent ORDS routes via curl against `http://localhost:8080/ords/wksp_gcode2/v1`.
