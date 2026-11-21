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
