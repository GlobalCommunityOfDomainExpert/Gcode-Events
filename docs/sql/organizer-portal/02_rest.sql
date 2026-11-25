-- Script 2 of 2: a small REST module so the Next.js server can reach the tables
-- from 01_tables.sql. Run in WKSP_GCODE2 after 01_tables.sql. Re-runnable.
--
-- The earlier version used ORDS AutoREST and an OAuth client; both need ORDS
-- privileges a workspace user does not have (ORA-01031). This version uses only
-- the module, template and handler calls the rest of this backend already uses.
--
-- It holds NO logic: each route is a plain SELECT, INSERT, UPDATE or DELETE on one
-- table or view. Every route first checks a secret key sent in the X-Portal-Key
-- header against the ORDS_PORTAL_KEY row in GCODE_APP_SECRETS, so nothing answers without it
-- (a wrong key gets no rows and writes nothing). The key lives only in Vercel and
-- in that table, never in the browser.
--
-- Before running: put your key in GCODE_APP_SECRETS (once). Make one with
--     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
-- then run, on its own:
--     DELETE FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY';
--     INSERT INTO gcode_app_secrets (secret_name, secret_value) VALUES ('ORDS_PORTAL_KEY', 'PASTE_THE_64_CHARACTERS_HERE');
--     COMMIT;
-- and set the same value in Vercel as ORDS_PORTAL_KEY.
--
-- Every step runs even if an earlier one fails, and the script ends by listing
-- what failed (one error), so you see everything in one run.

DECLARE
  v_failed VARCHAR2(4000);
  v_seen   VARCHAR2(4000) := '|';   -- templates already defined (a second DEFINE_TEMPLATE would wipe its handlers)

  PROCEDURE step(p_label IN VARCHAR2, p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || CHR(10) || p_label || ': ' || SUBSTR(SQLERRM, 1, 150);
  END step;

  -- One route. The module/template/handler calls are dynamic SQL so a signature
  -- that differs in your ORDS version is reported, not a compile error.
  PROCEDURE route(p_pattern IN VARCHAR2, p_method IN VARCHAR2, p_type IN VARCHAR2,
                  p_source IN CLOB) IS
  BEGIN
    BEGIN
      IF INSTR(v_seen, '|' || p_pattern || '|') = 0 THEN
        EXECUTE IMMEDIATE 'BEGIN ORDS.DEFINE_TEMPLATE(p_module_name => ''gcode.portal.v1'', '
          || 'p_pattern => :1, p_priority => 0, p_etag_type => ''HASH'', p_etag_query => NULL, '
          || 'p_comments => NULL); END;' USING p_pattern;
        v_seen := v_seen || p_pattern || '|';
      END IF;
      EXECUTE IMMEDIATE 'BEGIN ORDS.DEFINE_HANDLER(p_module_name => ''gcode.portal.v1'', '
        || 'p_pattern => :1, p_method => :2, p_source_type => :3, p_mimes_allowed => NULL, '
        || 'p_comments => NULL, p_source => :4); END;' USING p_pattern, p_method, p_type, p_source;
      EXECUTE IMMEDIATE 'BEGIN ORDS.DEFINE_PARAMETER(p_module_name => ''gcode.portal.v1'', '
        || 'p_pattern => :1, p_method => :2, p_name => ''X-Portal-Key'', '
        || 'p_bind_variable_name => ''portal_key'', p_source_type => ''HEADER'', '
        || 'p_param_type => ''STRING'', p_access_method => ''IN'', p_comments => NULL); END;'
        USING p_pattern, p_method;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || CHR(10) || p_method || ' ' || p_pattern || ': ' || SUBSTR(SQLERRM, 1, 150);
    END;
  END route;
BEGIN
  step('drop old module', 'BEGIN ORDS.DELETE_MODULE(p_module_name => ''gcode.portal.v1''); END;');
  v_failed := NULL;   -- nothing to drop the first time
  step('create module',
    'BEGIN ORDS.DEFINE_MODULE(p_module_name => ''gcode.portal.v1'', p_base_path => ''/v1/portal/'', '
    || 'p_items_per_page => 10000, p_status => ''PUBLISHED'', p_comments => NULL); END;');

  -- portal_team -> GCODE_EVENT_TEAM
  route('portal_team', 'GET', 'json/query', q'~SELECT id,event_id,email,user_id,role,status,token_hash,invited_by,invited_on,activated_on FROM GCODE_EVENT_TEAM
    WHERE (:id IS NULL OR id = :id) AND (:event_id IS NULL OR event_id = :event_id) AND (:token_hash IS NULL OR token_hash = :token_hash) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_team', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_TEAM (event_id, email, role, token_hash, invited_by) VALUES (:event_id, :email, :role, :token_hash, :invited_by) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');
  route('portal_team/:id', 'PUT', 'plsql/block', q'~BEGIN
    UPDATE GCODE_EVENT_TEAM SET role = :role, status = :status, user_id = :user_id, activated_on = TO_TIMESTAMP(REPLACE(SUBSTR(:activated_on, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');
  route('portal_team/:id', 'DELETE', 'plsql/block', q'~BEGIN
    DELETE FROM GCODE_EVENT_TEAM WHERE id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');

  -- portal_share_links -> GCODE_EVENT_SHARE_LINKS
  route('portal_share_links', 'GET', 'json/query', q'~SELECT id,event_id,label,role,token_hash,created_by,created_on,expires_on,revoked_on,views FROM GCODE_EVENT_SHARE_LINKS
    WHERE (:id IS NULL OR id = :id) AND (:event_id IS NULL OR event_id = :event_id) AND (:token_hash IS NULL OR token_hash = :token_hash) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_share_links', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_SHARE_LINKS (event_id, label, role, token_hash, created_by, expires_on) VALUES (:event_id, :label, :role, :token_hash, :created_by, TO_TIMESTAMP(REPLACE(SUBSTR(:expires_on, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS')) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');
  route('portal_share_links/:id', 'PUT', 'plsql/block', q'~BEGIN
    UPDATE GCODE_EVENT_SHARE_LINKS SET revoked_on = TO_TIMESTAMP(REPLACE(SUBSTR(:revoked_on, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'), views = :views
     WHERE id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');

  -- portal_checkins -> GCODE_EVENT_CHECKINS
  route('portal_checkins', 'GET', 'json/query', q'~SELECT id,event_id,participant_id,checked_in_on,checked_in_by FROM GCODE_EVENT_CHECKINS
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (:participant_id IS NULL OR participant_id = :participant_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_checkins', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_CHECKINS (event_id, participant_id, checked_in_by) VALUES (:event_id, :participant_id, :checked_in_by) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');
  route('portal_checkins/:id', 'DELETE', 'plsql/block', q'~BEGIN
    DELETE FROM GCODE_EVENT_CHECKINS WHERE id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');

  -- portal_webinar -> GCODE_EVENT_WEBINAR
  route('portal_webinar', 'GET', 'json/query', q'~SELECT event_id,audience,recording,chat,hand_raise,captions,notice,restream_url,slides_url,replay_published,is_live,is_recording,is_ended,provider,room_ref,recording_url,hls_url,updated_on FROM GCODE_EVENT_WEBINAR
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (:room_ref IS NULL OR room_ref = :room_ref) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_webinar', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_WEBINAR (event_id) VALUES (:event_id);
    APEX_JSON.open_object; APEX_JSON.write('event_id', :event_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');
  route('portal_webinar/:id', 'PUT', 'plsql/block', q'~BEGIN
    UPDATE GCODE_EVENT_WEBINAR SET audience = :audience, recording = :recording, chat = :chat, hand_raise = :hand_raise, captions = :captions, notice = :notice, restream_url = :restream_url, slides_url = :slides_url, replay_published = :replay_published, is_live = :is_live, is_recording = :is_recording, is_ended = :is_ended, room_ref = :room_ref, recording_url = :recording_url, hls_url = :hls_url, updated_on = SYSTIMESTAMP
     WHERE event_id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');

  -- portal_live_attendance -> GCODE_EVENT_LIVE_ATTENDANCE
  route('portal_live_attendance', 'GET', 'json/query', q'~SELECT id,event_id,participant_id,first_joined,last_joined,last_left,seconds_in FROM GCODE_EVENT_LIVE_ATTENDANCE
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (:participant_id IS NULL OR participant_id = :participant_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_live_attendance', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_LIVE_ATTENDANCE (event_id, participant_id, first_joined, last_joined) VALUES (:event_id, :participant_id, TO_TIMESTAMP(REPLACE(SUBSTR(:first_joined, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'), TO_TIMESTAMP(REPLACE(SUBSTR(:last_joined, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS')) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');
  route('portal_live_attendance/:id', 'PUT', 'plsql/block', q'~BEGIN
    UPDATE GCODE_EVENT_LIVE_ATTENDANCE SET last_joined = TO_TIMESTAMP(REPLACE(SUBSTR(:last_joined, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'), last_left = TO_TIMESTAMP(REPLACE(SUBSTR(:last_left, 1, 19), 'T', ' '), 'YYYY-MM-DD HH24:MI:SS'), seconds_in = :seconds_in
     WHERE id = :id
       AND (SELECT COUNT(*) FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key) > 0;
    APEX_JSON.open_object; APEX_JSON.write('ok', SQL%ROWCOUNT = 1); APEX_JSON.close_object;
  END;~');

  -- portal_live_events -> GCODE_EVENT_LIVE_EVENTS
  route('portal_live_events', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_LIVE_EVENTS (event_id, provider_event_id, kind, participant_id) VALUES (:event_id, :provider_event_id, :kind, :participant_id) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');

  -- portal_live_blocks -> GCODE_EVENT_LIVE_BLOCKS
  route('portal_live_blocks', 'GET', 'json/query', q'~SELECT id,event_id,participant_id FROM GCODE_EVENT_LIVE_BLOCKS
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');
  route('portal_live_blocks', 'POST', 'plsql/block', q'~DECLARE v_n NUMBER; v_id NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_n = 0 THEN APEX_JSON.open_object; APEX_JSON.write('error', 'not allowed'); APEX_JSON.close_object; RETURN; END IF;
    INSERT INTO GCODE_EVENT_LIVE_BLOCKS (event_id, participant_id) VALUES (:event_id, :participant_id) RETURNING id INTO v_id;
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.close_object;
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN APEX_JSON.open_object; APEX_JSON.write('error', 'duplicate'); APEX_JSON.close_object;
  END;~');

  -- portal_v_events -> GCODE_PORTAL_V_EVENTS
  route('portal_v_events', 'GET', 'json/query', q'~SELECT id,title,organizer_id,organizer_name,start_ist,end_ist FROM GCODE_PORTAL_V_EVENTS
    WHERE (:id IS NULL OR id = :id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');

  -- portal_events -> gcode_purge_event (docs/sql/event-delete/00_run_on_prod.sql decides what is allowed)
  route('portal_events/:id', 'DELETE', 'plsql/block', q'~DECLARE v_ok NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_ok FROM gcode_app_secrets WHERE secret_name = 'ORDS_PORTAL_KEY' AND secret_value = :portal_key;
    IF v_ok = 0 THEN
      APEX_JSON.open_object; APEX_JSON.write('ok', FALSE); APEX_JSON.close_object;
    ELSE
      gcode_purge_event(TO_NUMBER(:id), :force);
      APEX_JSON.open_object; APEX_JSON.write('ok', TRUE); APEX_JSON.close_object;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    APEX_JSON.open_object; APEX_JSON.write('error', SUBSTR(SQLERRM, 1, 300)); APEX_JSON.close_object;
  END;~');

  -- portal_v_participants -> GCODE_PORTAL_V_PARTICIPANTS
  route('portal_v_participants', 'GET', 'json/query', q'~SELECT id,event_id,user_id,category,active,full_name,email FROM GCODE_PORTAL_V_PARTICIPANTS
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');

  -- portal_v_money -> GCODE_PORTAL_V_MONEY
  route('portal_v_money', 'GET', 'json/query', q'~SELECT event_id,pending_claims,pending_amount,active_coupons FROM GCODE_PORTAL_V_MONEY
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');

  -- portal_v_panelists -> GCODE_PORTAL_V_PANELISTS
  route('portal_v_panelists', 'GET', 'json/query', q'~SELECT id,event_id,user_id,invited_email,status,panelist_role,full_name FROM GCODE_PORTAL_V_PANELISTS
    WHERE (:event_id IS NULL OR event_id = :event_id) AND (SELECT COUNT(*) FROM gcode_app_secrets k WHERE k.secret_name = 'ORDS_PORTAL_KEY' AND k.secret_value = :portal_key) > 0~');

  COMMIT;
  IF v_failed IS NOT NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Some steps failed:' || v_failed);
  END IF;
END;
/
