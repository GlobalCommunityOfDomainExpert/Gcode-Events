-- Run BEFORE compiling the updated 02_gcode_cashfree_payments_api.sql (the package body reads CF_ENV).
-- Every order remembers the environment it was created in (from the CF_ENV row), so verify/webhook keep using its keys.
-- Existing orders were all created with the sandbox keys -> 'TEST'.
ALTER TABLE GCODE_PAYMENT_ORDERS_CF ADD (CF_ENV VARCHAR2(4) DEFAULT 'TEST' NOT NULL);
ALTER TABLE GCODE_PAYMENT_ORDERS_CF ADD CONSTRAINT CK_GPOCF_ENV CHECK (CF_ENV IN ('TEST', 'PROD'));
