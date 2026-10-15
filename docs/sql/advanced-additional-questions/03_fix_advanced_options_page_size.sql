-- Update only the GET handler that lists advanced follow-up choices.
-- Return the event's rows as an explicit JSON items array. This does not
-- modify event, question, option, or answer data.
-- Run in WKSP_GCODE2 using SQL Scripts / Run Script.

BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name=>'gcode.events.v1',
    p_pattern=>':id/advanced-question-tree-options',
    p_method=>'GET',
    p_source_type=>'plsql/block',
    p_source=>q'~
DECLARE
  l_event_id NUMBER := TO_NUMBER(:id);
BEGIN
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.OPEN_ARRAY('items');
  FOR r IN (
    SELECT o.id, s.question_id, s.source_option_id, o.setting_id,
           o.option_label, o.sort_order
      FROM gcode_event_adv_options o
      JOIN gcode_event_adv_option_settings s ON s.id = o.setting_id
     WHERE s.event_id = l_event_id
       AND o.is_active = 1
     ORDER BY s.question_id, s.source_option_id, o.sort_order, o.id
  ) LOOP
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('id', r.id);
    APEX_JSON.WRITE('question_id', r.question_id);
    APEX_JSON.WRITE('source_option_id', r.source_option_id);
    APEX_JSON.WRITE('setting_id', r.setting_id);
    APEX_JSON.WRITE('option_label', r.option_label);
    APEX_JSON.WRITE('sort_order', r.sort_order);
    APEX_JSON.CLOSE_OBJECT;
  END LOOP;
  APEX_JSON.CLOSE_ARRAY;
  APEX_JSON.CLOSE_OBJECT;
END;
~',
    p_comments=>'Advanced follow-up choices JSON response'
  );
  COMMIT;
END;
/
