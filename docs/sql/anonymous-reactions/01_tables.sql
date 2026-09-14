ALTER TABLE GCODE_EVENT_REACTIONS ADD (DEVICE_TOKEN VARCHAR2(64));
CREATE INDEX IX_REACTIONS_DEVICE_TOKEN ON GCODE_EVENT_REACTIONS (DEVICE_TOKEN, CREATED_ON);

-- RATER_ATTENDEE_ID stays on the table (nullable already, FK intact) but is
-- now dead going forward -- new reactions never populate it. Left in place
-- rather than dropped, matching this repo's additive-only migration style.
-- DEVICE_TOKEN is the sole identity anchor for a reaction from here on: a
-- random UUID the browser generates and persists in localStorage
-- (src/lib/reactions/device-token.ts), never tied to a real person or
-- registration.
