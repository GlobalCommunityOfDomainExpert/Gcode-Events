-- Production Cashfree config rows for GCODE_APP_SECRETS.
-- Run in SQL Commands on the database that serves production. Replace every <...> yourself;
-- never commit real keys. Needs the updated 02_gcode_cashfree_payments_api.sql (CASHFREE_ENV support).
--
-- Sandbox rows (CASHFREE_*) stay untouched; production lives beside them as CASHFREE_PROD_*.

INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_APP_ID',               '<live app id>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_SECRET_KEY',           '<live secret key>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_BASE_URL',             'https://api.cashfree.com/pg');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_API_VERSION',          '2025-01-01');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_NOTIFY_URL',           '<production ORDS URL>/webhooks/cashfree');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_RETURN_BASE_URL',      '<production site, e.g. https://events.gcode.in>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_ORDER_EXPIRY_MINUTES', '30');
COMMIT;

-- Verify (names only) -> 7 rows
SELECT secret_name FROM GCODE_APP_SECRETS WHERE secret_name LIKE 'CASHFREE\_PROD\_%' ESCAPE '\' ORDER BY 1;

-- THE SWITCH. Do this last, after the package is recompiled and ping() passes in prod mode.
-- Go live:
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_ENV', 'PRODUCTION');
COMMIT;
-- Roll back to sandbox instantly (no redeploy):
-- UPDATE GCODE_APP_SECRETS SET secret_value = 'SANDBOX' WHERE secret_name = 'CASHFREE_ENV'; COMMIT;
