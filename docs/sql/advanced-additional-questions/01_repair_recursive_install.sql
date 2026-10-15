-- Repair/upgrade for the first advanced-question tables already created in WKSP_GCODE2.
-- Preserves all existing rows. Do NOT run 00_run_on_prod.sql again on this schema.
-- Run this whole file with SQL Scripts / Run Script.

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count FROM user_tab_columns
   WHERE table_name='GCODE_EVENT_ADV_OPTION_SETTINGS' AND column_name='PARENT_ADV_OPTION_ID';
  IF l_count=0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE GCODE_EVENT_ADV_OPTION_SETTINGS ADD (PARENT_ADV_OPTION_ID NUMBER)';
  END IF;
  SELECT COUNT(*) INTO l_count FROM user_tab_columns
   WHERE table_name='GCODE_EVENT_ADV_ANSWERS' AND column_name='PARENT_ADV_OPTION_ID';
  IF l_count=0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE GCODE_EVENT_ADV_ANSWERS ADD (PARENT_ADV_OPTION_ID NUMBER)';
  END IF;

  -- The old unique rule allowed only one follow-up per source choice.
  -- Recursive follow-ups need one setting per parent choice, so replace it.
  SELECT COUNT(*) INTO l_count FROM user_constraints
   WHERE table_name='GCODE_EVENT_ADV_OPTION_SETTINGS'
     AND constraint_name='UQ_GCODE_ADV_Q_SOURCE';
  IF l_count>0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE GCODE_EVENT_ADV_OPTION_SETTINGS DROP CONSTRAINT UQ_GCODE_ADV_Q_SOURCE';
  END IF;

  SELECT COUNT(*) INTO l_count FROM user_indexes
   WHERE index_name='UQ_GCODE_ADV_Q_SOURCE';
  IF l_count=0 THEN
    EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX UQ_GCODE_ADV_Q_SOURCE ON GCODE_EVENT_ADV_OPTION_SETTINGS (EVENT_ID, QUESTION_ID, SOURCE_OPTION_ID, NVL(PARENT_ADV_OPTION_ID, 0))';
  END IF;

  SELECT COUNT(*) INTO l_count FROM user_constraints
   WHERE table_name='GCODE_EVENT_ADV_OPTION_SETTINGS'
     AND constraint_name='FK_GCODE_ADV_PARENT_OPT';
  IF l_count=0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE GCODE_EVENT_ADV_OPTION_SETTINGS ADD CONSTRAINT FK_GCODE_ADV_PARENT_OPT FOREIGN KEY (PARENT_ADV_OPTION_ID) REFERENCES GCODE_EVENT_ADV_OPTIONS(ID) ON DELETE CASCADE';
  END IF;
END;
/
CREATE OR REPLACE PACKAGE GCODE_EVENT_ADV_Q_API AS
  PROCEDURE set_enabled(p_event_id NUMBER, p_enabled NUMBER);
  PROCEDURE save_answers(p_participant_id NUMBER, p_items CLOB);
  PROCEDURE save_configuration(p_event_id NUMBER, p_items CLOB);
END GCODE_EVENT_ADV_Q_API;
/

CREATE OR REPLACE PACKAGE BODY GCODE_EVENT_ADV_Q_API AS
  PROCEDURE check_enabled(p_event_id NUMBER) IS
    l_enabled NUMBER;
  BEGIN
    SELECT NVL((SELECT advanced_enabled FROM gcode_event_adv_q_settings
                 WHERE event_id = p_event_id), 0) INTO l_enabled FROM dual;
    IF l_enabled <> 1 THEN
      RAISE_APPLICATION_ERROR(-20300, 'Advanced questions are not enabled for this event');
    END IF;
  END;

  PROCEDURE set_enabled(p_event_id NUMBER, p_enabled NUMBER) IS
    l_exists NUMBER;
  BEGIN
    IF p_enabled NOT IN (0,1) THEN
      RAISE_APPLICATION_ERROR(-20301, 'Enabled must be 0 or 1');
    END IF;
    SELECT COUNT(*) INTO l_exists FROM events WHERE id = p_event_id;
    IF l_exists = 0 THEN RAISE_APPLICATION_ERROR(-20302, 'Event not found'); END IF;
    MERGE INTO gcode_event_adv_q_settings d
    USING (SELECT p_event_id event_id FROM dual) s ON (d.event_id = s.event_id)
    WHEN MATCHED THEN UPDATE SET d.advanced_enabled = p_enabled
    WHEN NOT MATCHED THEN INSERT (event_id, advanced_enabled) VALUES (p_event_id, p_enabled);
  END;

  -- Reads existing question/choice definitions only; writes only new feature rows.
  PROCEDURE save_configuration(p_event_id NUMBER, p_items CLOB) IS
    l_root_valid NUMBER;
    l_rows JSON_ARRAY_T;
    l_root JSON_OBJECT_T;
    l_question_id NUMBER;
    l_source_option_id NUMBER;
    l_children JSON_ARRAY_T;
    l_enabled NUMBER;
    l_required NUMBER;
    l_allow_other NUMBER;
    PROCEDURE save_level(
      p_question_id NUMBER, p_source_option_id NUMBER, p_parent_option_id NUMBER,
      p_enabled NUMBER, p_required NUMBER, p_allow_other NUMBER, p_options JSON_ARRAY_T
    ) IS
      l_setting_id NUMBER;
      l_option_id NUMBER;
      l_node JSON_OBJECT_T;
      l_children JSON_ARRAY_T;
      l_label VARCHAR2(200);
      l_enabled NUMBER;
      l_required NUMBER;
      l_sort_order NUMBER;
    BEGIN
      BEGIN
        SELECT id INTO l_setting_id FROM gcode_event_adv_option_settings
         WHERE event_id=p_event_id AND question_id=p_question_id
           AND source_option_id=p_source_option_id
           AND NVL(parent_adv_option_id,0)=NVL(p_parent_option_id,0);
        UPDATE gcode_event_adv_option_settings
           SET is_enabled=p_enabled, is_required=p_required, allow_other=p_allow_other
         WHERE id=l_setting_id;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        INSERT INTO gcode_event_adv_option_settings
          (event_id,question_id,source_option_id,parent_adv_option_id,is_enabled,is_required,allow_other)
        VALUES (p_event_id,p_question_id,p_source_option_id,p_parent_option_id,p_enabled,p_required,p_allow_other)
        RETURNING id INTO l_setting_id;
      END;
      IF p_enabled=1 AND (p_options IS NULL OR p_options.get_size=0) THEN
        RAISE_APPLICATION_ERROR(-20307,'Add at least one choice to an enabled follow-up');
      END IF;
      IF p_options IS NULL THEN RETURN; END IF;
      FOR i IN 0 .. p_options.get_size-1 LOOP
        l_node := TREAT(p_options.get(i) AS JSON_OBJECT_T);
        l_option_id := l_node.get_number('id');
        l_label := TRIM(l_node.get_string('label'));
        l_sort_order := NVL(l_node.get_number('sortOrder'),i);
        IF l_label IS NULL THEN RAISE_APPLICATION_ERROR(-20304,'Follow-up choice label is required'); END IF;
        IF l_option_id IS NULL THEN
          INSERT INTO gcode_event_adv_options(setting_id,option_label,sort_order,is_active)
          VALUES(l_setting_id,l_label,l_sort_order,1)
          RETURNING id INTO l_option_id;
        ELSE
          UPDATE gcode_event_adv_options SET option_label=l_label,
            sort_order=l_sort_order,is_active=1
           WHERE id=l_option_id AND setting_id=l_setting_id;
          IF SQL%ROWCOUNT=0 THEN RAISE_APPLICATION_ERROR(-20305,'Follow-up choice does not belong to this parent'); END IF;
        END IF;
        l_enabled := CASE WHEN l_node.get_boolean('enabled') THEN 1 ELSE 0 END;
        l_required := CASE WHEN l_node.get_boolean('required') THEN 1 ELSE 0 END;
        l_children := l_node.get_array('options');
        save_level(p_question_id,p_source_option_id,l_option_id,l_enabled,l_required,0,l_children);
      END LOOP;
    END;
  BEGIN
    check_enabled(p_event_id);
    UPDATE gcode_event_adv_option_settings SET is_enabled=0,is_required=0,allow_other=0 WHERE event_id=p_event_id;
    UPDATE gcode_event_adv_options o SET is_active=0
     WHERE EXISTS (SELECT 1 FROM gcode_event_adv_option_settings s WHERE s.id=o.setting_id AND s.event_id=p_event_id);
    l_rows := JSON_ARRAY_T.parse(p_items);
    FOR i IN 0 .. l_rows.get_size-1 LOOP
      l_root := TREAT(l_rows.get(i) AS JSON_OBJECT_T);
      l_question_id := l_root.get_number('questionId');
      l_source_option_id := l_root.get_number('sourceOptionId');
      SELECT COUNT(*) INTO l_root_valid FROM gcode_event_questions q
       JOIN gcode_event_question_options o ON o.question_id=q.id
       WHERE q.id=l_question_id AND q.event_id=p_event_id AND q.question_type='CHECKBOX'
         AND o.id=l_source_option_id;
      IF l_root_valid=0 THEN RAISE_APPLICATION_ERROR(-20303,'Checkbox choice was not found for this event'); END IF;
      l_enabled := CASE WHEN l_root.get_boolean('enabled') THEN 1 ELSE 0 END;
      l_required := CASE WHEN l_root.get_boolean('required') THEN 1 ELSE 0 END;
      l_allow_other := CASE WHEN l_root.get_boolean('allowOther') THEN 1 ELSE 0 END;
      l_children := l_root.get_array('options');
      save_level(l_question_id,l_source_option_id,NULL,l_enabled,l_required,l_allow_other,l_children);
    END LOOP;
  END;

  PROCEDURE save_answers(p_participant_id NUMBER, p_items CLOB) IS
    l_event_id NUMBER;
    l_valid NUMBER;
  BEGIN
    SELECT event_id INTO l_event_id FROM gcode_event_participants WHERE id=p_participant_id;
    check_enabled(l_event_id);
    -- Validate each submitted choice belongs to the enabled follow-up for this event.
    SELECT COUNT(*) INTO l_valid FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
      question_id NUMBER PATH '$.questionId', setting_id NUMBER PATH '$.settingId', source_option_id NUMBER PATH '$.sourceOptionId',
      parent_advanced_option_id NUMBER PATH '$.parentAdvancedOptionId', advanced_option_id NUMBER PATH '$.advancedOptionId',
      is_other NUMBER PATH '$.isOther', answer_text VARCHAR2(1000) PATH '$.answerText')) a
     WHERE NOT EXISTS (
       SELECT 1 FROM gcode_event_adv_option_settings s
        WHERE s.id=a.setting_id
          AND s.question_id=a.question_id
          AND s.source_option_id=a.source_option_id
          AND s.event_id=l_event_id
          AND (
            (NVL(a.is_other,0)=1
             AND s.parent_adv_option_id IS NULL
             AND a.parent_advanced_option_id IS NULL
             AND a.advanced_option_id IS NULL
             AND TRIM(a.answer_text) IS NOT NULL
             AND s.allow_other=1
             AND EXISTS (
               SELECT 1
                 FROM gcode_event_questions q
                 JOIN gcode_event_question_options qo ON qo.question_id=q.id
                WHERE q.id=a.question_id
                  AND q.event_id=l_event_id
                  AND q.question_type='CHECKBOX'
                  AND qo.id=a.source_option_id
                  AND UPPER(TRIM(qo.option_label)) IN ('OTHER','OTHERS','OTHER (PLEASE SPECIFY)')
             )
             AND EXISTS (
               SELECT 1 FROM participant_question_answers pa
                WHERE pa.participant_id=p_participant_id
                  AND pa.question_id=a.question_id
                  AND pa.option_id=a.source_option_id
             )
            )
            OR
            (NVL(a.is_other,0)=0
             AND s.is_enabled=1
             AND NVL(a.parent_advanced_option_id,0)=NVL(s.parent_adv_option_id,0)
             AND EXISTS (
               SELECT 1 FROM gcode_event_adv_options opt
                WHERE opt.id=a.advanced_option_id
                  AND opt.setting_id=s.id
                  AND opt.is_active=1
             )
             AND (
               (s.parent_adv_option_id IS NULL AND EXISTS (
                 SELECT 1 FROM participant_question_answers pa
                  WHERE pa.participant_id=p_participant_id
                    AND pa.question_id=a.question_id
                    AND pa.option_id=a.source_option_id
               ))
               OR
               (s.parent_adv_option_id IS NOT NULL AND EXISTS (
                 SELECT 1
                   FROM JSON_TABLE(p_items,'$[*]' COLUMNS (
                     advanced_option_id NUMBER PATH '$.advancedOptionId',
                     is_other NUMBER PATH '$.isOther'
                   )) parent_row
                  WHERE parent_row.advanced_option_id=s.parent_adv_option_id
                    AND NVL(parent_row.is_other,0)=0
               ))
             )
            )
          )
       );
    IF l_valid>0 THEN RAISE_APPLICATION_ERROR(-20306, 'Invalid advanced answer'); END IF;
    SELECT COUNT(*) INTO l_valid
      FROM gcode_event_adv_option_settings s
      JOIN participant_question_answers pa
        ON pa.participant_id=p_participant_id AND pa.question_id=s.question_id
       AND pa.option_id=s.source_option_id
     WHERE s.event_id=l_event_id AND s.is_enabled=1 AND s.is_required=1
       AND ((s.parent_adv_option_id IS NULL AND EXISTS (SELECT 1 FROM participant_question_answers pa
              WHERE pa.participant_id=p_participant_id AND pa.question_id=s.question_id AND pa.option_id=s.source_option_id))
         OR (s.parent_adv_option_id IS NOT NULL AND EXISTS (SELECT 1 FROM JSON_TABLE(p_items,'$[*]' COLUMNS (
              advanced_option_id NUMBER PATH '$.advancedOptionId',is_other NUMBER PATH '$.isOther')) parent_row
              WHERE parent_row.advanced_option_id=s.parent_adv_option_id AND NVL(parent_row.is_other,0)=0)))
       AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
         setting_id NUMBER PATH '$.settingId', advanced_option_id NUMBER PATH '$.advancedOptionId', is_other NUMBER PATH '$.isOther')) a
        WHERE a.setting_id=s.id AND a.advanced_option_id IS NOT NULL AND NVL(a.is_other,0)=0);
    IF l_valid>0 THEN RAISE_APPLICATION_ERROR(-20307, 'Please choose an answer for each required follow-up'); END IF;

    SELECT COUNT(*) INTO l_valid
      FROM gcode_event_adv_option_settings s
      JOIN gcode_event_question_options qo ON qo.id=s.source_option_id AND qo.question_id=s.question_id
      JOIN participant_question_answers pa ON pa.participant_id=p_participant_id
       AND pa.question_id=s.question_id AND pa.option_id=s.source_option_id
     WHERE s.event_id=l_event_id AND s.allow_other=1
       AND UPPER(TRIM(qo.option_label)) IN ('OTHER','OTHERS','OTHER (PLEASE SPECIFY)')
       AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
         question_id NUMBER PATH '$.questionId', source_option_id NUMBER PATH '$.sourceOptionId',
         is_other NUMBER PATH '$.isOther', answer_text VARCHAR2(1000) PATH '$.answerText')) a
         WHERE a.question_id=s.question_id AND a.source_option_id=s.source_option_id
           AND NVL(a.is_other,0)=1 AND TRIM(a.answer_text) IS NOT NULL);
    IF l_valid>0 THEN RAISE_APPLICATION_ERROR(-20308, 'Please specify the selected Other answer'); END IF;
    DELETE FROM gcode_event_adv_answers WHERE participant_id=p_participant_id;
    INSERT INTO gcode_event_adv_answers(participant_id,setting_id,question_id,source_option_id,parent_adv_option_id,adv_option_id,is_other,answer_text)
    SELECT p_participant_id,s.id,s.question_id,s.source_option_id,s.parent_adv_option_id,a.advanced_option_id,NVL(a.is_other,0),a.answer_text
      FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
        question_id NUMBER PATH '$.questionId', setting_id NUMBER PATH '$.settingId', source_option_id NUMBER PATH '$.sourceOptionId', advanced_option_id NUMBER PATH '$.advancedOptionId',
        is_other NUMBER PATH '$.isOther', answer_text VARCHAR2(1000) PATH '$.answerText')) a
      JOIN gcode_event_adv_option_settings s ON s.id=a.setting_id AND s.question_id=a.question_id AND s.source_option_id=a.source_option_id AND s.event_id=l_event_id;
  END;
END GCODE_EVENT_ADV_Q_API;
/

BEGIN
  ORDS.DEFINE_TEMPLATE(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-flag',p_priority=>0,p_etag_type=>'HASH',p_etag_query=>NULL,p_comments=>'Advanced questions event setting');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-flag',p_method=>'GET',p_source_type=>'json/query',p_source=>'SELECT NVL((SELECT advanced_enabled FROM gcode_event_adv_q_settings WHERE event_id=:id),0) advanced_enabled FROM dual');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-flag',p_method=>'PUT',p_source_type=>'plsql/block',p_source=>'BEGIN APEX_JSON.parse(:body_text); GCODE_EVENT_ADV_Q_API.set_enabled(TO_NUMBER(:id),APEX_JSON.get_number(p_path=>''advancedEnabled'')); APEX_JSON.open_object; APEX_JSON.write(''ok'',TRUE); APEX_JSON.close_object; END;');

  ORDS.DEFINE_TEMPLATE(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree-settings',p_priority=>0,p_etag_type=>'HASH',p_etag_query=>NULL,p_comments=>'Advanced option settings');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree-settings',p_method=>'GET',p_source_type=>'json/query',p_source=>'SELECT id setting_id, question_id, source_option_id, parent_adv_option_id, is_enabled, is_required, allow_other FROM gcode_event_adv_option_settings WHERE event_id=:id ORDER BY question_id,source_option_id,parent_adv_option_id');

  ORDS.DEFINE_TEMPLATE(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree-options',p_priority=>0,p_etag_type=>'HASH',p_etag_query=>NULL,p_comments=>'Advanced follow-up choices');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree-options',p_method=>'GET',p_source_type=>'plsql/block',p_source=>q'~DECLARE l_event_id NUMBER := TO_NUMBER(:id); BEGIN APEX_JSON.OPEN_OBJECT; APEX_JSON.OPEN_ARRAY('items'); FOR r IN (SELECT o.id,s.question_id,s.source_option_id,o.setting_id,o.option_label,o.sort_order FROM gcode_event_adv_options o JOIN gcode_event_adv_option_settings s ON s.id=o.setting_id WHERE s.event_id=l_event_id AND o.is_active=1 ORDER BY s.question_id,s.source_option_id,o.sort_order,o.id) LOOP APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('id',r.id); APEX_JSON.WRITE('question_id',r.question_id); APEX_JSON.WRITE('source_option_id',r.source_option_id); APEX_JSON.WRITE('setting_id',r.setting_id); APEX_JSON.WRITE('option_label',r.option_label); APEX_JSON.WRITE('sort_order',r.sort_order); APEX_JSON.CLOSE_OBJECT; END LOOP; APEX_JSON.CLOSE_ARRAY; APEX_JSON.CLOSE_OBJECT; END;~');

  ORDS.DEFINE_TEMPLATE(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree',p_priority=>0,p_etag_type=>'HASH',p_etag_query=>NULL,p_comments=>'Recursive advanced question configuration');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.events.v1',p_pattern=>':id/advanced-question-tree',p_method=>'POST',p_source_type=>'plsql/block',p_source=>'BEGIN GCODE_EVENT_ADV_Q_API.save_configuration(TO_NUMBER(:id),:body_text); APEX_JSON.open_object; APEX_JSON.write(''ok'',TRUE); APEX_JSON.close_object; END;');

  ORDS.DEFINE_TEMPLATE(p_module_name=>'gcode.participants.v1',p_pattern=>':id/advanced-question-tree-answers',p_priority=>0,p_etag_type=>'HASH',p_etag_query=>NULL,p_comments=>'Participant advanced answers');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.participants.v1',p_pattern=>':id/advanced-question-tree-answers',p_method=>'GET',p_source_type=>'json/query',p_source=>'SELECT setting_id,question_id,source_option_id,parent_adv_option_id parent_advanced_option_id,adv_option_id advanced_option_id,is_other,answer_text FROM gcode_event_adv_answers WHERE participant_id=:id');
  ORDS.DEFINE_HANDLER(p_module_name=>'gcode.participants.v1',p_pattern=>':id/advanced-question-tree-answers',p_method=>'POST',p_source_type=>'plsql/block',p_source=>'BEGIN GCODE_EVENT_ADV_Q_API.save_answers(TO_NUMBER(:id),:body_text); APEX_JSON.open_object; APEX_JSON.write(''ok'',TRUE); APEX_JSON.close_object; END;');
  COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/
