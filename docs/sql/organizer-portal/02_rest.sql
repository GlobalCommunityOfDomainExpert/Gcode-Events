-- Script 2 of 2: let the Next.js server reach the tables from 01_tables.sql
-- over REST. Run in WKSP_GCODE2 after 01_tables.sql. Re-runnable.
--
-- What this does:
--   1. Turns on ORDS AutoREST for the Handover 7 tables and views, under the
--      paths /portal_<name>/ (for example /portal_team/).
--   2. Locks every /portal_* path behind an OAuth2 client, so only a caller that
--      holds the client secret (the Next.js server, never a browser) can use
--      them. These tables hold token hashes and attendee emails.
--   3. Creates that OAuth2 client. Read its id and secret with the query at the
--      bottom, and put them in Vercel as ORDS_CLIENT_ID and ORDS_CLIENT_SECRET.

DECLARE
  PROCEDURE rest(p_object IN VARCHAR2, p_type IN VARCHAR2, p_alias IN VARCHAR2) IS
  BEGIN
    ORDS.ENABLE_OBJECT(
      p_enabled        => TRUE,
      p_schema         => USER,
      p_object         => p_object,
      p_object_type    => p_type,
      p_object_alias   => p_alias,
      p_auto_rest_auth => FALSE);   -- protected by the /portal_* privilege below
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
  BEGIN
    rest('GCODE_PORTAL_V_PANELISTS',  'VIEW',  'portal_v_panelists');
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Skipped panelists view (create it first, see 01_tables.sql): ' || SQLERRM);
  END;

  -- role + privilege covering every /portal_* path
  BEGIN
    ORDS.CREATE_ROLE(p_role_name => 'gcode_portal_server');
  EXCEPTION WHEN OTHERS THEN NULL;   -- already exists
  END;
  DECLARE
    v_roles  OWA.VC_ARR;
    v_pats   OWA.VC_ARR;
  BEGIN
    v_roles(1) := 'gcode_portal_server';
    v_pats(1)  := '/portal_*';
    ORDS.DEFINE_PRIVILEGE(
      p_privilege_name => 'gcode.portal.server',
      p_roles          => v_roles,
      p_patterns       => v_pats,
      p_modules        => OWA.VC_ARR(),
      p_label          => 'GCODE portal server',
      p_description    => 'Server-side access to the organizer portal and live room tables',
      p_comments       => NULL);
  END;

  -- the OAuth2 client the Next.js server signs in with
  BEGIN
    OAUTH.DELETE_CLIENT(p_name => 'gcode_portal_server');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  OAUTH.CREATE_CLIENT(
    p_name            => 'gcode_portal_server',
    p_grant_type      => 'client_credentials',
    p_owner           => 'GCODE',
    p_description     => 'Next.js server routes for the organizer portal and live room',
    p_support_email   => 'shashwat@gcode.in',
    p_privilege_names => 'gcode.portal.server');
  OAUTH.GRANT_CLIENT_ROLE(p_client_name => 'gcode_portal_server',
                          p_role_name   => 'gcode_portal_server');
  COMMIT;
END;
/

-- Run this on its own (SQL Commands) to read the client id and secret. Keep the
-- secret out of git and out of any NEXT_PUBLIC_ variable.
SELECT name, client_id, client_secret FROM user_ords_clients WHERE name = 'gcode_portal_server';
