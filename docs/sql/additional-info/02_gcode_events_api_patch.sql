-- Net diff to GCODE_EVENTS_API (spec + body). Applied live via CLOB
-- search/replace against the existing package source, not a full rewrite.

-- create_event / update_event: 4 new params each, next to the existing
-- rating_mode-style params, following the same NVL(...) convention as every
-- other optional field:
--   p_audio_recording_enabled  IN events.audio_recording_enabled%TYPE
--   p_age_category_requirement IN events.age_category_requirement%TYPE
--   p_track_submission_enabled IN events.track_submission_enabled%TYPE
--   p_member_names_enabled     IN events.member_names_enabled%TYPE
-- create_event defaults: 1, 'OPTIONAL', 0, 0 (matches column defaults).
-- update_event defaults: NULL for all 4 (NVL'd against the existing value).

-- get_event: refcursor SELECT list gains, next to rating_mode:
--   e.audio_recording_enabled  AS "audio_recording_enabled",
--   e.age_category_requirement AS "age_category_requirement",
--   e.track_submission_enabled AS "track_submission_enabled",
--   e.member_names_enabled     AS "member_names_enabled",

-- No replace_youtube_tracks procedure here — an earlier pass added one to
-- this package (organizer-authored per-event tracks), then removed it once
-- the actual requirement turned out to be participant-submitted tracks. See
-- 03_gcode_event_participants_api_patch.sql instead.
