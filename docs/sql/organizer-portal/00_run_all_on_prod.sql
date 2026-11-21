-- Consolidated script: run top to bottom in WKSP_GCODE2. Backup first.

-- Handover 7, parts 1-2: organizer portal tables. Additive only.
-- Run in WKSP_GCODE2 (backup first). Safe to run once; re-running errors on
-- "name already used", which is harmless.

-- ---------------------------------------------------------------- Part 1
-- Hybrid events get a live room only when the organizer/server says so (D3).
-- Online events always have one; this flag only matters for Hybrid.
ALTER TABLE EVENTS ADD (LIVE_ROOM_ENABLED NUMBER(1) DEFAULT 0 NOT NULL);
ALTER TABLE EVENTS ADD CONSTRAINT CK_EVENTS_LIVE_ROOM CHECK (LIVE_ROOM_ENABLED IN (0, 1));

-- ---------------------------------------------------------------- Part 2
-- Team members and share links are ACCESS CONTROL (D8):
--   * tokens are 256-bit CSPRNG values; only the SHA-256 hash is stored, the
--     plaintext is returned once at creation and never again.
--   * expiry and revoke are enforced on every read, in the package.

CREATE TABLE GCODE_EVENT_TEAM (
  ID           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID     NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  EMAIL        VARCHAR2(255) NOT NULL,           -- stored lower-cased
  USER_ID      NUMBER,                           -- set when the invite is accepted
  ROLE         VARCHAR2(20) NOT NULL,
  STATUS       VARCHAR2(10) DEFAULT 'INVITED' NOT NULL,
  TOKEN_HASH   VARCHAR2(64) NOT NULL,            -- hex SHA-256 of the invite token
  INVITED_BY   NUMBER,
  INVITED_ON   TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  ACTIVATED_ON TIMESTAMP,
  CONSTRAINT CK_GCODE_EVENT_TEAM_ROLE
    CHECK (ROLE IN ('CO_ORGANIZER','VENUE_PARTNER','SPONSOR','CHECK_IN','FINANCE')),
  CONSTRAINT CK_GCODE_EVENT_TEAM_STATUS CHECK (STATUS IN ('INVITED','ACTIVE')),
  CONSTRAINT UQ_GCODE_EVENT_TEAM_EMAIL UNIQUE (EVENT_ID, EMAIL),
  CONSTRAINT UQ_GCODE_EVENT_TEAM_TOKEN UNIQUE (TOKEN_HASH)
);
CREATE INDEX IX_GCODE_EVENT_TEAM_USER ON GCODE_EVENT_TEAM (USER_ID);

CREATE TABLE GCODE_EVENT_SHARE_LINKS (
  ID          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID    NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  LABEL       VARCHAR2(120) NOT NULL,
  ROLE        VARCHAR2(20) NOT NULL,
  TOKEN_HASH  VARCHAR2(64) NOT NULL,
  CREATED_BY  NUMBER,
  CREATED_ON  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  EXPIRES_ON  TIMESTAMP,                         -- NULL = never
  REVOKED_ON  TIMESTAMP,
  VIEWS       NUMBER DEFAULT 0 NOT NULL,
  -- No CO_ORGANIZER links: that role edits the event and emails attendees, so
  -- it needs a signed-in account (invite by email only).
  CONSTRAINT CK_GCODE_SHARE_LINK_ROLE
    CHECK (ROLE IN ('VENUE_PARTNER','SPONSOR','CHECK_IN','FINANCE')),
  CONSTRAINT UQ_GCODE_SHARE_LINK_TOKEN UNIQUE (TOKEN_HASH)
);
CREATE INDEX IX_GCODE_SHARE_LINKS_EVENT ON GCODE_EVENT_SHARE_LINKS (EVENT_ID);

CREATE TABLE GCODE_EVENT_CHECKINS (
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL REFERENCES GCODE_EVENT_PARTICIPANTS (ID) ON DELETE CASCADE,
  CHECKED_IN_ON  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CHECKED_IN_BY  VARCHAR2(120),                  -- user id, or "link:<label>"
  CONSTRAINT PK_GCODE_EVENT_CHECKINS PRIMARY KEY (EVENT_ID, PARTICIPANT_ID)
);

-- One row per email blast. RECIPIENT_COUNT is written by the server from the
-- resolved recipient list (D7); the browser never sends a count.
CREATE TABLE GCODE_EVENT_COMMUNICATIONS (
  ID               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID         NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  SUBJECT          VARCHAR2(200) NOT NULL,
  MESSAGE          CLOB NOT NULL,                -- template; {first_name} etc. stay server-side
  RECIPIENT_GROUP  VARCHAR2(12) NOT NULL,
  RECIPIENT_COUNT  NUMBER NOT NULL,
  SENT_BY          NUMBER NOT NULL,
  SENT_ON          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  STATUS           VARCHAR2(10) DEFAULT 'QUEUED' NOT NULL,
  CONSTRAINT CK_GCODE_COMM_GROUP CHECK (RECIPIENT_GROUP IN ('ALL','CONFIRMED','PAID','CUSTOM')),
  CONSTRAINT CK_GCODE_COMM_STATUS CHECK (STATUS IN ('QUEUED','SENT','FAILED'))
);
CREATE INDEX IX_GCODE_COMM_EVENT ON GCODE_EVENT_COMMUNICATIONS (EVENT_ID, SENT_ON);

-- The resolved recipients of a blast: what the mailer job reads, and the
-- audit trail of who was sent what.
CREATE TABLE GCODE_EVENT_COMM_RECIPIENTS (
  COMMUNICATION_ID NUMBER NOT NULL REFERENCES GCODE_EVENT_COMMUNICATIONS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID   NUMBER NOT NULL,
  EMAIL            VARCHAR2(255) NOT NULL,
  STATUS           VARCHAR2(10) DEFAULT 'QUEUED' NOT NULL,
  CONSTRAINT PK_GCODE_COMM_RECIPIENTS PRIMARY KEY (COMMUNICATION_ID, PARTICIPANT_ID)
);

-- Panelist invites: optional role + personal note (D9). A backend that
-- ignores them behaves as today. The panelists table is not in this repo, so
-- this block finds it instead of guessing; it prints what it did.
DECLARE
  v_table VARCHAR2(128);
BEGIN
  SELECT table_name INTO v_table
    FROM user_tables
   WHERE table_name IN ('GCODE_EVENT_PANELISTS','EVENT_PANELISTS','GCODE_PANELISTS')
   FETCH FIRST 1 ROWS ONLY;
  EXECUTE IMMEDIATE 'ALTER TABLE ' || v_table || ' ADD (PANELIST_ROLE VARCHAR2(10), INVITE_NOTE VARCHAR2(500))';
  EXECUTE IMMEDIATE 'ALTER TABLE ' || v_table || ' ADD CONSTRAINT CK_PANELIST_ROLE CHECK (PANELIST_ROLE IN (''JUDGE'',''MENTOR'',''SPEAKER''))';
  DBMS_OUTPUT.PUT_LINE('Added PANELIST_ROLE, INVITE_NOTE to ' || v_table);
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('Panelists table not found: add PANELIST_ROLE VARCHAR2(10) and INVITE_NOTE VARCHAR2(500) by hand, then patch invite_panelist to accept them.');
END;
/

-- GCODE_EVENT_PORTAL_API: team, share links, check-ins, communications.
-- Needs EXECUTE on DBMS_CRYPTO (ask the DBA once: GRANT EXECUTE ON SYS.DBMS_CRYPTO TO <schema>).
--
-- ASSUMPTIONS to verify before running (names not in this repo):
--   events.organizer_id (NUMBER-compatible user id), events.start_date,
--   gcode_users(user_id, email), gcode_event_participants(id, event_id,
--   user_id, category). If a column is named differently, edit the SELECTs.
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
      SELECT start_date INTO v_start FROM events WHERE id = p_event_id;
      v_exp := CAST(NVL(v_start, SYSDATE) + 1 AS TIMESTAMP);   -- day after the start; adjust if events has an end column
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

END GCODE_EVENT_PORTAL_API;
/
