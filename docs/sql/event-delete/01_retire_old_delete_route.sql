-- Retire the old unauthenticated DELETE /events/:id route. Run in SQL Workshop >
-- SQL Scripts (WKSP_GCODE2) AFTER 00_run_on_prod.sql, and after the app that
-- uses /api/v1/events/:id is live.
-- Re-runnable.
--
-- ORDS.DELETE_HANDLER does not take these arguments on every ORDS version
-- (PLS-00306), so the handler is REPLACED instead: DEFINE_HANDLER on the same
-- module, pattern and method overwrites it. The route now deletes nothing and
-- answers 410 Gone.
--
-- Events are deleted by the Next.js route, which verifies the admin token and
-- reaches the database through portal_events/:id (key-guarded, and the trigger
-- still applies). gcode_events_api.delete_event stays but nothing exposes it.

BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'gcode.events.v1',
    p_pattern        => ':id',
    p_method         => 'DELETE',
    p_source_type    => 'plsql/block',
    p_mimes_allowed  => NULL,
    p_comments       => 'Retired. Use /api/v1/events/:id',
    p_source         =>
'BEGIN
  :status_code := 410;
  APEX_JSON.open_object;
  APEX_JSON.write(''error'', ''This route was retired. Delete events from the app.'');
  APEX_JSON.close_object;
END;');
  COMMIT;
END;
/

-- Check: the DELETE handler's source now starts with the 410 block.
SELECT h.method, SUBSTR(h.source, 1, 60) AS source_start
  FROM user_ords_modules m
  JOIN user_ords_templates t ON t.module_id = m.id
  JOIN user_ords_handlers  h ON h.template_id = t.id
 WHERE m.name = 'gcode.events.v1' AND t.uri_template = ':id' AND h.method = 'DELETE';

-- Undo (restores the old route, which has no admin check):
-- BEGIN ORDS.DEFINE_HANDLER(p_module_name => 'gcode.events.v1', p_pattern => ':id',
--   p_method => 'DELETE', p_source_type => 'plsql/block', p_mimes_allowed => NULL,
--   p_comments => NULL, p_source => 'BEGIN gcode_events_api.delete_event(p_id => :id); END;');
--   COMMIT; END;
