-- Reverts everything Handover 7 added to APEX, including the failed
-- 02_packages.sql run (three packages whose bodies did not compile). One
-- script, run once in WKSP_GCODE2. Every step is guarded, so it is safe to run
-- even if some of it was never created.
--
-- Every ORDS call is dynamic SQL on purpose: a signature that differs in your
-- ORDS version cannot stop this script from compiling (the first version of it
-- failed that way and removed nothing).
--
-- It does NOT touch your existing tables, packages or ORDS modules. Routes the
-- first attempt may have added to the existing events module (team,
-- share-links, check-ins, communications, webinar, live-access, live/*) are
-- left in place: they only call packages that no longer exist, so they answer
-- with an error and are harmless. Delete them in APEX > RESTful Services if
-- you want them gone. The PANELIST_ROLE and INVITE_NOTE columns on the
-- panelists table are also left: they are nullable and 01_tables.sql reuses
-- them.
--
-- After this, run 01_tables.sql and 02_rest.sql for the Next.js-backed version.

DECLARE
  PROCEDURE try(p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION WHEN OTHERS THEN NULL;   -- not there: nothing to revert
  END try;
BEGIN
  -- 1. REST leftovers
  try('BEGIN ORDS.DELETE_MODULE(p_module_name => ''gcode.portal.v1''); END;');
  try('BEGIN ORDS.DELETE_MODULE(p_module_name => ''gcode.team.v1''); END;');
  try('BEGIN ORDS.DELETE_MODULE(p_module_name => ''gcode.share-links.v1''); END;');
  try('BEGIN ORDS.DELETE_MODULE(p_module_name => ''gcode.shared.v1''); END;');
  try('BEGIN OAUTH.DELETE_CLIENT(p_name => ''gcode_portal_server''); END;');
  try('BEGIN ORDS.DELETE_PRIVILEGE_MAPPING(p_privilege_name => ''gcode.portal.server'', p_pattern => ''/portal_*''); END;');
  try('BEGIN ORDS.DELETE_PRIVILEGE(p_name => ''gcode.portal.server''); END;');
  try('BEGIN ORDS.DELETE_ROLE(p_role_name => ''gcode_portal_server''); END;');
  FOR o IN (SELECT column_value AS object_name FROM TABLE(sys.odcivarchar2list(
              'GCODE_EVENT_TEAM', 'GCODE_EVENT_SHARE_LINKS', 'GCODE_EVENT_CHECKINS',
              'GCODE_EVENT_COMMUNICATIONS', 'GCODE_EVENT_COMM_RECIPIENTS',
              'GCODE_EVENT_WEBINAR', 'GCODE_EVENT_LIVE_ATTENDANCE',
              'GCODE_EVENT_LIVE_EVENTS', 'GCODE_EVENT_LIVE_BLOCKS',
              'GCODE_PORTAL_V_EVENTS', 'GCODE_PORTAL_V_PARTICIPANTS',
              'GCODE_PORTAL_V_MONEY', 'GCODE_PORTAL_V_PANELISTS'))) LOOP
    try('BEGIN ORDS.ENABLE_OBJECT(p_enabled => FALSE, p_schema => USER, p_object => ''' || o.object_name || '''); END;');
  END LOOP;

  -- 2. the packages (the failed ones, and any that compiled)
  try('DROP PACKAGE GCODE_EVENT_HTTP_API');
  try('DROP PACKAGE GCODE_EVENT_LIVE_API');
  try('DROP PACKAGE GCODE_EVENT_PORTAL_API');

  -- 3. views, then tables (children first)
  try('DROP VIEW GCODE_PORTAL_V_EVENTS');
  try('DROP VIEW GCODE_PORTAL_V_PARTICIPANTS');
  try('DROP VIEW GCODE_PORTAL_V_MONEY');
  try('DROP VIEW GCODE_PORTAL_V_PANELISTS');
  try('DROP TABLE GCODE_EVENT_COMM_RECIPIENTS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_COMMUNICATIONS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_CHECKINS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_SHARE_LINKS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_TEAM CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_LIVE_BLOCKS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_LIVE_EVENTS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_LIVE_COMMANDS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_LIVE_ATTENDANCE CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_EVENT_WEBINAR CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_PORTAL_SETTINGS CASCADE CONSTRAINTS PURGE');
  try('DROP TABLE GCODE_PORTAL_KEY CASCADE CONSTRAINTS PURGE');

  -- 4. the column the first version added to EVENTS
  try('ALTER TABLE EVENTS DROP CONSTRAINT CK_EVENTS_LIVE_ROOM');
  try('ALTER TABLE EVENTS DROP COLUMN LIVE_ROOM_ENABLED');

  COMMIT;
END;
/

-- Check: this should return no rows.
SELECT object_name, object_type FROM user_objects
 WHERE object_name IN ('GCODE_EVENT_PORTAL_API', 'GCODE_EVENT_LIVE_API', 'GCODE_EVENT_HTTP_API',
                       'GCODE_EVENT_TEAM', 'GCODE_EVENT_SHARE_LINKS', 'GCODE_EVENT_CHECKINS',
                       'GCODE_EVENT_COMMUNICATIONS', 'GCODE_EVENT_COMM_RECIPIENTS',
                       'GCODE_EVENT_WEBINAR', 'GCODE_EVENT_LIVE_ATTENDANCE',
                       'GCODE_EVENT_LIVE_EVENTS', 'GCODE_EVENT_LIVE_BLOCKS',
                       'GCODE_EVENT_LIVE_COMMANDS', 'GCODE_PORTAL_SETTINGS', 'GCODE_PORTAL_KEY')
    OR object_name LIKE 'GCODE\_PORTAL\_V\_%' ESCAPE '\';
