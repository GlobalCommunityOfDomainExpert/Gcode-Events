-- Consolidated script: run top to bottom in WKSP_GCODE2. Backup first.

-- 1. Table + index
CREATE TABLE GCODE_EVENT_INTEREST (
  ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID   NUMBER NOT NULL REFERENCES EVENTS (ID),
  EMAIL      VARCHAR2(255) NOT NULL,
  PHONE      VARCHAR2(20),
  USER_ID    NUMBER,
  CREATED_ON TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT UQ_GCODE_EVENT_INTEREST UNIQUE (EVENT_ID, EMAIL)
);

CREATE INDEX IX_GCODE_EVENT_INTEREST_EVENT ON GCODE_EVENT_INTEREST (EVENT_ID);

-- EMAIL is stored lower-cased. USER_ID is set when the interest came from a
-- logged-in user, or when a guest's verified email matches a registered
-- user. PHONE is only ever collected from guests (regex-validated, never
-- OTP/SMS-verified) and stripped of spaces/dashes/parens before storage —
-- logged-in callers never provide one, so it's nullable.

-- 2. Package
CREATE OR REPLACE
PACKAGE GCODE_EVENT_INTEREST_API AS

  -- Records "I'm interested" for an event. One row per (event, email);
  -- repeat calls are a no-op. Logged-in callers pass p_user_id (email is
  -- looked up, no phone collected). Guests pass p_email, which must have
  -- been OTP-verified via AUTH_PKG (GCODE_PENDING_USERS.is_verified = 'Y',
  -- not expired), plus p_phone — format-checked only, never OTP/SMS-verified.
  PROCEDURE express_interest(
    p_event_id IN NUMBER,
    p_email    IN VARCHAR2 DEFAULT NULL,
    p_phone    IN VARCHAR2 DEFAULT NULL,
    p_user_id  IN NUMBER   DEFAULT NULL
  );

END GCODE_EVENT_INTEREST_API;
/

CREATE OR REPLACE
PACKAGE BODY GCODE_EVENT_INTEREST_API AS

  PROCEDURE express_interest(
    p_event_id IN NUMBER,
    p_email    IN VARCHAR2 DEFAULT NULL,
    p_phone    IN VARCHAR2 DEFAULT NULL,
    p_user_id  IN NUMBER   DEFAULT NULL
  ) IS
    l_email    VARCHAR2(255);
    l_phone    VARCHAR2(20);
    l_user_id  NUMBER := p_user_id;
    l_verified NUMBER;
    l_event    NUMBER;
  BEGIN
    SELECT COUNT(*) INTO l_event FROM events WHERE id = p_event_id;
    IF l_event = 0 THEN
      RAISE_APPLICATION_ERROR(-20040, 'Event not found');
    END IF;

    IF p_user_id IS NOT NULL THEN
      BEGIN
        SELECT LOWER(email) INTO l_email FROM gcode_users WHERE user_id = p_user_id;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-20041, 'User not found');
      END;
    ELSE
      l_email := LOWER(TRIM(p_email));
      IF l_email IS NULL OR l_email NOT LIKE '%_@_%.__%' THEN
        RAISE_APPLICATION_ERROR(-20042, 'Valid email is required');
      END IF;

      -- Format only, same as the email pattern check above — no OTP/SMS
      -- verification of the phone itself. Strip spaces/dashes/parens before
      -- checking and storing, so "+91 98765 43210" and "+919876543210"
      -- both validate and land in the table the same way.
      l_phone := REGEXP_REPLACE(TRIM(p_phone), '[^0-9+]', '');
      IF l_phone IS NULL OR NOT REGEXP_LIKE(l_phone, '^\+?[0-9]{7,15}$') THEN
        RAISE_APPLICATION_ERROR(-20044, 'Valid phone number is required');
      END IF;

      SELECT COUNT(*) INTO l_verified
        FROM gcode_pending_users
       WHERE LOWER(email) = l_email
         AND is_verified = 'Y'
         AND expires_at > SYSTIMESTAMP;
      IF l_verified = 0 THEN
        RAISE_APPLICATION_ERROR(-20043, 'Email not verified or session expired');
      END IF;

      -- A verified guest email may already belong to a registered user.
      BEGIN
        SELECT user_id INTO l_user_id FROM gcode_users WHERE LOWER(email) = l_email;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN l_user_id := NULL;
      END;
    END IF;

    BEGIN
      INSERT INTO gcode_event_interest (event_id, email, phone, user_id)
      VALUES (p_event_id, l_email, l_phone, l_user_id);
    EXCEPTION
      WHEN DUP_VAL_ON_INDEX THEN
        -- Already interested — a resubmit still refreshes phone if the
        -- guest is fixing a typo; stays idempotent either way.
        IF l_phone IS NOT NULL THEN
          UPDATE gcode_event_interest
             SET phone = l_phone
           WHERE event_id = p_event_id AND email = l_email;
        END IF;
    END;
  END express_interest;

END GCODE_EVENT_INTEREST_API;
/

-- 3. ORDS route
-- Module: gcode.events.v1
-- Template pattern: :id/interest

BEGIN
  ORDS.DEFINE_TEMPLATE(
      p_module_name    => 'gcode.events.v1',
      p_pattern        => ':id/interest',
      p_priority       => 0,
      p_etag_type      => 'HASH',
      p_etag_query     => NULL,
      p_comments       => NULL);

  ORDS.DEFINE_HANDLER(
      p_module_name    => 'gcode.events.v1',
      p_pattern        => ':id/interest',
      p_method         => 'POST',
      p_source_type    => 'plsql/block',
      p_mimes_allowed  => NULL,
      p_comments       => NULL,
      p_source         =>
'BEGIN
  APEX_JSON.parse(:body_text);
  GCODE_EVENT_INTEREST_API.express_interest(
    p_event_id => :id,
    p_email    => APEX_JSON.get_varchar2(p_path => ''email''),
    p_phone    => APEX_JSON.get_varchar2(p_path => ''phone''),
    -- user_id is a 30-40 digit id sent as a JSON string; read as text to keep precision.
    p_user_id  => TO_NUMBER(APEX_JSON.get_varchar2(p_path => ''user_id''))
  );
  APEX_JSON.open_object;
  APEX_JSON.write(''ok'', true);
  APEX_JSON.close_object;
  :status_code := 201;
EXCEPTION
  WHEN OTHERS THEN
    APEX_JSON.open_object;
    APEX_JSON.write(''error'', SQLERRM);
    APEX_JSON.close_object;
    :status_code := 400;
END;
');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/

-- 4. get_event: add the "interested_count" column to GCODE_EVENTS_API.get_event
--    (see 02_gcode_event_interest_api.sql), then recompile the package body.
