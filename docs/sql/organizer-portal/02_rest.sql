-- Script 2 of 2: let the Next.js server reach the tables from 01_tables.sql
-- over REST. Run in WKSP_GCODE2 after 01_tables.sql. Re-runnable.
--
-- The first version of this script failed with ORA-01031 (insufficient
-- privileges) because it asked ORDS for UNPROTECTED access. This version keeps
-- ORDS's default, which is "authorization required", and then gives one OAuth2
-- client the privileges ORDS created for these objects. Only a caller holding
-- that client's secret (the Next.js server, never a browser) can read or write.
--
-- Every step runs even if an earlier one fails, and the script ends by listing
-- what failed (one error), so you see everything in one run.

DECLARE
  v_failed VARCHAR2(4000);
  v_privs  VARCHAR2(4000);

  PROCEDURE step(p_label IN VARCHAR2, p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || CHR(10) || p_label || ': ' || SUBSTR(SQLERRM, 1, 150);
  END step;

  PROCEDURE rest(p_object IN VARCHAR2, p_type IN VARCHAR2, p_alias IN VARCHAR2) IS
  BEGIN
    -- default authorization (required) is deliberate
    step('enable ' || p_alias,
      'BEGIN ORDS.ENABLE_OBJECT(p_enabled => TRUE, p_schema => USER, p_object => '''
      || p_object || ''', p_object_type => ''' || p_type
      || ''', p_object_alias => ''' || p_alias || '''); END;');
  END rest;
BEGIN
  -- tables the server writes
  rest('GCODE_EVENT_TEAM',            'TABLE', 'portal_team');
  rest('GCODE_EVENT_SHARE_LINKS',     'TABLE', 'portal_share_links');
  rest('GCODE_EVENT_CHECKINS',        'TABLE', 'portal_checkins');
  rest('GCODE_EVENT_COMMUNICATIONS',  'TABLE', 'portal_communications');
  rest('GCODE_EVENT_COMM_RECIPIENTS', 'TABLE', 'portal_comm_recipients');
  rest('GCODE_EVENT_WEBINAR',         'TABLE', 'portal_webinar');
  rest('GCODE_EVENT_LIVE_ATTENDANCE', 'TABLE', 'portal_live_attendance');
  rest('GCODE_EVENT_LIVE_EVENTS',     'TABLE', 'portal_live_events');
  rest('GCODE_EVENT_LIVE_BLOCKS',     'TABLE', 'portal_live_blocks');
  -- views the server only reads
  rest('GCODE_PORTAL_V_EVENTS',       'VIEW',  'portal_v_events');
  rest('GCODE_PORTAL_V_PARTICIPANTS', 'VIEW',  'portal_v_participants');
  rest('GCODE_PORTAL_V_MONEY',        'VIEW',  'portal_v_money');
  rest('GCODE_PORTAL_V_PANELISTS',    'VIEW',  'portal_v_panelists');

  -- the privileges ORDS created for exactly these aliases
  BEGIN
    EXECUTE IMMEDIATE
      'SELECT LISTAGG(name, '','') WITHIN GROUP (ORDER BY name) FROM user_ords_privileges '
      || 'WHERE name LIKE ''oracle.dbtools.autorest.privilege.%'' '
      || 'AND REGEXP_LIKE(UPPER(name), ''\.PORTAL_[A-Z_]+$'')'
      INTO v_privs;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed || CHR(10) || 'list privileges: ' || SUBSTR(SQLERRM, 1, 150);
  END;

  -- the OAuth2 client the Next.js server signs in with
  step('remove old client', 'BEGIN OAUTH.DELETE_CLIENT(p_name => ''gcode_portal_server''); END;');
  IF v_privs IS NULL THEN
    v_failed := v_failed || CHR(10) || 'client: no AutoREST privileges were found to grant';
  ELSE
    step('create client',
      'BEGIN OAUTH.CREATE_CLIENT(p_name => ''gcode_portal_server'', '
      || 'p_grant_type => ''client_credentials'', '
      || 'p_owner => ''GCODE'', '
      || 'p_description => ''Next.js server routes for the organizer portal and live room'', '
      || 'p_support_email => ''shashwat@gcode.in'', '
      || 'p_privilege_names => ''' || v_privs || '''); END;');
  END IF;
  COMMIT;

  IF v_failed IS NOT NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'Some steps failed:' || v_failed);
  END IF;
END;
/

-- Run each of these on its own in SQL Commands.
-- 1. What was enabled (expect 13 rows):
--      SELECT object_name, object_alias, auto_rest_auth FROM user_ords_enabled_objects
--       WHERE object_alias LIKE 'portal\_%' ESCAPE '\';
-- 2. The client id and secret for Vercel (never in git, never NEXT_PUBLIC_):
--      SELECT name, client_id, client_secret FROM user_ords_clients
--       WHERE name = 'gcode_portal_server';
