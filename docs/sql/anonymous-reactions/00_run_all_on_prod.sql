-- ============================================================================
-- Anonymous emoji reactions: replace attendee-tied reactions with a
-- client-generated device-token model + server-side 1s-per-device throttle.
-- Audience SCORING (numeric ratings) is unaffected -- still registered
-- Attendee-only, via GCODE_RATINGS_API.submit_rating.
--
-- Run this ENTIRE script, top to bottom, in WKSP_GCODE2 SQL Workshop on the
-- cloud ADB (the ATHARVA MCP connection has no CREATE/ALTER privilege there,
-- so this cannot be run programmatically from the assistant session).
--
-- Already run and verified end-to-end against the local dev DB
-- (localhost:1521/FREEPDB1) before being consolidated here. Take a backup /
-- snapshot of WKSP_GCODE2 before running against prod, per normal process.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. TABLE + INDEX
-- ----------------------------------------------------------------------------

ALTER TABLE GCODE_EVENT_REACTIONS ADD (DEVICE_TOKEN VARCHAR2(64));
CREATE INDEX IX_REACTIONS_DEVICE_TOKEN ON GCODE_EVENT_REACTIONS (DEVICE_TOKEN, CREATED_ON);

-- RATER_ATTENDEE_ID stays on the table (nullable already, FK intact) but is
-- now dead going forward -- new reactions never populate it. Left in place
-- rather than dropped, matching this repo's additive-only migration style.
-- DEVICE_TOKEN is the sole identity anchor for a reaction from here on: a
-- random UUID the browser generates and persists in localStorage
-- (src/lib/reactions/device-token.ts), never tied to a real person or
-- registration.

-- ----------------------------------------------------------------------------
-- 2. PACKAGE: GCODE_RATINGS_API (spec, then body)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE
PACKAGE gcode_ratings_api IS

  PROCEDURE set_current_performer(
    p_event_id       IN NUMBER,
    p_participant_id IN NUMBER,
    p_round_id       IN NUMBER DEFAULT NULL
  );

  PROCEDURE start_rating_window(
    p_event_id IN NUMBER
  );

  PROCEDURE set_intermission(
    p_event_id        IN NUMBER,
    p_is_intermission IN VARCHAR2
  );

  PROCEDURE get_live_state(
    p_event_id           IN  NUMBER,
    p_attendee_id        IN  NUMBER DEFAULT NULL,
    p_participant_id     OUT NUMBER,
    p_participant_name   OUT VARCHAR2,
    p_already_rated      OUT NUMBER,
    p_window_closes_at   OUT VARCHAR2,
    p_avg_rating         OUT NUMBER,
    p_rating_count       OUT NUMBER,
    p_round_id           OUT NUMBER,
    p_is_intermission    OUT VARCHAR2
  );

  PROCEDURE submit_rating(
    p_attendee_id  IN  NUMBER,
    p_performer_id IN  NUMBER,
    p_rating       IN  NUMBER,
    p_created_on   OUT TIMESTAMP
  );

  PROCEDURE send_rating_links(
    p_event_id IN NUMBER
  );

  PROCEDURE submit_reaction(
    p_event_id                 IN NUMBER,
    p_performer_participant_id IN NUMBER,
    p_emoji                    IN VARCHAR2,
    p_device_token             IN VARCHAR2
  );

  PROCEDURE list_reactions_since(
    p_performer_participant_id IN NUMBER,
    p_since_id                 IN NUMBER,
    p_limit                    IN NUMBER DEFAULT 200,
    p_cursor                   OUT SYS_REFCURSOR
  );

  PROCEDURE list_round_ratings(
    p_event_id IN  NUMBER,
    p_round_id IN  NUMBER,
    p_cursor   OUT SYS_REFCURSOR
  );

END gcode_ratings_api;
/


CREATE OR REPLACE
PACKAGE BODY gcode_ratings_api IS

  c_window_seconds CONSTANT NUMBER := 120;

PROCEDURE set_current_performer(
  p_event_id       IN NUMBER,
  p_participant_id IN NUMBER,
  p_round_id       IN NUMBER DEFAULT NULL
) IS
  v_category gcode_event_participants.category%TYPE;
BEGIN
  SELECT category INTO v_category
    FROM gcode_event_participants
   WHERE id = p_participant_id
     AND event_id = p_event_id;

  IF v_category != 'PARTICIPANT' THEN
    RAISE_APPLICATION_ERROR(-20020, 'Only a Participant-category row can be marked as performing.');
  END IF;

  MERGE INTO gcode_event_live_state t
  USING (SELECT p_event_id AS event_id FROM dual) s
  ON (t.event_id = s.event_id)
  WHEN MATCHED THEN
    UPDATE SET current_participant_id = p_participant_id,
               round_id               = p_round_id,
               rating_started_on      = NULL,
               updated_on             = SYSTIMESTAMP
  WHEN NOT MATCHED THEN
    INSERT (event_id, current_participant_id, round_id, updated_on)
    VALUES (p_event_id, p_participant_id, p_round_id, SYSTIMESTAMP);

  UPDATE gcode_event_participants
     SET performed_at = NVL(performed_at, SYSTIMESTAMP)
   WHERE id = p_participant_id;

  COMMIT;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RAISE_APPLICATION_ERROR(-20005, 'Participant not found.');
END set_current_performer;


  PROCEDURE start_rating_window(
    p_event_id IN NUMBER
  ) IS
  BEGIN
    UPDATE gcode_event_live_state
       SET rating_started_on = SYSTIMESTAMP,
           updated_on        = SYSTIMESTAMP
     WHERE event_id = p_event_id
       AND current_participant_id IS NOT NULL;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20026, 'No performer currently on stage.');
    END IF;

    COMMIT;
  END start_rating_window;


  PROCEDURE set_intermission(
    p_event_id        IN NUMBER,
    p_is_intermission IN VARCHAR2
  ) IS
  BEGIN
    MERGE INTO gcode_event_live_state t
    USING (SELECT p_event_id AS event_id FROM dual) s
    ON (t.event_id = s.event_id)
    WHEN MATCHED THEN
      UPDATE SET is_intermission = p_is_intermission,
                 updated_on      = SYSTIMESTAMP
    WHEN NOT MATCHED THEN
      INSERT (event_id, is_intermission, updated_on)
      VALUES (p_event_id, p_is_intermission, SYSTIMESTAMP);

    COMMIT;
  END set_intermission;


PROCEDURE get_live_state(
  p_event_id           IN  NUMBER,
  p_attendee_id        IN  NUMBER DEFAULT NULL,
  p_participant_id     OUT NUMBER,
  p_participant_name   OUT VARCHAR2,
  p_already_rated      OUT NUMBER,
  p_window_closes_at   OUT VARCHAR2,
  p_avg_rating         OUT NUMBER,
  p_rating_count       OUT NUMBER,
  p_round_id           OUT NUMBER,
  p_is_intermission    OUT VARCHAR2
) IS
  v_rating_started_on gcode_event_live_state.rating_started_on%TYPE;
BEGIN
  p_already_rated := 0;
  p_avg_rating := NULL;
  p_rating_count := 0;

  -- Read independently of current_participant_id — intermission must stay
  -- correct even when no one's on stage yet, or the live_state row doesn't
  -- exist at all (never set a performer), neither of which should touch it.
  BEGIN
    SELECT NVL(is_intermission, 'N') INTO p_is_intermission
      FROM gcode_event_live_state
     WHERE event_id = p_event_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    p_is_intermission := 'N';
  END;

  SELECT s.current_participant_id, p.user_name, s.rating_started_on, s.round_id
    INTO p_participant_id, p_participant_name, v_rating_started_on, p_round_id
    FROM gcode_event_live_state s
    JOIN gcode_event_participants p ON p.id = s.current_participant_id
   WHERE s.event_id = p_event_id;

  IF v_rating_started_on IS NULL THEN
    p_window_closes_at := NULL;
  ELSE
    p_window_closes_at := TO_CHAR(
      v_rating_started_on + NUMTODSINTERVAL(c_window_seconds, 'SECOND'),
      'YYYY-MM-DD"T"HH24:MI:SS'
    ) || 'Z';
  END IF;

  IF p_attendee_id IS NOT NULL THEN
    SELECT COUNT(*) INTO p_already_rated
      FROM gcode_event_ratings
     WHERE rater_attendee_id = p_attendee_id
       AND performer_participant_id = p_participant_id;
  END IF;

  SELECT ROUND(AVG(rating) * 10, 1), COUNT(*)
    INTO p_avg_rating, p_rating_count
    FROM gcode_event_ratings
   WHERE performer_participant_id = p_participant_id;

  IF p_rating_count = 0 THEN
    p_avg_rating := NULL;
  END IF;
EXCEPTION WHEN NO_DATA_FOUND THEN
  p_participant_id := NULL;
  p_participant_name := NULL;
  p_already_rated := 0;
  p_window_closes_at := NULL;
  p_avg_rating := NULL;
  p_rating_count := 0;
  p_round_id := NULL;
  -- p_is_intermission already resolved above, untouched by this branch
END get_live_state;


PROCEDURE submit_rating(
  p_attendee_id  IN  NUMBER,
  p_performer_id IN  NUMBER,
  p_rating       IN  NUMBER,
  p_created_on   OUT TIMESTAMP
) IS
  v_rater_category     gcode_event_participants.category%TYPE;
  v_rater_event        gcode_event_participants.event_id%TYPE;
  v_performer_category gcode_event_participants.category%TYPE;
  v_performer_event    gcode_event_participants.event_id%TYPE;
  v_current_participant gcode_event_live_state.current_participant_id%TYPE;
  v_rating_started_on  gcode_event_live_state.rating_started_on%TYPE;
  v_round_id            gcode_event_live_state.round_id%TYPE;
BEGIN
  SELECT category, event_id INTO v_rater_category, v_rater_event
    FROM gcode_event_participants WHERE id = p_attendee_id;

  SELECT category, event_id INTO v_performer_category, v_performer_event
    FROM gcode_event_participants WHERE id = p_performer_id;

  IF v_rater_category != 'ATTENDEE' THEN
    RAISE_APPLICATION_ERROR(-20021, 'Only an Attendee-category registration can submit a rating.');
  END IF;
  IF v_performer_category != 'PARTICIPANT' THEN
    RAISE_APPLICATION_ERROR(-20022, 'Can only rate a Participant-category registration.');
  END IF;
  IF v_rater_event != v_performer_event THEN
    RAISE_APPLICATION_ERROR(-20023, 'Rater and performer must belong to the same event.');
  END IF;

  BEGIN
    SELECT current_participant_id, rating_started_on, round_id
      INTO v_current_participant, v_rating_started_on, v_round_id
      FROM gcode_event_live_state
     WHERE event_id = v_rater_event;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20025, 'Rating window has closed.');
  END;

  IF v_current_participant != p_performer_id THEN
    RAISE_APPLICATION_ERROR(-20025, 'Rating window has closed.');
  END IF;
  IF v_rating_started_on IS NULL THEN
    RAISE_APPLICATION_ERROR(-20025, 'Rating window has closed.');
  END IF;
  IF SYSTIMESTAMP > v_rating_started_on + NUMTODSINTERVAL(c_window_seconds, 'SECOND') THEN
    RAISE_APPLICATION_ERROR(-20025, 'Rating window has closed.');
  END IF;

  INSERT INTO gcode_event_ratings (event_id, rater_attendee_id, performer_participant_id, rating, round_id)
  VALUES (v_rater_event, p_attendee_id, p_performer_id, p_rating, v_round_id)
  RETURNING created_on INTO p_created_on;

  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20005, 'Participant not found.');
  WHEN DUP_VAL_ON_INDEX THEN
    RAISE_APPLICATION_ERROR(-20024, 'You have already rated this performer.');
END submit_rating;


  PROCEDURE send_rating_links(
    p_event_id IN NUMBER
  ) IS
  BEGIN
    FOR r IN (
      SELECT p.id AS attendee_id, p.user_name, u.email
        FROM gcode_event_participants p
        JOIN gcode_users u ON u.user_id = p.user_id
       WHERE p.event_id = p_event_id
         AND p.category = 'ATTENDEE'
    ) LOOP
      BEGIN
        GCODE_EMAIL_API.send_rating_invite_email(
          p_email        => r.email,
          p_full_name    => r.user_name,
          p_event_id     => p_event_id,
          p_attendee_id  => r.attendee_id
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END send_rating_links;

 PROCEDURE submit_reaction (
  p_event_id                 IN NUMBER,
  p_performer_participant_id IN NUMBER,
  p_emoji                    IN VARCHAR2,
  p_device_token              IN VARCHAR2
) IS
  v_performer_category gcode_event_participants.category%TYPE;
  v_performer_event    gcode_event_participants.event_id%TYPE;
  v_last_reaction       TIMESTAMP;
BEGIN
  IF p_emoji NOT IN ('👏', '🔥', '❤️', '😂', '👍') THEN
    RAISE_APPLICATION_ERROR(-20030, 'Unsupported emoji.');
  END IF;
  IF p_device_token IS NULL OR LENGTH(p_device_token) < 8 THEN
    RAISE_APPLICATION_ERROR(-20037, 'Missing device token.');
  END IF;

  SELECT category, event_id INTO v_performer_category, v_performer_event
    FROM gcode_event_participants WHERE id = p_performer_participant_id;

  IF v_performer_category != 'PARTICIPANT' THEN
    RAISE_APPLICATION_ERROR(-20035, 'Can only react to a Participant-category registration.');
  END IF;
  IF v_performer_event != p_event_id THEN
    RAISE_APPLICATION_ERROR(-20036, 'Performer must belong to this event.');
  END IF;

  -- Anonymous, fire-and-forget taps -- 1s-per-device throttle to blunt
  -- button-mashing/scripted spam. Silently dropped, not an error: a tap
  -- that's too fast isn't a user-facing failure, just a no-op.
  SELECT MAX(created_on) INTO v_last_reaction
    FROM gcode_event_reactions WHERE device_token = p_device_token;

  IF v_last_reaction IS NOT NULL
     AND v_last_reaction > SYSTIMESTAMP - INTERVAL '1' SECOND THEN
    RETURN;
  END IF;

  INSERT INTO GCODE_EVENT_REACTIONS (EVENT_ID, PERFORMER_PARTICIPANT_ID, DEVICE_TOKEN, EMOJI)
  VALUES (p_event_id, p_performer_participant_id, p_device_token, p_emoji);
  COMMIT;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20005, 'Participant not found.');
END submit_reaction;


PROCEDURE list_reactions_since (
  p_performer_participant_id IN NUMBER,
  p_since_id                 IN NUMBER,
  p_limit                    IN NUMBER DEFAULT 200,
  p_cursor                   OUT SYS_REFCURSOR
) IS
BEGIN
  OPEN p_cursor FOR
    SELECT ID, EMOJI, CREATED_ON
    FROM GCODE_EVENT_REACTIONS
    WHERE PERFORMER_PARTICIPANT_ID = p_performer_participant_id
      AND ID > NVL(p_since_id, 0)
    ORDER BY ID ASC
    FETCH FIRST p_limit ROWS ONLY;
END list_reactions_since;

PROCEDURE list_round_ratings (
  p_event_id IN  NUMBER,
  p_round_id IN  NUMBER,
  p_cursor   OUT SYS_REFCURSOR
) IS
BEGIN
  OPEN p_cursor FOR
    SELECT performer_participant_id AS "participant_id",
           ROUND(AVG(rating) * 10, 1) AS "avg_rating",
           COUNT(*) AS "rating_count"
      FROM gcode_event_ratings
     WHERE event_id = p_event_id
       AND round_id = p_round_id
     GROUP BY performer_participant_id;
END list_round_ratings;

END gcode_ratings_api;
/


-- ----------------------------------------------------------------------------
-- 3. ORDS: remove the old attendee-tied route
-- ----------------------------------------------------------------------------

BEGIN
  ORDS.DELETE_TEMPLATE(p_module_name => 'gcode.participants.v1', p_uri_template => ':id/reactions');
  COMMIT;
END;
/

-- ----------------------------------------------------------------------------
-- 4. ORDS: new anonymous route
-- ----------------------------------------------------------------------------

-- Generated by ORDS REST Data Services 26.2.1.r1901402
-- Schema: WKSP_GCODE2  Date: Mon Sep 14 2026

-- Module: gcode.events.v1
-- Template pattern: :id/reactions

BEGIN
  ORDS.DEFINE_TEMPLATE(
      p_module_name    => 'gcode.events.v1',
      p_pattern        => ':id/reactions',
      p_priority       => 0,
      p_etag_type      => 'HASH',
      p_etag_query     => NULL,
      p_comments       => NULL);

  ORDS.DEFINE_HANDLER(
      p_module_name    => 'gcode.events.v1',
      p_pattern        => ':id/reactions',
      p_method         => 'POST',
      p_source_type    => 'plsql/block',
      p_mimes_allowed  => NULL,
      p_comments       => NULL,
      p_source         =>
'
      BEGIN
        gcode_ratings_api.submit_reaction(
          p_event_id                 => :id,
          p_performer_participant_id => :performer_id,
          p_emoji                    => :emoji,
          p_device_token             => :device_token
        );
        APEX_JSON.open_object;
        APEX_JSON.write(''ok'', true);
        APEX_JSON.close_object;
      END;
    ');

  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/

-- ============================================================================
-- Verification (run after the above completes with no errors):
--
--   SELECT column_name FROM user_tab_columns
--     WHERE table_name = 'GCODE_EVENT_REACTIONS' AND column_name = 'DEVICE_TOKEN';
--   -- expect 1 row
--
--   SELECT object_type, status FROM user_objects WHERE object_name = 'GCODE_RATINGS_API';
--   -- expect all VALID
--
-- Then, against the PROD ORDS base URL:
--   POST /events/:id/reactions  -- body {performer_id, emoji, device_token}
--     - two rapid calls with the SAME device_token -> only 1 row inserted
--     - a call with NO device_token -> errors
--   GET /participants/:id/reactions  -- should now 404 (route removed)
--
-- Only flip NEXT_PUBLIC_API_BASE_URL (or however prod deploy points at the
-- API) once those all come back clean.
-- ============================================================================
