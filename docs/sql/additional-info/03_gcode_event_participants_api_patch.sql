-- Net diff to GCODE_EVENT_PARTICIPANTS_API (spec + body). Applied live via
-- CLOB search/replace against the existing package source. Two new
-- procedures, exact mirror of GCODE_EVENTS_API.replace_timeline's
-- delete-then-bulk-insert pattern, scoped to one participant instead of one
-- event.

  PROCEDURE replace_youtube_tracks (p_participant_id IN gcode_event_participants.id%TYPE, p_items IN CLOB) IS
  BEGIN
    DELETE FROM participant_youtube_tracks WHERE participant_id = p_participant_id;
    INSERT INTO participant_youtube_tracks (participant_id, track_name, youtube_url, sort_order)
    SELECT p_participant_id, j.track_name, j.youtube_url, j.sort_order
    FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
      track_name  VARCHAR2(200)  PATH '$.trackName',
      youtube_url VARCHAR2(1000) PATH '$.youtubeUrl',
      sort_order  NUMBER         PATH '$.sortOrder'
    )) j;
  END replace_youtube_tracks;

  PROCEDURE replace_team_members (p_participant_id IN gcode_event_participants.id%TYPE, p_items IN CLOB) IS
  BEGIN
    DELETE FROM participant_team_members WHERE participant_id = p_participant_id;
    INSERT INTO participant_team_members (participant_id, member_name, sort_order)
    SELECT p_participant_id, j.member_name, j.sort_order
    FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
      member_name VARCHAR2(200) PATH '$.memberName',
      sort_order  NUMBER        PATH '$.sortOrder'
    )) j;
  END replace_team_members;
