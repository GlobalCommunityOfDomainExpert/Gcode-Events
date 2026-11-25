-- Retire the old unauthenticated DELETE /events/:id route. Run in SQL Workshop >
-- SQL Scripts (WKSP_GCODE2) AFTER 00_run_on_prod.sql and after 02_rest.sql of the
-- organizer portal, and after the app that uses /api/portal/events/:id is live.
-- Re-runnable: if the handler is already gone it says so and carries on.
--
-- Events are now deleted by the Next.js route, which verifies the admin token
-- and reaches the database through portal_events/:id (key-guarded, trigger
-- still applies). The package procedure gcode_events_api.delete_event is left
-- in place but nothing exposes it.

BEGIN
  ORDS.DELETE_HANDLER(
    p_module_name => 'gcode.events.v1',
    p_pattern     => ':id',
    p_method      => 'DELETE');
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Old DELETE /events/:id handler removed.');
EXCEPTION WHEN OTHERS THEN
  DBMS_OUTPUT.PUT_LINE('Nothing removed: ' || SUBSTR(SQLERRM, 1, 200));
END;
/

-- Check: no DELETE handler left on gcode.events.v1 :id (expect no rows).
SELECT m.name AS module, t.uri_template, h.method
  FROM user_ords_modules m
  JOIN user_ords_templates t ON t.module_id = m.id
  JOIN user_ords_handlers  h ON h.template_id = t.id
 WHERE m.name = 'gcode.events.v1' AND t.uri_template = ':id' AND h.method = 'DELETE';

-- Undo (restores the old route, which has no admin check):
-- BEGIN ORDS.DEFINE_HANDLER(p_module_name => 'gcode.events.v1', p_pattern => ':id',
--   p_method => 'DELETE', p_source_type => 'plsql/block', p_mimes_allowed => NULL,
--   p_comments => NULL, p_source => 'BEGIN gcode_events_api.delete_event(p_id => :id); END;');
--   COMMIT; END;
