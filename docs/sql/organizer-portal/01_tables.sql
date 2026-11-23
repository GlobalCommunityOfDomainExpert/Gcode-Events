-- Handover 7: organizer portal + live room. APEX holds TABLES ONLY. All logic
-- (tokens, hashing, who may do what, the video provider, webhooks) lives in the
-- Next.js server routes (src/app/api/portal, src/server/portal), which read and
-- write these tables through ORDS (see 02_rest.sql). Nothing here needs a
-- grant: no DBMS_CRYPTO, no packages.
--
-- Script 1 of 2. Run in WKSP_GCODE2. It is re-runnable: the first block drops
-- the Handover 7 objects of any earlier attempt (they held no real data, and
-- the old packages that failed to compile are removed too). Take a backup
-- anyway.
--
-- User ids are VARCHAR2 on purpose: GCODE_USERS.USER_ID can exceed JavaScript's
-- safe-integer range, and a JSON number would be silently rounded.

-- ------------------------------------------------------------------ clean up
BEGIN
  FOR o IN (SELECT object_name, object_type FROM user_objects
             WHERE object_name IN ('GCODE_EVENT_PORTAL_API', 'GCODE_EVENT_LIVE_API',
                                   'GCODE_EVENT_HTTP_API')
               AND object_type = 'PACKAGE') LOOP
    EXECUTE IMMEDIATE 'DROP PACKAGE ' || o.object_name;
  END LOOP;
  FOR v IN (SELECT view_name FROM user_views WHERE view_name LIKE 'GCODE\_PORTAL\_V\_%' ESCAPE '\') LOOP
    EXECUTE IMMEDIATE 'DROP VIEW ' || v.view_name;
  END LOOP;
  FOR t IN (SELECT table_name FROM user_tables
             WHERE table_name IN ('GCODE_EVENT_COMM_RECIPIENTS', 'GCODE_EVENT_COMMUNICATIONS',
                                  'GCODE_EVENT_CHECKINS', 'GCODE_EVENT_SHARE_LINKS',
                                  'GCODE_EVENT_TEAM', 'GCODE_EVENT_LIVE_BLOCKS',
                                  'GCODE_EVENT_LIVE_EVENTS', 'GCODE_EVENT_LIVE_COMMANDS',
                                  'GCODE_EVENT_LIVE_ATTENDANCE', 'GCODE_EVENT_WEBINAR',
                                  'GCODE_PORTAL_SETTINGS', 'GCODE_PORTAL_KEY')
             ORDER BY CASE table_name WHEN 'GCODE_EVENT_COMM_RECIPIENTS' THEN 0 ELSE 1 END) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS PURGE';
  END LOOP;
END;
/

-- ----------------------------------------------------------------- access key
-- No table here: the key the Next.js server sends in the X-Portal-Key header
-- lives in your existing GCODE_APP_SECRETS (secret_name 'ORDS_PORTAL_KEY').
-- Insert it before running 02_rest.sql (see the top of that script).

-- ------------------------------------------------------------- team & access
-- Tokens are 256-bit random values made by the server; only their SHA-256 hash
-- is stored, so a token is shown once, at creation.
CREATE TABLE GCODE_EVENT_TEAM (
  ID           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID     NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  EMAIL        VARCHAR2(255) NOT NULL,           -- lower-cased
  USER_ID      VARCHAR2(40),                     -- set when the invite is accepted
  ROLE         VARCHAR2(20) NOT NULL,
  STATUS       VARCHAR2(10) DEFAULT 'INVITED' NOT NULL,
  TOKEN_HASH   VARCHAR2(64) NOT NULL,
  INVITED_BY   VARCHAR2(40),
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
  CREATED_BY  VARCHAR2(40),
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
  ID             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL REFERENCES GCODE_EVENT_PARTICIPANTS (ID) ON DELETE CASCADE,
  CHECKED_IN_ON  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CHECKED_IN_BY  VARCHAR2(120),                  -- user id, or "link:<label>"
  CONSTRAINT UQ_GCODE_EVENT_CHECKINS UNIQUE (EVENT_ID, PARTICIPANT_ID)
);

-- ---------------------------------------------------------------- live room
-- The provider's name, room id and recording file are server-only: the Next.js
-- routes never return them.
CREATE TABLE GCODE_EVENT_WEBINAR (
  EVENT_ID         NUMBER PRIMARY KEY REFERENCES EVENTS (ID) ON DELETE CASCADE,
  AUDIENCE         VARCHAR2(12) DEFAULT 'livestream' NOT NULL,
  RECORDING        NUMBER(1) DEFAULT 1 NOT NULL,
  CHAT             NUMBER(1) DEFAULT 1 NOT NULL,
  HAND_RAISE       NUMBER(1) DEFAULT 1 NOT NULL,
  CAPTIONS         NUMBER(1) DEFAULT 0 NOT NULL,
  NOTICE           VARCHAR2(120),
  RESTREAM_URL     VARCHAR2(500),
  SLIDES_URL       VARCHAR2(500),
  REPLAY_PUBLISHED NUMBER(1) DEFAULT 0 NOT NULL,
  -- Set by the server when the host acts, corrected by provider webhooks:
  IS_LIVE          NUMBER(1) DEFAULT 0 NOT NULL,
  IS_RECORDING     NUMBER(1) DEFAULT 0 NOT NULL,
  IS_ENDED         NUMBER(1) DEFAULT 0 NOT NULL,
  PROVIDER         VARCHAR2(20) DEFAULT 'VIDEOSDK' NOT NULL,
  ROOM_REF         VARCHAR2(200),
  RECORDING_URL    VARCHAR2(1000),   -- OUR storage, set after the recording is copied
  HLS_URL          VARCHAR2(1000),   -- the live watch address; secret, server-only, cleared when the stream stops
  UPDATED_ON       TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT CK_WEBINAR_AUDIENCE CHECK (AUDIENCE IN ('interactive','livestream'))
);

-- Joined / left per registration, fed by provider webhooks. Rejoins add up.
CREATE TABLE GCODE_EVENT_LIVE_ATTENDANCE (
  ID             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL,
  FIRST_JOINED   TIMESTAMP,
  LAST_JOINED    TIMESTAMP,   -- start of the current visit, NULL while out
  LAST_LEFT      TIMESTAMP,
  SECONDS_IN     NUMBER DEFAULT 0 NOT NULL,
  CONSTRAINT UQ_LIVE_ATTENDANCE UNIQUE (EVENT_ID, PARTICIPANT_ID)
);

-- Every provider event once: a replayed webhook hits the unique key and is
-- ignored.
CREATE TABLE GCODE_EVENT_LIVE_EVENTS (
  ID                NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID          NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PROVIDER_EVENT_ID VARCHAR2(200) NOT NULL,
  KIND              VARCHAR2(20) NOT NULL,
  PARTICIPANT_ID    NUMBER,
  RECEIVED_ON       TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT UQ_LIVE_EVENTS UNIQUE (PROVIDER_EVENT_ID),
  CONSTRAINT CK_LIVE_EVENTS_KIND CHECK (KIND IN
    ('joined','left','live_started','live_stopped','recording_started',
     'recording_ready','session_closed','failed'))
);

-- People the host removed. They get no new credential.
CREATE TABLE GCODE_EVENT_LIVE_BLOCKS (
  ID             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL,
  BLOCKED_ON     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT UQ_LIVE_BLOCKS UNIQUE (EVENT_ID, PARTICIPANT_ID)
);

-- ------------------------------------------------------------ read-only views
-- The Next.js server reads the existing tables through these views, which carry
-- only the columns it needs (no passwords, no phone numbers) and turn user ids
-- into text. Dates are IST wall-clock text, which is how EVENTS stores them.
CREATE OR REPLACE VIEW GCODE_PORTAL_V_EVENTS AS
  SELECT e.id AS id, e.title AS title, TO_CHAR(e.organizer_id) AS organizer_id,
         o.full_name AS organizer_name,
         -- NB: despite the _ist names these are UTC wall-clock, as stored.
         TO_CHAR(e.start_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_ist,
         TO_CHAR(NVL(e.end_date, e.start_date), 'YYYY-MM-DD"T"HH24:MI:SS') AS end_ist
    FROM events e
    LEFT JOIN gcode_users o ON o.user_id = e.organizer_id;

CREATE OR REPLACE VIEW GCODE_PORTAL_V_PARTICIPANTS AS
  SELECT p.id AS id, p.event_id AS event_id, TO_CHAR(p.user_id) AS user_id,
         NVL(p.category, 'ATTENDEE') AS category, p.active AS active,
         u.full_name AS full_name, LOWER(u.email) AS email
    FROM gcode_event_participants p
    LEFT JOIN gcode_users u ON u.user_id = p.user_id;

CREATE OR REPLACE VIEW GCODE_PORTAL_V_MONEY AS
  SELECT e.id AS event_id,
         (SELECT COUNT(*) FROM gcode_upi_payment_claims c
           WHERE c.event_id = e.id AND c.status = 'PENDING') AS pending_claims,
         (SELECT NVL(SUM(c.amount_claimed), 0) FROM gcode_upi_payment_claims c
           WHERE c.event_id = e.id AND c.status = 'PENDING') AS pending_amount,
         (SELECT COUNT(*) FROM gcode_coupons k
           WHERE k.event_id = e.id AND k.is_active = 1
             AND (k.valid_to IS NULL OR k.valid_to > SYSTIMESTAMP)) AS active_coupons
    FROM events e;

-- Panelist invites: optional role + personal note (D9). The panelists table is
-- not in this repo, so this block finds it, adds the columns (once), and builds
-- the view the server reads speakers from. It prints what it did.
DECLARE
  v_table VARCHAR2(128);
  v_has   NUMBER;
BEGIN
  SELECT table_name INTO v_table
    FROM user_tables
   WHERE table_name IN ('GCODE_EVENT_PANELISTS','EVENT_PANELISTS','GCODE_PANELISTS')
   FETCH FIRST 1 ROWS ONLY;
  SELECT COUNT(*) INTO v_has FROM user_tab_columns
   WHERE table_name = v_table AND column_name = 'PANELIST_ROLE';
  IF v_has = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE ' || v_table || ' ADD (PANELIST_ROLE VARCHAR2(10), INVITE_NOTE VARCHAR2(500))';
    EXECUTE IMMEDIATE 'ALTER TABLE ' || v_table || ' ADD CONSTRAINT CK_PANELIST_ROLE CHECK (PANELIST_ROLE IN (''JUDGE'',''MENTOR'',''SPEAKER''))';
  END IF;
  EXECUTE IMMEDIATE 'CREATE OR REPLACE VIEW GCODE_PORTAL_V_PANELISTS AS '
    || 'SELECT p.id AS id, p.event_id AS event_id, TO_CHAR(p.user_id) AS user_id, '
    || 'p.invited_email AS invited_email, p.status AS status, p.panelist_role AS panelist_role, '
    || 'u.full_name AS full_name FROM ' || v_table || ' p '
    || 'LEFT JOIN gcode_users u ON u.user_id = p.user_id';
  DBMS_OUTPUT.PUT_LINE('Panelists table ' || v_table || ' ready; GCODE_PORTAL_V_PANELISTS created');
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    DBMS_OUTPUT.PUT_LINE('Panelists table not found: add PANELIST_ROLE VARCHAR2(10) and INVITE_NOTE VARCHAR2(500) by hand, then create GCODE_PORTAL_V_PANELISTS (id, event_id, user_id as text, invited_email, status, panelist_role, full_name).');
END;
/
