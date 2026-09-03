# ORDS routes

## `gcode.participants.v1` module — new routes

| Method | Path | Source type | Body |
|---|---|---|---|
| GET | `/participants/:id/youtube-tracks` | `json/query` | `SELECT track_name, youtube_url, sort_order FROM participant_youtube_tracks WHERE participant_id = :id ORDER BY sort_order` |
| POST | `/participants/:id/youtube-tracks` | `plsql/block` | `BEGIN gcode_event_participants_api.replace_youtube_tracks(p_participant_id => :id, p_items => :body_text); END;` |
| GET | `/participants/:id/team-members` | `json/query` | `SELECT member_name, sort_order FROM participant_team_members WHERE participant_id = :id ORDER BY sort_order` |
| POST | `/participants/:id/team-members` | `plsql/block` | `BEGIN gcode_event_participants_api.replace_team_members(p_participant_id => :id, p_items => :body_text); END;` |

Verified live: `GET`/`POST` round-trip for both against
`http://localhost:8080/ords/wksp_gcode2/v1/participants/:id/...`.

## `gcode.events.v1` module — existing routes, binds added

- `POST /events/` (create event): added `p_audio_recording_enabled`,
  `p_age_category_requirement`, `p_track_submission_enabled`,
  `p_member_names_enabled` to the `gcode_events_api.create_event(...)` call.
- `PUT /events/:id` (update event): added the same 4 binds to
  `gcode_events_api.update_event(...)`.
- `GET /events/:id`: no change needed — serializes `get_event`'s refcursor
  directly, so the 4 new `get_event` SELECT columns pass through automatically.

Verified live via curl: `POST /events/` accepts all 4 fields and they
round-trip through `GET /events/:id`.

## Superseded route (no longer exists)

`/events/:id/youtube-tracks` (GET/POST) was created in an earlier pass of
this work for an organizer-authored per-event tracks table, then deleted
(`ORDS.DELETE_TEMPLATE`) once the actual requirement — participant-submitted
tracks — was clarified. Use `/participants/:id/youtube-tracks` instead.

Pre-existing, unrelated: the `POST /` handler never bound `p_rating_mode`
(the `create_event` procedure itself never gained that param when
`update_event` did) — a prior inconsistency, left as-is.
