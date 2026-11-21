-- Handover 7: organizer portal + live room tables. Additive only. Script 1 of 3
-- (01_tables.sql, 02_packages.sql, 03_ords.sql). Run them in that order.
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


-- ---------------------------------------------------------------- Part 3-4
-- Live room. The provider's name, room id and recording file are server-side
-- only: nothing here is ever returned to a browser except through the
-- packages, which filter by role.

-- Secrets and switches (JWT secret, provider key, webhook secret). Keep this
-- table out of ORDS and out of every API response.
CREATE TABLE GCODE_PORTAL_SETTINGS (
  SETTING_KEY   VARCHAR2(60) PRIMARY KEY,
  SETTING_VALUE VARCHAR2(1000) NOT NULL
);
-- Keys read by the packages (insert the ones you use):
--   JWT_SECRET            HS256 secret that signs your login tokens. When set,
--                         caller identity is VERIFIED, not just decoded. The
--                         user id is read from the userId, user_id or sub claim.
--   WEBHOOK_SECRET        shared secret the provider relay sends with events
--   VIDEOSDK_API_KEY, VIDEOSDK_SECRET   provider credentials (never to browser)
--   ROOM_LIMIT_INTERACTIVE, ROOM_LIMIT_VIEWERS   plan limits (D14)

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
  -- State reported by the provider (webhooks), never set from a browser:
  IS_LIVE          NUMBER(1) DEFAULT 0 NOT NULL,
  IS_RECORDING     NUMBER(1) DEFAULT 0 NOT NULL,
  IS_ENDED         NUMBER(1) DEFAULT 0 NOT NULL,
  -- Server-only:
  PROVIDER         VARCHAR2(20) DEFAULT 'VIDEOSDK' NOT NULL,
  ROOM_REF         VARCHAR2(200),
  RECORDING_URL    VARCHAR2(1000),  -- OUR storage, filled after recording_ready
  UPDATED_ON       TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT CK_WEBINAR_AUDIENCE CHECK (AUDIENCE IN ('interactive','livestream'))
);

-- Joined / left per registration, fed by provider webhooks. Rejoins add up.
CREATE TABLE GCODE_EVENT_LIVE_ATTENDANCE (
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL,
  FIRST_JOINED   TIMESTAMP,
  LAST_JOINED    TIMESTAMP,   -- start of the current visit, NULL while out
  LAST_LEFT      TIMESTAMP,
  SECONDS_IN     NUMBER DEFAULT 0 NOT NULL,
  CONSTRAINT PK_LIVE_ATTENDANCE PRIMARY KEY (EVENT_ID, PARTICIPANT_ID)
);

-- Every normalized provider event, once. PROVIDER_EVENT_ID makes a replayed
-- webhook a no-op.
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

-- Host actions waiting for the provider worker (go live, record, end...).
-- The server, not the host's browser, starts these (D15). The flags above only
-- change when the matching provider event comes back.
CREATE TABLE GCODE_EVENT_LIVE_COMMANDS (
  ID         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  EVENT_ID   NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  COMMAND    VARCHAR2(20) NOT NULL,
  ARGUMENT   VARCHAR2(500),
  REQUESTED_BY NUMBER,
  REQUESTED_ON TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  STATUS     VARCHAR2(10) DEFAULT 'QUEUED' NOT NULL,
  CONSTRAINT CK_LIVE_COMMAND CHECK (COMMAND IN
    ('go_live','stop','record_on','record_off','captions_on','captions_off','end')),
  CONSTRAINT CK_LIVE_COMMAND_STATUS CHECK (STATUS IN ('QUEUED','DONE','FAILED'))
);

-- People the host removed. They get no new credential.
CREATE TABLE GCODE_EVENT_LIVE_BLOCKS (
  EVENT_ID       NUMBER NOT NULL REFERENCES EVENTS (ID) ON DELETE CASCADE,
  PARTICIPANT_ID NUMBER NOT NULL,
  BLOCKED_ON     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_LIVE_BLOCKS PRIMARY KEY (EVENT_ID, PARTICIPANT_ID)
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
