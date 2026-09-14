# ORDS routes

## Removed

`PUT /participants/:id/reactions` (`gcode.participants.v1` module) — deleted
via `ORDS.DELETE_TEMPLATE`. Reactions are no longer scoped under a
participant at all.

## Added

`gcode.events.v1` module, new route:

| Method | Path | Source type | Body |
|---|---|---|---|
| POST | `/events/:id/reactions` | `plsql/block` | `BEGIN gcode_ratings_api.submit_reaction(p_event_id => :id, p_performer_participant_id => :performer_id, p_emoji => :emoji, p_device_token => :device_token); APEX_JSON.open_object; APEX_JSON.write('ok', true); APEX_JSON.close_object; END;` |

Verified live: a device-token-tagged POST inserts; a second POST from the
same device_token within 1s silently no-ops (confirmed exactly 1 row
inserted per device across 2 rapid taps); a POST with no `device_token`
errors (`-20037`); `:id/reactions/since` GET (unaffected, still under
`gcode.events.v1`) keeps working unchanged.

## Unrelated fix bundled in this pass

`REACTION_EMOJIS` in `src/lib/api/ratings.ts` had `👌` where the DB's
`CK_REACTIONS_EMOJI` constraint (and the bot-simulator's own weighting
comment) expected `😂` — a pre-existing stale mismatch that would have made
every real 👌 tap fail the constraint. Fixed to `😂` to match the DB. No
constraint/DDL change needed for this part, frontend-only fix.
