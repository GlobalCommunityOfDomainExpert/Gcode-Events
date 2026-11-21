-- Reverts everything Handover 7 added to APEX, including the failed
-- 02_packages.sql run (three packages whose bodies did not compile). One
-- script, run once in WKSP_GCODE2. Every step is guarded, so it is safe to run
-- even if some of it was never created.
--
-- It does NOT touch your existing tables, packages or ORDS modules, apart from
-- removing the routes Handover 7 added to them. The PANELIST_ROLE and
-- INVITE_NOTE columns on the panelists table are left in place: they are
-- nullable and harmless, and 01_tables.sql reuses them.
--
-- After this, run 01_tables.sql and 02_rest.sql to install the Next.js-backed
-- version.

DECLARE
  PROCEDURE try(p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION WHEN OTHERS THEN NULL;   -- not there: nothing to revert
  END try;
BEGIN
  -- 1. REST routes and OAuth client from any earlier attempt
  FOR r IN (SELECT column_value AS pattern FROM TABLE(sys.odcivarchar2list(
              ':id/team', ':id/share-links', ':id/check-ins', ':id/communications',
              ':id/webinar', ':id/live-access', ':id/live/token',
              ':id/live/remove-person', ':id/live/:action'))) LOOP
    BEGIN
      ORDS.DELETE_TEMPLATE(p_module_name => 'gcode.events.v1', p_pattern => r.pattern);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  FOR m IN (SELECT column_value AS name FROM TABLE(sys.odcivarchar2list(
              'gcode.team.v1', 'gcode.share-links.v1', 'gcode.shared.v1'))) LOOP
    BEGIN
      ORDS.DELETE_MODULE(p_module_name => m.name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  BEGIN
    ORDS.DELETE_TEMPLATE(p_module_name => 'gcode.webhooks.v1', p_pattern => 'live');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN OAUTH.DELETE_CLIENT(p_name => 'gcode_portal_server'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_PRIVILEGE_MAPPING(p_privilege_name => 'gcode.portal.server', p_pattern => '/portal_*'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_PRIVILEGE(p_name => 'gcode.portal.server'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ORDS.DELETE_ROLE(p_role_name => 'gcode_portal_server'); EXCEPTION WHEN OTHERS THEN NULL; END;
  FOR o IN (SELECT parsing_schema, object_name FROM (
              SELECT USER AS parsing_schema, column_value AS object_name
                FROM TABLE(sys.odcivarchar2list(
                  'GCODE_EVENT_TEAM', 'GCODE_EVENT_SHARE_LINKS', 'GCODE_EVENT_CHECKINS',
                  'GCODE_EVENT_COMMUNICATIONS', 'GCODE_EVENT_COMM_RECIPIENTS',
                  'GCODE_EVENT_WEBINAR', 'GCODE_EVENT_LIVE_ATTENDANCE',
                  'GCODE_EVENT_LIVE_EVENTS', 'GCODE_EVENT_LIVE_BLOCKS',
                  'GCODE_PORTAL_V_EVENTS', 'GCODE_PORTAL_V_PARTICIPANTS',
                  'GCODE_PORTAL_V_MONEY', 'GCODE_PORTAL_V_PANELISTS')))) LOOP
    BEGIN
      ORDS.ENABLE_OBJECT(p_enabled => FALSE, p_schema => o.parsing_schema,
                         p_object => o.object_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
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
                       'GCODE_EVENT_LIVE_COMMANDS', 'GCODE_PORTAL_SETTINGS')
    OR object_name LIKE 'GCODE\_PORTAL\_V\_%' ESCAPE '\';
