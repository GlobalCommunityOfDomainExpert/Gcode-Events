# ORDS routes

`gcode.events.v1` module:

| Method | Path | Source type | Body / notes |
|---|---|---|---|
| GET | `/events/:id/questions` | `json/query` | One row per question, `options` a `JSON_ARRAYAGG` of `{id,label,sortOrder}` — arrives as an escaped JSON *string*, not a nested array (same as `EventRoundApi.rubric`). |
| POST | `/events/:id/questions` | `plsql/block` | JSON array body → `GCODE_EVENTS_API.replace_questions`. Full-replace, see `02_package_patches.sql` for the cascade-delete note. |

`gcode.participants.v1` module:

| Method | Path | Source type | Body / notes |
|---|---|---|---|
| GET | `/participants/:id/answers` | `json/query` | Flat rows: `{question_id, option_id, answer_text}`. |
| POST | `/participants/:id/answers` | `plsql/block` | JSON array body → `GCODE_EVENT_PARTICIPANTS_API.replace_answers`. Full-replace across *all* of this participant's answers, not scoped per-question. |

Existing routes: `POST /events` and `PUT /events/:id` gain one new bind,
`:audio_recording_applies_to`, alongside the existing toggle binds — no new
route, ORDS auto-binds it from the JSON body.
