-- GCODE_EVENT_PORTAL_API: team, share links, check-ins, communications.
-- Needs EXECUTE on DBMS_CRYPTO (ask the DBA once: GRANT EXECUTE ON SYS.DBMS_CRYPTO TO <schema>).
--
-- Script 2 of 3. Contains three packages: GCODE_EVENT_PORTAL_API (team, share
-- links, check-in, communications), GCODE_EVENT_LIVE_API (live room decisions)
-- and GCODE_EVENT_HTTP_API (what the ORDS handlers call).
--
-- Columns used, all taken from the existing scripts in docs/sql: events
-- (id, organizer_id, start_date, end_date), gcode_users (user_id, email,
-- full_name), gcode_event_participants (id, event_id, user_id, category,
-- active), gcode_upi_payment_claims, gcode_coupons. GCODE_EVENT_PANELISTS
-- (event_id, user_id, invited_email, status) is used by the live room, plus the
-- PANELIST_ROLE column added by 01_tables.sql.
-- Every procedure takes the acting user's id from the ORDS handler's verified
-- session, never from the request body. Errors use -20xxx so the handler can
-- map them to 400/403/404.

CREATE OR REPLACE
PACKAGE GCODE_EVENT_PORTAL_API AS

  e_forbidden  EXCEPTION; PRAGMA EXCEPTION_INIT(e_forbidden,  -20403);
  e_not_found  EXCEPTION; PRAGMA EXCEPTION_INIT(e_not_found,  -20404);
  e_bad_input  EXCEPTION; PRAGMA EXCEPTION_INIT(e_bad_input,  -20400);
  e_rate_limit EXCEPTION; PRAGMA EXCEPTION_INIT(e_rate_limit, -20429);

  -- 1 when the user is the event's organizer or an ACTIVE co-organizer.
  FUNCTION is_manager(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN NUMBER;
  -- Raises -20403 unless the user is the organizer or an active co-organizer.
  PROCEDURE require_manager(p_event_id IN NUMBER, p_user_id IN NUMBER);
  FUNCTION hash_token(p_token IN VARCHAR2) RETURN VARCHAR2;
  -- 1 when the token is a live (not revoked, not expired) share link or an
  -- invite, returning its event and role. No side effects.
  FUNCTION shared_scope(p_token IN VARCHAR2, p_event_id OUT NUMBER, p_role OUT VARCHAR2) RETURN NUMBER;

  -- Which areas a role may read (mirrors lib/team.ts ROLE_INFO). The share
  -- handler uses this to field-filter: CHECK_IN never gets emails/phones,
  -- SPONSOR never gets names or money.
  FUNCTION role_can(p_role IN VARCHAR2, p_area IN VARCHAR2) RETURN NUMBER;

  -- Team ---------------------------------------------------------------
  PROCEDURE invite_member(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_email IN VARCHAR2, p_role IN VARCHAR2, p_token OUT VARCHAR2);
  PROCEDURE list_team(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR);
  PROCEDURE set_member_role(p_member_id IN NUMBER, p_actor_id IN NUMBER, p_role IN VARCHAR2);
  PROCEDURE remove_member(p_member_id IN NUMBER, p_actor_id IN NUMBER);

  -- Share links ----------------------------------------------------------
  -- p_expiry: '7D' | '30D' | 'EVENT_END' | 'NEVER'. p_token is returned once.
  PROCEDURE create_share_link(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_label IN VARCHAR2, p_role IN VARCHAR2, p_expiry IN VARCHAR2,
    p_id OUT NUMBER, p_token OUT VARCHAR2);
  PROCEDURE list_share_links(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR);
  PROCEDURE revoke_share_link(p_link_id IN NUMBER, p_actor_id IN NUMBER);

  -- GET /shared/:token. NO side effects. Returns one row (event_id, role,
  -- kind, viewer, expired) or raises e_not_found for an unknown token.
  -- Revoked links and removed members count as unknown.
  PROCEDURE resolve_shared(p_token IN VARCHAR2, p_row OUT SYS_REFCURSOR);
  -- POST /shared/:token/open. Counts a link view; activates an invite
  -- (CO_ORGANIZER needs p_user_id, view-only roles do not). Idempotent:
  -- opening an invite twice never makes two members.
  PROCEDURE open_shared(p_token IN VARCHAR2, p_user_id IN NUMBER DEFAULT NULL);

  -- Check-in -------------------------------------------------------------
  -- Allowed for organizer, active co-organizer, or a valid CHECK_IN token.
  PROCEDURE set_check_in(p_event_id IN NUMBER, p_participant_id IN NUMBER,
    p_arrived IN NUMBER, p_actor_id IN NUMBER DEFAULT NULL, p_token IN VARCHAR2 DEFAULT NULL);
  PROCEDURE list_check_ins(p_event_id IN NUMBER, p_actor_id IN NUMBER DEFAULT NULL,
    p_token IN VARCHAR2 DEFAULT NULL, p_rows OUT SYS_REFCURSOR);

  -- Communications -------------------------------------------------------
  -- The group (not a count) comes from the browser; recipients are resolved
  -- here and the real count is returned (D7). Organizer / co-organizer only,
  -- max 5 sends per event per hour. Rows are QUEUED for the mailer job.
  PROCEDURE send_communication(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_subject IN VARCHAR2, p_message IN CLOB, p_group IN VARCHAR2,
    p_participant_ids IN CLOB DEFAULT NULL,   -- JSON array, CUSTOM only
    p_id OUT NUMBER, p_recipient_count OUT NUMBER);
  PROCEDURE list_communications(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR);

END GCODE_EVENT_PORTAL_API;
/

CREATE OR REPLACE
PACKAGE BODY GCODE_EVENT_PORTAL_API AS

  ---------------------------------------------------------------- helpers
  FUNCTION hash_token(p_token IN VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(
      UTL_RAW.CAST_TO_RAW(p_token), DBMS_CRYPTO.HASH_SH256)));
  END hash_token;

  -- 256 bits from the DB's CSPRNG, hex encoded.
  FUNCTION new_token RETURN VARCHAR2 IS
  BEGIN
    RETURN LOWER(RAWTOHEX(DBMS_CRYPTO.RANDOMBYTES(32)));
  END new_token;

  FUNCTION is_organizer(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN NUMBER IS
    v NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v FROM events
     WHERE id = p_event_id AND TO_CHAR(organizer_id) = TO_CHAR(p_user_id);
    RETURN v;
  END is_organizer;

  FUNCTION is_manager(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN NUMBER IS
    v NUMBER;
  BEGIN
    IF p_user_id IS NULL THEN RETURN 0; END IF;
    IF is_organizer(p_event_id, p_user_id) = 1 THEN RETURN 1; END IF;
    SELECT COUNT(*) INTO v FROM gcode_event_team
     WHERE event_id = p_event_id AND user_id = p_user_id
       AND role = 'CO_ORGANIZER' AND status = 'ACTIVE';
    RETURN CASE WHEN v > 0 THEN 1 ELSE 0 END;
  END is_manager;

  PROCEDURE require_manager(p_event_id IN NUMBER, p_user_id IN NUMBER) IS
  BEGIN
    IF is_manager(p_event_id, p_user_id) = 0 THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the organizer or a co-organizer can do this');
    END IF;
  END require_manager;

  FUNCTION role_can(p_role IN VARCHAR2, p_area IN VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE
      WHEN p_role = 'CO_ORGANIZER' THEN 1
      WHEN p_role = 'VENUE_PARTNER' AND p_area IN ('overview','schedule','venue') THEN 1
      WHEN p_role = 'SPONSOR'       AND p_area IN ('overview','schedule') THEN 1
      WHEN p_role = 'CHECK_IN'      AND p_area IN ('attendees','checkIn') THEN 1
      WHEN p_role = 'FINANCE'       AND p_area IN ('overview','money') THEN 1
      ELSE 0 END;
  END role_can;

  ------------------------------------------------------------------- team
  PROCEDURE invite_member(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_email IN VARCHAR2, p_role IN VARCHAR2, p_token OUT VARCHAR2) IS
    v_email VARCHAR2(255) := LOWER(TRIM(p_email));
  BEGIN
    require_manager(p_event_id, p_actor_id);
    IF v_email IS NULL OR NOT REGEXP_LIKE(v_email, '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Enter a valid email');
    END IF;
    IF p_role NOT IN ('CO_ORGANIZER','VENUE_PARTNER','SPONSOR','CHECK_IN','FINANCE') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Unknown role');
    END IF;
    -- Handing out full edit + email powers stays with the organizer.
    IF p_role = 'CO_ORGANIZER' AND is_organizer(p_event_id, p_actor_id) = 0 THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the organizer can add a co-organizer');
    END IF;
    p_token := new_token;
    BEGIN
      INSERT INTO gcode_event_team (event_id, email, role, token_hash, invited_by)
      VALUES (p_event_id, v_email, p_role, hash_token(p_token), p_actor_id);
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      RAISE_APPLICATION_ERROR(-20400, 'That email is already on the team');
    END;
    COMMIT;
  END invite_member;

  PROCEDURE list_team(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR) IS
  BEGIN
    require_manager(p_event_id, p_actor_id);
    -- token_hash is never returned.
    OPEN p_rows FOR
      SELECT id AS "id", event_id AS "event_id", email AS "email", role AS "role",
             status AS "status", invited_on AS "invited_on"
        FROM gcode_event_team WHERE event_id = p_event_id ORDER BY invited_on;
  END list_team;

  PROCEDURE set_member_role(p_member_id IN NUMBER, p_actor_id IN NUMBER, p_role IN VARCHAR2) IS
    v_event NUMBER;
    v_old   VARCHAR2(20);
  BEGIN
    BEGIN
      SELECT event_id, role INTO v_event, v_old FROM gcode_event_team WHERE id = p_member_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20404, 'Team member not found');
    END;
    require_manager(v_event, p_actor_id);
    IF p_role NOT IN ('CO_ORGANIZER','VENUE_PARTNER','SPONSOR','CHECK_IN','FINANCE') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Unknown role');
    END IF;
    IF (p_role = 'CO_ORGANIZER' OR v_old = 'CO_ORGANIZER')
       AND is_organizer(v_event, p_actor_id) = 0 THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the organizer can change a co-organizer');
    END IF;
    UPDATE gcode_event_team SET role = p_role WHERE id = p_member_id;
    COMMIT;
  END set_member_role;

  PROCEDURE remove_member(p_member_id IN NUMBER, p_actor_id IN NUMBER) IS
    v_event NUMBER;
    v_role  VARCHAR2(20);
  BEGIN
    BEGIN
      SELECT event_id, role INTO v_event, v_role FROM gcode_event_team WHERE id = p_member_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20404, 'Team member not found');
    END;
    require_manager(v_event, p_actor_id);
    IF v_role = 'CO_ORGANIZER' AND is_organizer(v_event, p_actor_id) = 0 THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the organizer can remove a co-organizer');
    END IF;
    DELETE FROM gcode_event_team WHERE id = p_member_id;
    COMMIT;
  END remove_member;

  ------------------------------------------------------------ share links
  PROCEDURE create_share_link(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_label IN VARCHAR2, p_role IN VARCHAR2, p_expiry IN VARCHAR2,
    p_id OUT NUMBER, p_token OUT VARCHAR2) IS
    v_exp TIMESTAMP;
    v_start DATE;
  BEGIN
    require_manager(p_event_id, p_actor_id);
    IF TRIM(p_label) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20400, 'Give the link a label');
    END IF;
    IF p_role NOT IN ('VENUE_PARTNER','SPONSOR','CHECK_IN','FINANCE') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Links cannot grant that role. Invite by email instead');
    END IF;
    IF p_expiry = '7D' THEN v_exp := SYSTIMESTAMP + INTERVAL '7' DAY;
    ELSIF p_expiry = '30D' THEN v_exp := SYSTIMESTAMP + INTERVAL '30' DAY;
    ELSIF p_expiry = 'EVENT_END' THEN
      SELECT NVL(end_date, start_date) INTO v_start FROM events WHERE id = p_event_id;
      -- a day of slack after the end, so the link works through the wrap-up
      v_exp := CAST(NVL(v_start, SYSDATE) + 1 AS TIMESTAMP);
    ELSIF p_expiry = 'NEVER' THEN v_exp := NULL;
    ELSE RAISE_APPLICATION_ERROR(-20400, 'Unknown expiry');
    END IF;
    p_token := new_token;
    INSERT INTO gcode_event_share_links (event_id, label, role, token_hash, created_by, expires_on)
    VALUES (p_event_id, TRIM(p_label), p_role, hash_token(p_token), p_actor_id, v_exp)
    RETURNING id INTO p_id;
    COMMIT;
  END create_share_link;

  PROCEDURE list_share_links(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR) IS
  BEGIN
    require_manager(p_event_id, p_actor_id);
    OPEN p_rows FOR
      SELECT id AS "id", label AS "label", role AS "role", created_on AS "created_on",
             expires_on AS "expires_on", views AS "views"
        FROM gcode_event_share_links
       WHERE event_id = p_event_id AND revoked_on IS NULL
       ORDER BY created_on DESC;
  END list_share_links;

  PROCEDURE revoke_share_link(p_link_id IN NUMBER, p_actor_id IN NUMBER) IS
    v_event NUMBER;
  BEGIN
    BEGIN
      SELECT event_id INTO v_event FROM gcode_event_share_links WHERE id = p_link_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20404, 'Link not found');
    END;
    require_manager(v_event, p_actor_id);
    UPDATE gcode_event_share_links SET revoked_on = SYSTIMESTAMP
     WHERE id = p_link_id AND revoked_on IS NULL;
    COMMIT;
  END revoke_share_link;

  PROCEDURE resolve_shared(p_token IN VARCHAR2, p_row OUT SYS_REFCURSOR) IS
    v_hash VARCHAR2(64) := hash_token(NVL(p_token, ' '));
    v_n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM gcode_event_share_links WHERE token_hash = v_hash AND revoked_on IS NULL;
    IF v_n = 1 THEN
      OPEN p_row FOR
        SELECT event_id AS "event_id", role AS "role", 'link' AS "kind", label AS "viewer",
               CASE WHEN expires_on IS NOT NULL AND expires_on <= SYSTIMESTAMP THEN 1 ELSE 0 END AS "expired"
          FROM gcode_event_share_links WHERE token_hash = v_hash;
      RETURN;
    END IF;
    SELECT COUNT(*) INTO v_n FROM gcode_event_team WHERE token_hash = v_hash;
    IF v_n = 1 THEN
      OPEN p_row FOR
        SELECT event_id AS "event_id", role AS "role", 'member' AS "kind", email AS "viewer", 0 AS "expired"
          FROM gcode_event_team WHERE token_hash = v_hash;
      RETURN;
    END IF;
    RAISE_APPLICATION_ERROR(-20404, 'This link is not valid');
  END resolve_shared;

  PROCEDURE open_shared(p_token IN VARCHAR2, p_user_id IN NUMBER DEFAULT NULL) IS
    v_hash VARCHAR2(64) := hash_token(NVL(p_token, ' '));
    v_id   NUMBER;
    v_role VARCHAR2(20);
  BEGIN
    UPDATE gcode_event_share_links SET views = views + 1
     WHERE token_hash = v_hash AND revoked_on IS NULL
       AND (expires_on IS NULL OR expires_on > SYSTIMESTAMP);
    IF SQL%ROWCOUNT = 1 THEN COMMIT; RETURN; END IF;

    BEGIN
      SELECT id, role INTO v_id, v_role FROM gcode_event_team WHERE token_hash = v_hash;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20404, 'This link is not valid');
    END;
    IF v_role = 'CO_ORGANIZER' AND p_user_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20403, 'Sign in to accept a co-organizer invite');
    END IF;
    -- Idempotent: the row already exists, so a second open only repeats this update.
    UPDATE gcode_event_team
       SET status = 'ACTIVE',
           user_id = NVL(user_id, p_user_id),
           activated_on = NVL(activated_on, SYSTIMESTAMP)
     WHERE id = v_id;
    COMMIT;
  END open_shared;

  -------------------------------------------------------------- check-in
  -- Resolves who is acting and whether they may check people in.
  PROCEDURE require_check_in(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_token IN VARCHAR2,
    p_by OUT VARCHAR2) IS
    v_hash VARCHAR2(64);
    v_n NUMBER := 0;
    v_label VARCHAR2(120);
  BEGIN
    IF p_actor_id IS NOT NULL AND is_manager(p_event_id, p_actor_id) = 1 THEN
      p_by := TO_CHAR(p_actor_id); RETURN;
    END IF;
    IF p_token IS NOT NULL THEN
      v_hash := hash_token(p_token);
      BEGIN
        SELECT label INTO v_label FROM gcode_event_share_links
         WHERE token_hash = v_hash AND event_id = p_event_id AND role = 'CHECK_IN'
           AND revoked_on IS NULL AND (expires_on IS NULL OR expires_on > SYSTIMESTAMP);
        p_by := 'link:' || v_label; RETURN;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
      END;
      SELECT COUNT(*) INTO v_n FROM gcode_event_team
       WHERE token_hash = v_hash AND event_id = p_event_id AND role = 'CHECK_IN';
      IF v_n = 1 THEN p_by := 'invite:' || SUBSTR(v_hash, 1, 8); RETURN; END IF;
    END IF;
    RAISE_APPLICATION_ERROR(-20403, 'You cannot check people in for this event');
  END require_check_in;

  PROCEDURE set_check_in(p_event_id IN NUMBER, p_participant_id IN NUMBER,
    p_arrived IN NUMBER, p_actor_id IN NUMBER DEFAULT NULL, p_token IN VARCHAR2 DEFAULT NULL) IS
    v_by VARCHAR2(120);
    v_n  NUMBER;
  BEGIN
    require_check_in(p_event_id, p_actor_id, p_token, v_by);
    SELECT COUNT(*) INTO v_n FROM gcode_event_participants
     WHERE id = p_participant_id AND event_id = p_event_id;
    IF v_n = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Participant not found'); END IF;
    IF p_arrived = 1 THEN
      MERGE INTO gcode_event_checkins c
      USING (SELECT p_event_id e, p_participant_id p FROM dual) s
         ON (c.event_id = s.e AND c.participant_id = s.p)
       WHEN NOT MATCHED THEN INSERT (event_id, participant_id, checked_in_by)
            VALUES (s.e, s.p, v_by);
    ELSE
      DELETE FROM gcode_event_checkins WHERE event_id = p_event_id AND participant_id = p_participant_id;
    END IF;
    COMMIT;
  END set_check_in;

  PROCEDURE list_check_ins(p_event_id IN NUMBER, p_actor_id IN NUMBER DEFAULT NULL,
    p_token IN VARCHAR2 DEFAULT NULL, p_rows OUT SYS_REFCURSOR) IS
    v_by VARCHAR2(120);
  BEGIN
    require_check_in(p_event_id, p_actor_id, p_token, v_by);
    OPEN p_rows FOR
      SELECT participant_id AS "participant_id", checked_in_on AS "checked_in_on"
        FROM gcode_event_checkins WHERE event_id = p_event_id;
  END list_check_ins;

  ------------------------------------------------------- communications
  PROCEDURE send_communication(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_subject IN VARCHAR2, p_message IN CLOB, p_group IN VARCHAR2,
    p_participant_ids IN CLOB DEFAULT NULL,
    p_id OUT NUMBER, p_recipient_count OUT NUMBER) IS
    v_recent NUMBER;
  BEGIN
    require_manager(p_event_id, p_actor_id);
    IF TRIM(p_subject) IS NULL OR p_message IS NULL OR DBMS_LOB.GETLENGTH(p_message) = 0 THEN
      RAISE_APPLICATION_ERROR(-20400, 'Add a subject and a message');
    END IF;
    IF p_group NOT IN ('ALL','CONFIRMED','PAID','CUSTOM') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Unknown recipient group');
    END IF;
    IF p_group = 'PAID' THEN
      -- Payment status lives outside this package; do not guess it.
      RAISE_APPLICATION_ERROR(-20400, 'Sending to paid attendees is not available yet');
    END IF;
    SELECT COUNT(*) INTO v_recent FROM gcode_event_communications
     WHERE event_id = p_event_id AND sent_on > SYSTIMESTAMP - INTERVAL '1' HOUR;
    IF v_recent >= 5 THEN
      RAISE_APPLICATION_ERROR(-20429, 'Too many emails sent for this event. Try again in an hour');
    END IF;

    INSERT INTO gcode_event_communications (event_id, subject, message, recipient_group, recipient_count, sent_by)
    VALUES (p_event_id, TRIM(p_subject), p_message, p_group, 0, p_actor_id)
    RETURNING id INTO p_id;

    -- Recipients come from the registrations themselves; CUSTOM ids are
    -- intersected with this event's participants, so ids from other events
    -- are ignored. ALL and CONFIRMED are the same today: a participant row
    -- exists only once a registration is confirmed.
    INSERT INTO gcode_event_comm_recipients (communication_id, participant_id, email)
    SELECT p_id, p.id, LOWER(u.email)
      FROM gcode_event_participants p
      JOIN gcode_users u ON u.user_id = p.user_id
     WHERE p.event_id = p_event_id
       AND u.email IS NOT NULL
       AND (p_group IN ('ALL','CONFIRMED')
            OR (p_group = 'CUSTOM' AND p.id IN (
                  SELECT j.pid FROM JSON_TABLE(NVL(p_participant_ids, '[]'), '$[*]'
                    COLUMNS (pid NUMBER PATH '$')) j)));
    p_recipient_count := SQL%ROWCOUNT;

    UPDATE gcode_event_communications SET recipient_count = p_recipient_count WHERE id = p_id;
    COMMIT;
  END send_communication;

  PROCEDURE list_communications(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_rows OUT SYS_REFCURSOR) IS
  BEGIN
    require_manager(p_event_id, p_actor_id);
    OPEN p_rows FOR
      SELECT id AS "id", event_id AS "event_id", subject AS "subject", message AS "message",
             recipient_group AS "recipient_group", recipient_count AS "recipient_count",
             sent_on AS "sent_on", status AS "status"
        FROM gcode_event_communications
       WHERE event_id = p_event_id ORDER BY sent_on DESC;
  END list_communications;

  FUNCTION shared_scope(p_token IN VARCHAR2, p_event_id OUT NUMBER, p_role OUT VARCHAR2) RETURN NUMBER IS
    v_hash VARCHAR2(64) := hash_token(NVL(p_token, ' '));
  BEGIN
    BEGIN
      SELECT event_id, role INTO p_event_id, p_role FROM gcode_event_share_links
       WHERE token_hash = v_hash AND revoked_on IS NULL
         AND (expires_on IS NULL OR expires_on > SYSTIMESTAMP);
      RETURN 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
    END;
    BEGIN
      SELECT event_id, role INTO p_event_id, p_role FROM gcode_event_team WHERE token_hash = v_hash;
      RETURN 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN RETURN 0;
    END;
  END shared_scope;

END GCODE_EVENT_PORTAL_API;
/

-- =====================================================================
-- GCODE_EVENT_LIVE_API: the live room's decisions. Provider-independent:
-- who may enter and as what, what state the door is in, host actions queued
-- for the provider worker, attendance and recordings from provider events.
-- Nothing here calls a video provider (see README: those calls wait on the
-- provider spike).
-- =====================================================================
CREATE OR REPLACE
PACKAGE GCODE_EVENT_LIVE_API AS

  -- Minutes before the scheduled start that each role gets in, and how long
  -- after the end the room stays open (lib/webinar.ts mirrors these).
  c_opens_host     CONSTANT NUMBER := 30;
  c_opens_speaker  CONSTANT NUMBER := 30;
  c_opens_attendee CONSTANT NUMBER := 15;
  c_closes_after   CONSTANT NUMBER := 15;

  -- 'HOST' (organizer or active co-organizer), 'SPEAKER' (accepted speaker
  -- invite) or 'ATTENDEE'. The only source of a viewer's role.
  -- Server clock in India, the zone events.start_date / end_date are stored in.
  FUNCTION now_ist RETURN DATE;

  FUNCTION role_of(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN VARCHAR2;

  -- 1 when the user has an active registration for the event.
  FUNCTION registration_of(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN NUMBER;

  -- EARLY | BACKSTAGE | OPEN | ENDED for a role, on the server clock (IST).
  FUNCTION state_of(p_event_id IN NUMBER, p_role IN VARCHAR2) RETURN VARCHAR2;

  -- Organizer's settings, status, capabilities, limits and speakers, as JSON.
  FUNCTION webinar_json(p_event_id IN NUMBER, p_actor_id IN NUMBER) RETURN CLOB;

  -- Saves settings. Room-shaping fields (audience, recording, chat,
  -- hand_raise) are rejected once doors have opened. NULL leaves a field as is.
  PROCEDURE save_webinar(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_audience IN VARCHAR2, p_recording IN NUMBER, p_chat IN NUMBER,
    p_hand_raise IN NUMBER, p_captions IN NUMBER, p_notice IN VARCHAR2,
    p_restream_url IN VARCHAR2, p_slides_url IN VARCHAR2, p_replay_published IN NUMBER,
    p_set_notice IN NUMBER DEFAULT 0, p_set_restream IN NUMBER DEFAULT 0,
    p_set_slides IN NUMBER DEFAULT 0);

  -- The viewer's door state (D1). p_user_id may be NULL (signed out).
  FUNCTION live_access_json(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN CLOB;

  -- Eligibility for a join credential. Raises -20403 when the viewer is not
  -- registered / not a speaker or host, is blocked, or the door is closed for
  -- their role. On success returns the participant id used as the provider
  -- participantId (the registration id for attendees, the user id otherwise).
  FUNCTION check_may_join(p_event_id IN NUMBER, p_user_id IN NUMBER,
    p_role OUT VARCHAR2) RETURN VARCHAR2;

  -- Host/organizer actions. They queue a command for the provider worker and
  -- do NOT flip live/recording flags: only a provider event does that (D15).
  PROCEDURE queue_command(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_command IN VARCHAR2, p_argument IN VARCHAR2 DEFAULT NULL);
  PROCEDURE set_notice(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_text IN VARCHAR2);
  PROCEDURE remove_person(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_participant_id IN NUMBER);

  -- Applies one normalized provider event, once (idempotent by id).
  PROCEDURE record_provider_event(p_event_id IN NUMBER, p_provider_event_id IN VARCHAR2,
    p_kind IN VARCHAR2, p_participant_id IN NUMBER DEFAULT NULL,
    p_when IN TIMESTAMP DEFAULT NULL, p_recording_url IN VARCHAR2 DEFAULT NULL);

END GCODE_EVENT_LIVE_API;
/

CREATE OR REPLACE
PACKAGE BODY GCODE_EVENT_LIVE_API AS

  FUNCTION setting(p_key IN VARCHAR2, p_default IN VARCHAR2 DEFAULT NULL) RETURN VARCHAR2 IS
    v VARCHAR2(1000);
  BEGIN
    SELECT setting_value INTO v FROM gcode_portal_settings WHERE setting_key = p_key;
    RETURN v;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN p_default;
  END setting;

  -- events.start_date / end_date are wall-clock time in India.
  FUNCTION now_ist RETURN DATE IS
  BEGIN
    RETURN CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Kolkata' AS DATE);
  END now_ist;

  FUNCTION role_of(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN VARCHAR2 IS
    v NUMBER;
  BEGIN
    IF p_user_id IS NULL THEN RETURN 'ATTENDEE'; END IF;
    IF GCODE_EVENT_PORTAL_API.is_manager(p_event_id, p_user_id) = 1 THEN RETURN 'HOST'; END IF;
    SELECT COUNT(*) INTO v FROM gcode_event_panelists
     WHERE event_id = p_event_id AND user_id = p_user_id
       AND status = 'ACCEPTED' AND panelist_role = 'SPEAKER';
    RETURN CASE WHEN v > 0 THEN 'SPEAKER' ELSE 'ATTENDEE' END;
  END role_of;

  FUNCTION registration_of(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN NUMBER IS
    v NUMBER;
  BEGIN
    IF p_user_id IS NULL THEN RETURN 0; END IF;
    SELECT NVL(MIN(id), 0) INTO v FROM gcode_event_participants
     WHERE event_id = p_event_id AND user_id = p_user_id AND active = 'Y';
    RETURN v;
  END registration_of;

  FUNCTION state_of(p_event_id IN NUMBER, p_role IN VARCHAR2) RETURN VARCHAR2 IS
    v_start DATE; v_end DATE; v_now DATE := now_ist;
    v_opens NUMBER := CASE p_role WHEN 'HOST' THEN c_opens_host WHEN 'SPEAKER' THEN c_opens_speaker ELSE c_opens_attendee END;
  BEGIN
    SELECT start_date, NVL(end_date, start_date) INTO v_start, v_end FROM events WHERE id = p_event_id;
    IF v_start IS NULL THEN RETURN 'EARLY'; END IF;
    IF v_now > v_end + c_closes_after / 1440 THEN RETURN 'ENDED'; END IF;
    IF v_now >= v_start - c_opens_attendee / 1440 THEN RETURN 'OPEN'; END IF;
    IF p_role <> 'ATTENDEE' AND v_now >= v_start - v_opens / 1440 THEN RETURN 'BACKSTAGE'; END IF;
    RETURN 'EARLY';
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20404, 'Event not found');
  END state_of;

  FUNCTION ensure_row(p_event_id IN NUMBER) RETURN NUMBER IS
  BEGIN
    INSERT INTO gcode_event_webinar (event_id) VALUES (p_event_id);
    RETURN 1;
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN RETURN 0;
  END ensure_row;

  FUNCTION webinar_json(p_event_id IN NUMBER, p_actor_id IN NUMBER) RETURN CLOB IS
    v_json CLOB;
    v_dummy NUMBER;
  BEGIN
    GCODE_EVENT_PORTAL_API.require_manager(p_event_id, p_actor_id);
    v_dummy := ensure_row(p_event_id);
    SELECT JSON_OBJECT(
             'audience' VALUE w.audience,
             'recording' VALUE w.recording, 'chat' VALUE w.chat,
             'hand_raise' VALUE w.hand_raise, 'captions' VALUE w.captions,
             'notice' VALUE w.notice, 'restream_url' VALUE w.restream_url,
             'slides_url' VALUE w.slides_url,
             'replay_published' VALUE w.replay_published,
             'status' VALUE JSON_OBJECT(
               'live' VALUE w.is_live, 'recording' VALUE w.is_recording,
               'ended' VALUE w.is_ended,
               'recording_ready' VALUE CASE WHEN w.recording_url IS NOT NULL THEN 1 ELSE 0 END),
             -- Nothing the active provider cannot do is advertised.
             'capabilities' VALUE JSON_OBJECT(
               'pause' VALUE 0, 'notice' VALUE 1, 'captions' VALUE 0, 'restream' VALUE 0),
             'room_limit' VALUE JSON_OBJECT(
               'interactive' VALUE TO_NUMBER(NVL(setting('ROOM_LIMIT_INTERACTIVE'), '50')),
               'webinar_viewers' VALUE TO_NUMBER(NVL(setting('ROOM_LIMIT_VIEWERS'), '100'))),
             'speakers' VALUE (
               SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'id' VALUE s.id, 'name' VALUE s.name, 'title' VALUE s.title,
                        'role' VALUE s.role, 'invite_status' VALUE s.invite_status)
                      ORDER BY s.sort_key)
                 FROM (
                   SELECT -1 AS id, NVL(u.full_name, 'Host') AS name, 'Host' AS title,
                          'HOST' AS role, 'ACCEPTED' AS invite_status, 0 AS sort_key
                     FROM events e LEFT JOIN gcode_users u ON u.user_id = e.organizer_id
                    WHERE e.id = p_event_id
                   UNION ALL
                   SELECT p.id, NVL(u.full_name, p.invited_email), 'Speaker',
                          'SPEAKER', CASE p.status WHEN 'ACCEPTED' THEN 'ACCEPTED' ELSE 'PENDING' END, 1
                     FROM gcode_event_panelists p LEFT JOIN gcode_users u ON u.user_id = p.user_id
                    WHERE p.event_id = p_event_id AND p.panelist_role = 'SPEAKER'
                      AND p.status IN ('INVITED','ACCEPTED')
                 ) s) FORMAT JSON
             RETURNING CLOB)
      INTO v_json
      FROM gcode_event_webinar w WHERE w.event_id = p_event_id;
    RETURN v_json;
  END webinar_json;

  PROCEDURE save_webinar(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_audience IN VARCHAR2, p_recording IN NUMBER, p_chat IN NUMBER,
    p_hand_raise IN NUMBER, p_captions IN NUMBER, p_notice IN VARCHAR2,
    p_restream_url IN VARCHAR2, p_slides_url IN VARCHAR2, p_replay_published IN NUMBER,
    p_set_notice IN NUMBER DEFAULT 0, p_set_restream IN NUMBER DEFAULT 0,
    p_set_slides IN NUMBER DEFAULT 0) IS
    v_dummy NUMBER;
    v_shaping BOOLEAN := p_audience IS NOT NULL OR p_recording IS NOT NULL
                         OR p_chat IS NOT NULL OR p_hand_raise IS NOT NULL;
  BEGIN
    GCODE_EVENT_PORTAL_API.require_manager(p_event_id, p_actor_id);
    v_dummy := ensure_row(p_event_id);
    IF p_audience IS NOT NULL AND p_audience NOT IN ('interactive','livestream') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Unknown format');
    END IF;
    IF p_slides_url IS NOT NULL AND NOT REGEXP_LIKE(p_slides_url, '^https://', 'i') THEN
      RAISE_APPLICATION_ERROR(-20400, 'The slides link must start with https://');
    END IF;
    IF v_shaping AND state_of(p_event_id, 'ATTENDEE') <> 'EARLY' THEN
      RAISE_APPLICATION_ERROR(-20400, 'Room settings are locked once doors are open');
    END IF;
    UPDATE gcode_event_webinar SET
      audience = NVL(p_audience, audience),
      recording = NVL(p_recording, recording),
      chat = NVL(p_chat, chat),
      hand_raise = NVL(p_hand_raise, hand_raise),
      captions = NVL(p_captions, captions),
      notice = CASE WHEN p_set_notice = 1 THEN SUBSTR(TRIM(p_notice), 1, 120) ELSE notice END,
      restream_url = CASE WHEN p_set_restream = 1 THEN p_restream_url ELSE restream_url END,
      slides_url = CASE WHEN p_set_slides = 1 THEN p_slides_url ELSE slides_url END,
      replay_published = NVL(p_replay_published, replay_published),
      updated_on = SYSTIMESTAMP
     WHERE event_id = p_event_id;
    COMMIT;
  END save_webinar;

  FUNCTION live_access_json(p_event_id IN NUMBER, p_user_id IN NUMBER) RETURN CLOB IS
    v_role VARCHAR2(10) := role_of(p_event_id, p_user_id);
    v_reg NUMBER := registration_of(p_event_id, p_user_id);
    v_state VARCHAR2(10);
    v_json CLOB;
    v_dummy NUMBER;
  BEGIN
    v_dummy := ensure_row(p_event_id);
    v_state := state_of(p_event_id, v_role);
    -- The replay URL is returned only to a signed-in ticket holder (or the
    -- host / a speaker), and only once it is published and stored (D6).
    SELECT JSON_OBJECT(
             'registered' VALUE CASE WHEN v_reg > 0 OR v_role <> 'ATTENDEE' THEN 1 ELSE 0 END,
             'role' VALUE v_role,
             'state' VALUE v_state,
             'live' VALUE w.is_live,
             'notice' VALUE w.notice,
             'replay' VALUE CASE
               WHEN v_state = 'ENDED' AND w.replay_published = 1 AND w.recording_url IS NOT NULL
                    AND (v_reg > 0 OR v_role <> 'ATTENDEE')
               THEN JSON_OBJECT('url' VALUE w.recording_url, 'slides_url' VALUE w.slides_url)
               END ABSENT ON NULL
             RETURNING CLOB)
      INTO v_json
      FROM gcode_event_webinar w WHERE w.event_id = p_event_id;
    RETURN v_json;
  END live_access_json;

  FUNCTION check_may_join(p_event_id IN NUMBER, p_user_id IN NUMBER,
    p_role OUT VARCHAR2) RETURN VARCHAR2 IS
    v_reg NUMBER;
    v_blocked NUMBER;
    v_dummy NUMBER;
    v_ended NUMBER;
  BEGIN
    IF p_user_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20403, 'Sign in to join');
    END IF;
    p_role := role_of(p_event_id, p_user_id);
    v_reg := registration_of(p_event_id, p_user_id);
    IF p_role = 'ATTENDEE' AND v_reg = 0 THEN
      RAISE_APPLICATION_ERROR(-20403, 'You need a ticket to join this session');
    END IF;
    v_dummy := ensure_row(p_event_id);
    SELECT is_ended INTO v_ended FROM gcode_event_webinar WHERE event_id = p_event_id;
    IF v_ended = 1 OR state_of(p_event_id, p_role) IN ('EARLY','ENDED') THEN
      RAISE_APPLICATION_ERROR(-20403, 'The room is not open for you right now');
    END IF;
    IF v_reg > 0 THEN
      SELECT COUNT(*) INTO v_blocked FROM gcode_event_live_blocks
       WHERE event_id = p_event_id AND participant_id = v_reg;
      IF v_blocked > 0 THEN
        RAISE_APPLICATION_ERROR(-20403, 'You were removed from this session');
      END IF;
    END IF;
    -- Tied to the registration: a forwarded link has no registration behind it.
    RETURN CASE WHEN p_role = 'ATTENDEE' THEN TO_CHAR(v_reg) ELSE 'u' || TO_CHAR(p_user_id) END;
  END check_may_join;

  PROCEDURE queue_command(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_command IN VARCHAR2, p_argument IN VARCHAR2 DEFAULT NULL) IS
    v_role VARCHAR2(10) := role_of(p_event_id, p_actor_id);
  BEGIN
    IF v_role <> 'HOST' THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the host or organizer can do this');
    END IF;
    IF p_command NOT IN ('go_live','stop','record_on','record_off','captions_on','captions_off','end') THEN
      RAISE_APPLICATION_ERROR(-20400, 'Unknown action');
    END IF;
    INSERT INTO gcode_event_live_commands (event_id, command, argument, requested_by)
    VALUES (p_event_id, p_command, p_argument, p_actor_id);
    COMMIT;
  END queue_command;

  PROCEDURE set_notice(p_event_id IN NUMBER, p_actor_id IN NUMBER, p_text IN VARCHAR2) IS
    v_dummy NUMBER;
  BEGIN
    IF role_of(p_event_id, p_actor_id) <> 'HOST' THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the host or organizer can do this');
    END IF;
    v_dummy := ensure_row(p_event_id);
    UPDATE gcode_event_webinar SET notice = SUBSTR(TRIM(p_text), 1, 120), updated_on = SYSTIMESTAMP
     WHERE event_id = p_event_id;
    COMMIT;
  END set_notice;

  PROCEDURE remove_person(p_event_id IN NUMBER, p_actor_id IN NUMBER,
    p_participant_id IN NUMBER) IS
    v_n NUMBER;
  BEGIN
    IF role_of(p_event_id, p_actor_id) <> 'HOST' THEN
      RAISE_APPLICATION_ERROR(-20403, 'Only the host or organizer can do this');
    END IF;
    SELECT COUNT(*) INTO v_n FROM gcode_event_participants
     WHERE id = p_participant_id AND event_id = p_event_id;
    IF v_n = 0 THEN RAISE_APPLICATION_ERROR(-20404, 'Participant not found'); END IF;
    BEGIN
      INSERT INTO gcode_event_live_blocks (event_id, participant_id) VALUES (p_event_id, p_participant_id);
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
    END;
    -- The provider-side kick is a queued command for the worker.
    INSERT INTO gcode_event_live_commands (event_id, command, argument, requested_by)
    VALUES (p_event_id, 'stop', 'remove:' || p_participant_id, p_actor_id);
    COMMIT;
  END remove_person;

  PROCEDURE record_provider_event(p_event_id IN NUMBER, p_provider_event_id IN VARCHAR2,
    p_kind IN VARCHAR2, p_participant_id IN NUMBER DEFAULT NULL,
    p_when IN TIMESTAMP DEFAULT NULL, p_recording_url IN VARCHAR2 DEFAULT NULL) IS
    v_when TIMESTAMP := NVL(p_when, SYSTIMESTAMP);
    v_dummy NUMBER;
  BEGIN
    BEGIN
      INSERT INTO gcode_event_live_events (event_id, provider_event_id, kind, participant_id)
      VALUES (p_event_id, p_provider_event_id, p_kind, p_participant_id);
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      RETURN;   -- replayed webhook: already applied
    END;
    v_dummy := ensure_row(p_event_id);
    IF p_kind = 'live_started' THEN
      UPDATE gcode_event_webinar SET is_live = 1, updated_on = SYSTIMESTAMP WHERE event_id = p_event_id;
    ELSIF p_kind = 'live_stopped' THEN
      UPDATE gcode_event_webinar SET is_live = 0, updated_on = SYSTIMESTAMP WHERE event_id = p_event_id;
    ELSIF p_kind = 'recording_started' THEN
      UPDATE gcode_event_webinar SET is_recording = 1, updated_on = SYSTIMESTAMP WHERE event_id = p_event_id;
    ELSIF p_kind = 'recording_ready' THEN
      -- p_recording_url must already point at OUR storage, never the provider's.
      UPDATE gcode_event_webinar SET is_recording = 0, recording_url = p_recording_url,
             updated_on = SYSTIMESTAMP WHERE event_id = p_event_id;
    ELSIF p_kind = 'session_closed' THEN
      UPDATE gcode_event_webinar SET is_live = 0, is_recording = 0, is_ended = 1,
             updated_on = SYSTIMESTAMP WHERE event_id = p_event_id;
    ELSIF p_kind = 'failed' THEN
      UPDATE gcode_event_webinar SET is_live = 0, is_recording = 0, updated_on = SYSTIMESTAMP
       WHERE event_id = p_event_id;
    ELSIF p_kind = 'joined' AND p_participant_id IS NOT NULL THEN
      MERGE INTO gcode_event_live_attendance a
      USING (SELECT p_event_id e, p_participant_id p FROM dual) s
         ON (a.event_id = s.e AND a.participant_id = s.p)
       WHEN MATCHED THEN UPDATE SET a.last_joined = v_when, a.last_left = NULL
       WHEN NOT MATCHED THEN INSERT (event_id, participant_id, first_joined, last_joined)
            VALUES (s.e, s.p, v_when, v_when);
    ELSIF p_kind = 'left' AND p_participant_id IS NOT NULL THEN
      -- Time is counted per visit (last_joined to now), so rejoins add up.
      UPDATE gcode_event_live_attendance
         SET last_left = v_when,
             seconds_in = seconds_in + CASE WHEN last_joined IS NULL THEN 0 ELSE
               GREATEST(0, ROUND((CAST(v_when AS DATE) - CAST(last_joined AS DATE)) * 86400)) END,
             last_joined = NULL
       WHERE event_id = p_event_id AND participant_id = p_participant_id;
    END IF;
    COMMIT;
  END record_provider_event;

END GCODE_EVENT_LIVE_API;
/

-- =====================================================================
-- GCODE_EVENT_HTTP_API: what the ORDS handlers call. Every handler is one
-- line (see 03_ords.sql). This package identifies the caller from the bearer
-- token, calls the packages above, and writes JSON. Errors are returned as
-- {"error": "..."} with HTTP 200, the same convention as the rest of the API.
-- =====================================================================
CREATE OR REPLACE
PACKAGE GCODE_EVENT_HTTP_API AS

  -- Who is calling. With JWT_SECRET set in GCODE_PORTAL_SETTINGS the HS256
  -- signature and expiry are verified; without it the token is only decoded,
  -- which is exactly as trustworthy as the rest of this backend. NULL when
  -- there is no (valid) token.
  FUNCTION caller_opt(p_authz IN VARCHAR2) RETURN NUMBER;

  -- Team
  PROCEDURE h_team_list(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_team_invite(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_email IN VARCHAR2, p_role IN VARCHAR2);
  PROCEDURE h_team_role(p_authz IN VARCHAR2, p_member_id IN NUMBER, p_role IN VARCHAR2);
  PROCEDURE h_team_remove(p_authz IN VARCHAR2, p_member_id IN NUMBER);
  -- Share links
  PROCEDURE h_links_list(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_links_create(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_label IN VARCHAR2, p_role IN VARCHAR2, p_expiry IN VARCHAR2);
  PROCEDURE h_links_revoke(p_authz IN VARCHAR2, p_link_id IN NUMBER);
  -- Shared view (unauthenticated except co-organizer invites)
  PROCEDURE h_shared_get(p_token IN VARCHAR2);
  PROCEDURE h_shared_open(p_authz IN VARCHAR2, p_token IN VARCHAR2);
  PROCEDURE h_shared_data(p_token IN VARCHAR2);
  -- Check-in
  PROCEDURE h_checkins_list(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_token IN VARCHAR2);
  PROCEDURE h_checkins_set(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_participant_id IN NUMBER, p_arrived IN VARCHAR2, p_token IN VARCHAR2);
  -- Communications
  PROCEDURE h_comm_list(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_comm_send(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_subject IN VARCHAR2, p_message IN CLOB, p_group IN VARCHAR2, p_ids IN CLOB);
  -- Live room
  PROCEDURE h_webinar_get(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_webinar_put(p_authz IN VARCHAR2, p_event_id IN NUMBER,
    p_audience IN VARCHAR2, p_recording IN VARCHAR2, p_chat IN VARCHAR2, p_hand_raise IN VARCHAR2,
    p_captions IN VARCHAR2, p_notice IN VARCHAR2, p_restream_url IN VARCHAR2,
    p_slides_url IN VARCHAR2, p_replay_published IN VARCHAR2, p_body IN CLOB);
  PROCEDURE h_live_access(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_live_token(p_authz IN VARCHAR2, p_event_id IN NUMBER);
  PROCEDURE h_live_action(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_action IN VARCHAR2, p_on IN VARCHAR2, p_text IN VARCHAR2);
  PROCEDURE h_live_remove(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_registration_id IN NUMBER);
  -- Provider events, relayed by a trusted service that has verified the
  -- provider's signature (PL/SQL cannot check RSA-SHA256 on the raw body).
  PROCEDURE h_webhook_live(p_secret IN VARCHAR2, p_event_id IN NUMBER,
    p_provider_event_id IN VARCHAR2, p_kind IN VARCHAR2, p_participant_id IN NUMBER,
    p_recording_url IN VARCHAR2);

END GCODE_EVENT_HTTP_API;
/

CREATE OR REPLACE
PACKAGE BODY GCODE_EVENT_HTTP_API AS

  FUNCTION setting(p_key IN VARCHAR2) RETURN VARCHAR2 IS
    v VARCHAR2(1000);
  BEGIN
    SELECT setting_value INTO v FROM gcode_portal_settings WHERE setting_key = p_key;
    RETURN v;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN NULL;
  END setting;

  ---------------------------------------------------------------- tokens
  FUNCTION b64url_decode(p IN VARCHAR2) RETURN RAW IS
    v VARCHAR2(4000) := REPLACE(REPLACE(p, '-', '+'), '_', '/');
  BEGIN
    v := v || RPAD('=', MOD(4 - MOD(LENGTH(v), 4), 4), '=');
    RETURN UTL_ENCODE.BASE64_DECODE(UTL_RAW.CAST_TO_RAW(v));
  END b64url_decode;

  FUNCTION b64url_encode(p IN RAW) RETURN VARCHAR2 IS
  BEGIN
    RETURN RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(
      UTL_RAW.CAST_TO_VARCHAR2(UTL_ENCODE.BASE64_ENCODE(p)),
      CHR(10), ''), CHR(13), ''), '+', '-'), '/', '_'), '=');
  END b64url_encode;

  FUNCTION epoch_now RETURN NUMBER IS
  BEGIN
    RETURN ROUND((CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) - DATE '1970-01-01') * 86400);
  END epoch_now;

  FUNCTION caller_opt(p_authz IN VARCHAR2) RETURN NUMBER IS
    v_token   VARCHAR2(4000) := REGEXP_SUBSTR(p_authz, '^Bearer +(\S+)$', 1, 1, 'i', 1);
    v_head    VARCHAR2(1000);
    v_pay     VARCHAR2(3000);
    v_sig     VARCHAR2(1000);
    v_secret  VARCHAR2(1000) := setting('JWT_SECRET');
    v_json    VARCHAR2(4000);
    v_exp     NUMBER;
    v_id      VARCHAR2(40);
  BEGIN
    IF v_token IS NULL THEN RETURN NULL; END IF;
    v_head := REGEXP_SUBSTR(v_token, '^[^.]+');
    v_pay  := REGEXP_SUBSTR(v_token, '^[^.]+\.([^.]+)', 1, 1, NULL, 1);
    v_sig  := REGEXP_SUBSTR(v_token, '^[^.]+\.[^.]+\.(.+)$', 1, 1, NULL, 1);
    IF v_head IS NULL OR v_pay IS NULL THEN RETURN NULL; END IF;
    IF v_secret IS NOT NULL THEN
      IF v_sig IS NULL OR b64url_encode(DBMS_CRYPTO.MAC(
           UTL_RAW.CAST_TO_RAW(v_head || '.' || v_pay),
           DBMS_CRYPTO.HMAC_SH256, UTL_RAW.CAST_TO_RAW(v_secret))) <> v_sig THEN
        RETURN NULL;
      END IF;
    END IF;
    v_json := UTL_RAW.CAST_TO_VARCHAR2(b64url_decode(v_pay));
    v_exp := TO_NUMBER(JSON_VALUE(v_json, '$.exp' RETURNING NUMBER));
    IF v_exp IS NOT NULL AND v_exp < epoch_now THEN RETURN NULL; END IF;
    v_id := NVL(JSON_VALUE(v_json, '$.userId'),
              NVL(JSON_VALUE(v_json, '$.user_id'), JSON_VALUE(v_json, '$.sub')));
    RETURN TO_NUMBER(v_id);
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END caller_opt;

  FUNCTION caller(p_authz IN VARCHAR2) RETURN NUMBER IS
    v NUMBER := caller_opt(p_authz);
  BEGIN
    IF v IS NULL THEN RAISE_APPLICATION_ERROR(-20401, 'Sign in again to continue'); END IF;
    RETURN v;
  END caller;

  ------------------------------------------------------------- output
  PROCEDURE fail(p_sqlerrm IN VARCHAR2) IS
    v_msg VARCHAR2(500) := REGEXP_REPLACE(p_sqlerrm, '^ORA-\d+: ?', '');
  BEGIN
    -- Anything that is not one of our -204xx errors is hidden from the browser.
    IF p_sqlerrm NOT LIKE 'ORA-204%' THEN v_msg := 'Something went wrong'; END IF;
    v_msg := SUBSTR(REGEXP_REPLACE(v_msg, '\s*ORA-\d+.*$', '', 1, 1, 'n'), 1, 300);
    APEX_JSON.open_object; APEX_JSON.write('error', v_msg); APEX_JSON.close_object;
  END fail;

  PROCEDURE ok IS
  BEGIN
    APEX_JSON.open_object; APEX_JSON.write('ok', TRUE); APEX_JSON.close_object;
  END ok;

  PROCEDURE items(p_cur IN OUT SYS_REFCURSOR) IS
  BEGIN
    APEX_JSON.open_object; APEX_JSON.write('items', p_cur); APEX_JSON.close_object;
  END items;

  PROCEDURE raw_json(p_json IN CLOB) IS
  BEGIN
    -- Already a JSON document: write it as is.
    OWA_UTIL.mime_header('application/json', FALSE, 'utf-8');
    OWA_UTIL.http_header_close;
    HTP.prn(p_json);
  END raw_json;

  FUNCTION flag(p IN VARCHAR2) RETURN NUMBER IS
  BEGIN
    RETURN CASE WHEN p IS NULL THEN NULL WHEN LOWER(p) IN ('true','1','y') THEN 1 ELSE 0 END;
  END flag;

  ------------------------------------------------------------------ team
  PROCEDURE h_team_list(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
    c SYS_REFCURSOR;
  BEGIN
    GCODE_EVENT_PORTAL_API.list_team(p_event_id, caller(p_authz), c);
    items(c);
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_team_list;

  PROCEDURE h_team_invite(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_email IN VARCHAR2, p_role IN VARCHAR2) IS
    v_token VARCHAR2(100);
  BEGIN
    GCODE_EVENT_PORTAL_API.invite_member(p_event_id, caller(p_authz), p_email, p_role, v_token);
    APEX_JSON.open_object; APEX_JSON.write('token', v_token); APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_team_invite;

  PROCEDURE h_team_role(p_authz IN VARCHAR2, p_member_id IN NUMBER, p_role IN VARCHAR2) IS
  BEGIN
    GCODE_EVENT_PORTAL_API.set_member_role(p_member_id, caller(p_authz), p_role); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_team_role;

  PROCEDURE h_team_remove(p_authz IN VARCHAR2, p_member_id IN NUMBER) IS
  BEGIN
    GCODE_EVENT_PORTAL_API.remove_member(p_member_id, caller(p_authz)); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_team_remove;

  ----------------------------------------------------------- share links
  PROCEDURE h_links_list(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
    c SYS_REFCURSOR;
  BEGIN
    GCODE_EVENT_PORTAL_API.list_share_links(p_event_id, caller(p_authz), c);
    items(c);
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_links_list;

  PROCEDURE h_links_create(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_label IN VARCHAR2, p_role IN VARCHAR2, p_expiry IN VARCHAR2) IS
    v_id NUMBER; v_token VARCHAR2(100);
  BEGIN
    GCODE_EVENT_PORTAL_API.create_share_link(p_event_id, caller(p_authz), p_label, p_role, p_expiry, v_id, v_token);
    APEX_JSON.open_object; APEX_JSON.write('id', v_id); APEX_JSON.write('token', v_token); APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_links_create;

  PROCEDURE h_links_revoke(p_authz IN VARCHAR2, p_link_id IN NUMBER) IS
  BEGIN
    GCODE_EVENT_PORTAL_API.revoke_share_link(p_link_id, caller(p_authz)); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_links_revoke;

  ----------------------------------------------------------- shared view
  PROCEDURE h_shared_get(p_token IN VARCHAR2) IS
    c SYS_REFCURSOR;
    v_event NUMBER; v_role VARCHAR2(20); v_kind VARCHAR2(10); v_viewer VARCHAR2(255); v_expired NUMBER;
  BEGIN
    -- Read only. A removed member or revoked link is "not valid", not "expired".
    GCODE_EVENT_PORTAL_API.resolve_shared(p_token, c);
    FETCH c INTO v_event, v_role, v_kind, v_viewer, v_expired;
    CLOSE c;
    APEX_JSON.open_object;
    APEX_JSON.write('event_id', v_event); APEX_JSON.write('role', v_role);
    APEX_JSON.write('kind', v_kind); APEX_JSON.write('viewer', v_viewer);
    APEX_JSON.write('expired', v_expired = 1);
    APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_shared_get;

  PROCEDURE h_shared_open(p_authz IN VARCHAR2, p_token IN VARCHAR2) IS
  BEGIN
    GCODE_EVENT_PORTAL_API.open_shared(p_token, caller_opt(p_authz)); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_shared_open;

  -- Only what the role may see. Contacts (email, phone) are never included.
  PROCEDURE h_shared_data(p_token IN VARCHAR2) IS
    v_event NUMBER; v_role VARCHAR2(20);
    c SYS_REFCURSOR;
    v_pending NUMBER; v_amount NUMBER; v_coupons NUMBER;
  BEGIN
    IF GCODE_EVENT_PORTAL_API.shared_scope(p_token, v_event, v_role) = 0 THEN
      RAISE_APPLICATION_ERROR(-20404, 'This link is not valid');
    END IF;
    APEX_JSON.open_object;
    IF GCODE_EVENT_PORTAL_API.role_can(v_role, 'attendees') = 1 THEN
      OPEN c FOR
        SELECT p.id AS "id", NVL(u.full_name, 'Guest') AS "name", NVL(p.category, 'ATTENDEE') AS "category"
          FROM gcode_event_participants p
          LEFT JOIN gcode_users u ON u.user_id = p.user_id
         WHERE p.event_id = v_event AND p.active = 'Y';
      APEX_JSON.write('guests', c);
    END IF;
    IF GCODE_EVENT_PORTAL_API.role_can(v_role, 'checkIn') = 1
       OR GCODE_EVENT_PORTAL_API.role_can(v_role, 'overview') = 1 THEN
      OPEN c FOR SELECT participant_id AS "participant_id" FROM gcode_event_checkins WHERE event_id = v_event;
      -- written as a plain array of ids
      APEX_JSON.open_array('arrived');
      LOOP
        DECLARE v_pid NUMBER; BEGIN FETCH c INTO v_pid; EXIT WHEN c%NOTFOUND; APEX_JSON.write(v_pid); END;
      END LOOP;
      CLOSE c;
      APEX_JSON.close_array;
    END IF;
    IF GCODE_EVENT_PORTAL_API.role_can(v_role, 'money') = 1 THEN
      SELECT COUNT(*), NVL(SUM(amount_claimed), 0) INTO v_pending, v_amount
        FROM gcode_upi_payment_claims WHERE event_id = v_event AND status = 'PENDING';
      SELECT COUNT(*) INTO v_coupons FROM gcode_coupons
       WHERE event_id = v_event AND is_active = 1
         AND (valid_to IS NULL OR valid_to > SYSTIMESTAMP);
      APEX_JSON.open_object('money');
      APEX_JSON.write('pending_claims', v_pending);
      APEX_JSON.write('pending_amount', v_amount);
      APEX_JSON.write('active_coupons', v_coupons);
      APEX_JSON.close_object;
    END IF;
    APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_shared_data;

  --------------------------------------------------------------- check-in
  PROCEDURE h_checkins_list(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_token IN VARCHAR2) IS
    c SYS_REFCURSOR;
  BEGIN
    GCODE_EVENT_PORTAL_API.list_check_ins(p_event_id, caller_opt(p_authz), p_token, c);
    items(c);
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_checkins_list;

  PROCEDURE h_checkins_set(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_participant_id IN NUMBER, p_arrived IN VARCHAR2, p_token IN VARCHAR2) IS
  BEGIN
    GCODE_EVENT_PORTAL_API.set_check_in(p_event_id, p_participant_id, flag(p_arrived), caller_opt(p_authz), p_token); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_checkins_set;

  ------------------------------------------------------- communications
  PROCEDURE h_comm_list(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
    c SYS_REFCURSOR;
  BEGIN
    GCODE_EVENT_PORTAL_API.list_communications(p_event_id, caller(p_authz), c);
    items(c);
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_comm_list;

  PROCEDURE h_comm_send(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_subject IN VARCHAR2, p_message IN CLOB, p_group IN VARCHAR2, p_ids IN CLOB) IS
    v_id NUMBER; v_n NUMBER;
  BEGIN
    -- Any recipient_count in the request body is simply never read (D7).
    GCODE_EVENT_PORTAL_API.send_communication(p_event_id, caller(p_authz), p_subject, p_message, UPPER(p_group), p_ids, v_id, v_n);
    APEX_JSON.open_object;
    APEX_JSON.write('id', v_id); APEX_JSON.write('event_id', p_event_id);
    APEX_JSON.write('subject', p_subject); APEX_JSON.write('message', p_message);
    APEX_JSON.write('recipient_count', v_n);
    APEX_JSON.write('sent_on', TO_CHAR(SYSTIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    APEX_JSON.write('status', 'QUEUED');
    APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_comm_send;

  ------------------------------------------------------------- live room
  PROCEDURE h_webinar_get(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
  BEGIN
    raw_json(GCODE_EVENT_LIVE_API.webinar_json(p_event_id, caller(p_authz)));
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_webinar_get;

  PROCEDURE h_webinar_put(p_authz IN VARCHAR2, p_event_id IN NUMBER,
    p_audience IN VARCHAR2, p_recording IN VARCHAR2, p_chat IN VARCHAR2, p_hand_raise IN VARCHAR2,
    p_captions IN VARCHAR2, p_notice IN VARCHAR2, p_restream_url IN VARCHAR2,
    p_slides_url IN VARCHAR2, p_replay_published IN VARCHAR2, p_body IN CLOB) IS
    -- A key present in the JSON body (even as null) means "set this field";
    -- an absent key means "leave it". ORDS binds both as NULL, so look at the body.
    FUNCTION has(p_key IN VARCHAR2) RETURN NUMBER IS
    BEGIN
      RETURN CASE WHEN p_body IS NOT NULL AND JSON_EXISTS(p_body, '$.' || p_key) THEN 1 ELSE 0 END;
    END has;
  BEGIN
    GCODE_EVENT_LIVE_API.save_webinar(p_event_id, caller(p_authz),
      p_audience, flag(p_recording), flag(p_chat), flag(p_hand_raise), flag(p_captions),
      p_notice, p_restream_url, p_slides_url, flag(p_replay_published),
      has('notice'), has('restream_url'), has('slides_url'));
    ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_webinar_put;

  PROCEDURE h_live_access(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
  BEGIN
    raw_json(GCODE_EVENT_LIVE_API.live_access_json(p_event_id, caller_opt(p_authz)));
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_live_access;

  -- Mints a short-lived VideoSDK token tied to this person. UNTESTED against
  -- the provider: the claim set follows the v2 token docs and must be proven
  -- by the spike (README) before any attendee gets a real room.
  PROCEDURE h_live_token(p_authz IN VARCHAR2, p_event_id IN NUMBER) IS
    v_role VARCHAR2(10);
    v_pid VARCHAR2(60);
    v_room VARCHAR2(200);
    v_key VARCHAR2(200) := setting('VIDEOSDK_API_KEY');
    v_secret VARCHAR2(500) := setting('VIDEOSDK_SECRET');
    v_end DATE;
    v_ttl NUMBER;
    v_head VARCHAR2(200);
    v_pay VARCHAR2(2000);
  BEGIN
    v_pid := GCODE_EVENT_LIVE_API.check_may_join(p_event_id, caller(p_authz), v_role);
    SELECT room_ref INTO v_room FROM gcode_event_webinar WHERE event_id = p_event_id;
    IF v_room IS NULL OR v_key IS NULL OR v_secret IS NULL THEN
      RAISE_APPLICATION_ERROR(-20403, 'The live room is not switched on for this session yet');
    END IF;
    SELECT NVL(end_date, start_date) INTO v_end FROM events WHERE id = p_event_id;
    -- Short expiry: until 30 minutes after the end, never more than 12 hours.
    v_ttl := LEAST(43200, GREATEST(900, ROUND((v_end - GCODE_EVENT_LIVE_API.now_ist) * 86400) + 1800));
    v_head := b64url_encode(UTL_RAW.CAST_TO_RAW('{"alg":"HS256","typ":"JWT"}'));
    v_pay := b64url_encode(UTL_RAW.CAST_TO_RAW(JSON_OBJECT(
      'apikey' VALUE v_key,
      'permissions' VALUE JSON_ARRAY(CASE WHEN v_role = 'HOST' THEN 'allow_mod' ELSE 'allow_join' END),
      'version' VALUE 2,
      'roomId' VALUE v_room,
      'participantId' VALUE v_pid,
      'iat' VALUE epoch_now,
      'exp' VALUE epoch_now + v_ttl)));
    APEX_JSON.open_object;
    APEX_JSON.write('credential', v_head || '.' || v_pay || '.' ||
      b64url_encode(DBMS_CRYPTO.MAC(UTL_RAW.CAST_TO_RAW(v_head || '.' || v_pay),
        DBMS_CRYPTO.HMAC_SH256, UTL_RAW.CAST_TO_RAW(v_secret))));
    APEX_JSON.close_object;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_live_token;

  PROCEDURE h_live_action(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_action IN VARCHAR2, p_on IN VARCHAR2, p_text IN VARCHAR2) IS
    v_uid NUMBER := caller(p_authz);
  BEGIN
    IF p_action = 'notice' THEN
      GCODE_EVENT_LIVE_API.set_notice(p_event_id, v_uid, p_text);
    ELSIF p_action = 'go-live' THEN
      GCODE_EVENT_LIVE_API.queue_command(p_event_id, v_uid, 'go_live');
    ELSIF p_action = 'stop' THEN
      GCODE_EVENT_LIVE_API.queue_command(p_event_id, v_uid, 'stop');
    ELSIF p_action = 'record' THEN
      GCODE_EVENT_LIVE_API.queue_command(p_event_id, v_uid, CASE WHEN flag(p_on) = 1 THEN 'record_on' ELSE 'record_off' END);
    ELSIF p_action = 'captions' THEN
      GCODE_EVENT_LIVE_API.queue_command(p_event_id, v_uid, CASE WHEN flag(p_on) = 1 THEN 'captions_on' ELSE 'captions_off' END);
    ELSIF p_action = 'end' THEN
      GCODE_EVENT_LIVE_API.queue_command(p_event_id, v_uid, 'end');
    ELSE
      RAISE_APPLICATION_ERROR(-20400, 'Unknown action');
    END IF;
    ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_live_action;

  PROCEDURE h_live_remove(p_authz IN VARCHAR2, p_event_id IN NUMBER, p_registration_id IN NUMBER) IS
  BEGIN
    GCODE_EVENT_LIVE_API.remove_person(p_event_id, caller(p_authz), p_registration_id); ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_live_remove;

  PROCEDURE h_webhook_live(p_secret IN VARCHAR2, p_event_id IN NUMBER,
    p_provider_event_id IN VARCHAR2, p_kind IN VARCHAR2, p_participant_id IN NUMBER,
    p_recording_url IN VARCHAR2) IS
    v_expected VARCHAR2(500) := setting('WEBHOOK_SECRET');
  BEGIN
    -- Closed unless a secret is configured, and compared in constant time.
    IF v_expected IS NULL OR p_secret IS NULL
       OR DBMS_CRYPTO.HASH(UTL_RAW.CAST_TO_RAW(p_secret), DBMS_CRYPTO.HASH_SH256)
          <> DBMS_CRYPTO.HASH(UTL_RAW.CAST_TO_RAW(v_expected), DBMS_CRYPTO.HASH_SH256) THEN
      RAISE_APPLICATION_ERROR(-20403, 'Not allowed');
    END IF;
    GCODE_EVENT_LIVE_API.record_provider_event(p_event_id, p_provider_event_id, p_kind,
      p_participant_id, NULL, p_recording_url);
    ok;
  EXCEPTION WHEN OTHERS THEN fail(SQLERRM);
  END h_webhook_live;

END GCODE_EVENT_HTTP_API;
/
