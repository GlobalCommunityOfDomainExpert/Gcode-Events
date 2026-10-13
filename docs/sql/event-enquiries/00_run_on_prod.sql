-- Store event details enquiries in WKSP_GCODE2 for follow-up. Email sending
-- is intentionally disabled for now.

BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE GCODE_EVENT_ENQUIRIES (
      ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      EVENT_ID   NUMBER NOT NULL REFERENCES EVENTS (ID),
      EVENT_TITLE VARCHAR2(500) NOT NULL,
      EMAIL      VARCHAR2(320) NOT NULL,
      PHONE      VARCHAR2(20) NOT NULL,
      CREATED_ON TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE
    'CREATE INDEX IX_GCODE_EVENT_ENQUIRIES_CREATED ON GCODE_EVENT_ENQUIRIES (CREATED_ON)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

CREATE OR REPLACE
PACKAGE GCODE_EVENT_ENQUIRIES_API AS
  PROCEDURE submit_enquiry(
    p_event_id IN NUMBER,
    p_email    IN VARCHAR2,
    p_phone    IN VARCHAR2
  );
END GCODE_EVENT_ENQUIRIES_API;
/

CREATE OR REPLACE
PACKAGE BODY GCODE_EVENT_ENQUIRIES_API AS
  PROCEDURE submit_enquiry(
    p_event_id IN NUMBER,
    p_email    IN VARCHAR2,
    p_phone    IN VARCHAR2
  ) IS
    l_email       VARCHAR2(320) := LOWER(TRIM(p_email));
    l_phone       VARCHAR2(20) := REGEXP_REPLACE(TRIM(p_phone), '[^0-9+]', '');
    l_event_title EVENTS.TITLE%TYPE;
  BEGIN
    IF l_email IS NULL OR LENGTH(l_email) > 320 OR
       NOT REGEXP_LIKE(l_email, '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$', 'i') THEN
      RAISE_APPLICATION_ERROR(-20060, 'Enter a valid email address');
    END IF;

    IF l_phone IS NULL OR NOT REGEXP_LIKE(l_phone, '^\+?[0-9]{7,15}$') THEN
      RAISE_APPLICATION_ERROR(-20061, 'Enter a valid phone number');
    END IF;

    BEGIN
      SELECT title INTO l_event_title FROM events WHERE id = p_event_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20062, 'Event not found');
    END;

    INSERT INTO GCODE_EVENT_ENQUIRIES (
      EVENT_ID, EVENT_TITLE, EMAIL, PHONE
    ) VALUES (
      p_event_id, l_event_title, l_email, l_phone
    );
  END submit_enquiry;
END GCODE_EVENT_ENQUIRIES_API;
/

BEGIN
  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'gcode.events.v1',
    p_pattern     => ':id/enquiries',
    p_priority    => 0,
    p_etag_type   => 'HASH',
    p_etag_query  => NULL,
    p_comments    => 'Submit an event details enquiry');

  ORDS.DEFINE_HANDLER(
    p_module_name   => 'gcode.events.v1',
    p_pattern       => ':id/enquiries',
    p_method        => 'POST',
    p_source_type   => 'plsql/block',
    p_mimes_allowed => NULL,
    p_comments      => 'Store event details enquiry for GCODE follow-up',
    p_source        =>
'BEGIN
  APEX_JSON.parse(:body_text);
  GCODE_EVENT_ENQUIRIES_API.submit_enquiry(
    p_event_id => TO_NUMBER(:id),
    p_email    => APEX_JSON.get_varchar2(p_path => ''email''),
    p_phone    => APEX_JSON.get_varchar2(p_path => ''phone'')
  );
  APEX_JSON.open_object;
  APEX_JSON.write(''ok'', TRUE);
  APEX_JSON.close_object;
  :status_code := 201;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    APEX_JSON.open_object;
    APEX_JSON.write(''error'', SQLERRM);
    APEX_JSON.close_object;
    :status_code := 400;
END;');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
