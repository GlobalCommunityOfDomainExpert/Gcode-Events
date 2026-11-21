-- Rate-limit counters for the Next.js /api/v1 routes (src/server/rate-limit).
-- Fixed-window counters, one row per bucket. BUCKET_KEY is
-- "<rule name>:<sha256 of the IP or email>" — no raw emails/IPs are stored.
-- Rows older than a day are pruned by the app; the table stays small.
-- Run in WKSP_GCODE2, then the grant below as ADMIN.

CREATE TABLE gcode_rate_limits (
  bucket_key   VARCHAR2(120) NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  hits         NUMBER(10) NOT NULL,
  CONSTRAINT pk_gcode_rate_limits PRIMARY KEY (bucket_key)
);

CREATE INDEX ix_gcode_rate_limits_window ON gcode_rate_limits (window_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON wksp_gcode2.gcode_rate_limits TO gcode_events_app;
