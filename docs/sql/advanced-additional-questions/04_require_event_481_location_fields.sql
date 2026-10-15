-- Make only Event 481's State, Country, and Pin Code questions required.
-- Does not delete or recreate questions, answers, registrations, or event data.
-- Run in WKSP_GCODE2 using SQL Workshop / Run Script.

DECLARE
  c_event_id CONSTANT NUMBER := 481;
  l_updated NUMBER;
BEGIN
  UPDATE gcode_event_questions
     SET is_required = 1
   WHERE event_id = c_event_id
     AND UPPER(TRIM(prompt)) IN ('STATE', 'COUNTRY', 'PIN CODE');

  l_updated := SQL%ROWCOUNT;
  IF l_updated <> 3 THEN
    RAISE_APPLICATION_ERROR(
      -20482,
      'Expected to update exactly 3 location questions for event 481; updated ' || l_updated
    );
  END IF;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('State, Country, and Pin Code are now required for event 481.');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
