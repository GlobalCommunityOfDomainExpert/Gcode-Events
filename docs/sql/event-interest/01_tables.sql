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
