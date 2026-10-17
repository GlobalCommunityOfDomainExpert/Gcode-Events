-- Cashfree environment rows for GCODE_APP_SECRETS. Run in SQL Commands. Replace every <...> yourself
-- and never commit real keys.
--
-- ONE backend switch decides the environment for every payment: the CF_ENV row ('production' or
-- 'sandbox'). The frontend sends and configures nothing. See 06_env_per_order.sql.
-- Per-environment rows (the API uses TEST_ for env=test and CASHFREE_PROD_ for env=prod):
--   APP_ID, SECRET_KEY, BASE_URL, RETURN_BASE_URL
-- Shared rows (already present, leave as they are):
--   CASHFREE_API_VERSION, CASHFREE_NOTIFY_URL, CASHFREE_ORDER_EXPIRY_MINUTES

-- 1. Production rows (APP_ID / SECRET_KEY / BASE_URL may already exist - skip those)
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_APP_ID',          '<live app id>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_SECRET_KEY',      '<live secret key>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_BASE_URL',        'https://api.cashfree.com/pg');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_PROD_RETURN_BASE_URL', '<live site, e.g. https://events.gcode.in>');

-- 2. Test return URL: copy what is in the old CASHFREE_RETURN_BASE_URL row (http://localhost:3000)
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value)
SELECT 'TEST_CASHFREE_RETURN_BASE_URL', secret_value FROM GCODE_APP_SECRETS WHERE secret_name = 'CASHFREE_RETURN_BASE_URL';
COMMIT;

-- 3. The switch. 'production' -> CASHFREE_PROD_* rows, 'sandbox' -> TEST_CASHFREE_* rows
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CF_ENV', 'production');
COMMIT;

-- 4. Verify (names only). Expect 8 rows: 4 TEST_ + 4 CASHFREE_PROD_ (CF_ENV is separate)
SELECT secret_name FROM GCODE_APP_SECRETS
WHERE secret_name LIKE 'TEST\_CASHFREE\_%' ESCAPE '\' OR secret_name LIKE 'CASHFREE\_PROD\_%' ESCAPE '\'
ORDER BY 1;

-- 5. After the package is compiled, check each environment (run both):
DECLARE v_s NUMBER; v_r VARCHAR2(500);
BEGIN
  GCODE_CASHFREE_PAYMENTS_API.ping(v_s, v_r, 'TEST'); DBMS_OUTPUT.PUT_LINE('sandbox: ' || v_r);
  GCODE_CASHFREE_PAYMENTS_API.ping(v_s, v_r, 'PROD'); DBMS_OUTPUT.PUT_LINE('production: ' || v_r);
END;
/

-- TO SWITCH LATER (takes effect on the next order; no redeploy anywhere):
--   UPDATE GCODE_APP_SECRETS SET secret_value = 'sandbox'    WHERE secret_name = 'CF_ENV'; COMMIT;
--   UPDATE GCODE_APP_SECRETS SET secret_value = 'production' WHERE secret_name = 'CF_ENV'; COMMIT;
-- One database serves every site, so this switches all of them at once.
