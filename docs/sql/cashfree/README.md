# Cashfree payments — complete runbook

Cashfree is now the **default** gateway for paid event registrations. Razorpay's tables, package and
routes are untouched and still work: set `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay` in the frontend to
fall back to them. Everything here is new, so nothing existing can be broken by running it.

| File | What it is |
|---|---|
| `01_tables.sql` | `GCODE_PAYMENT_ORDERS_CF`, `GCODE_PAYMENT_EVENTS_CF`, view `V_GCODE_PAYMENT_CF_NEEDS_ACTION` |
| `02_gcode_cashfree_payments_api.sql` | the package `GCODE_CASHFREE_PAYMENTS_API` |
| `03_ords_endpoints.md` | source for the two new ORDS routes |
| `04_testing_and_rollout.md` | the test matrix, support runbook, sandbox → production switch |
| `99_rollback.sql` | removes everything above |

All paths are under `/home/neuralnerd/projects/Gcode-Events/docs/sql/cashfree/`.

## What you have to do, in order

### 0. Pre-flight (read-only)
SQL Workshop → **SQL Commands**:
```sql
SELECT id, status_code FROM event_status ORDER BY id;
SELECT object_name, status FROM user_objects WHERE object_name IN ('GCODE_COUPONS_API','GCODE_EVENT_PARTICIPANTS_API') AND object_type = 'PACKAGE BODY';
```
Expect status codes like `DRAFT`, `OPEN`, `CANCELLED`, `COMPLETED`, and both package bodies `VALID`.

### 1. Create the tables
SQL Workshop → **SQL Scripts → Create** → name `cashfree_01_tables` → paste all of `01_tables.sql` → Save → **Run** → Run Now.
Verify:
```sql
SELECT table_name FROM user_tables WHERE table_name LIKE 'GCODE_PAYMENT_%_CF';   -- 2 rows
SELECT view_name  FROM user_views  WHERE view_name = 'V_GCODE_PAYMENT_CF_NEEDS_ACTION'; -- 1 row
```

### 2. Insert the config rows
Cashfree is called from the database, so the keys go in `GCODE_APP_SECRETS` (the keys in the frontend
`.env.local` are **not** used). Get the sandbox **App ID** and **Secret Key** from Cashfree dashboard →
(Test mode) → Developers → API Keys. Type them in yourself; don't paste them into chat. In **SQL Commands**:
```sql
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_APP_ID',               '<sandbox app id>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_SECRET_KEY',           '<sandbox secret key>');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_BASE_URL',             'https://sandbox.cashfree.com/pg');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_API_VERSION',          '2025-01-01');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_NOTIFY_URL',           'https://g39bc7cd4ecbbbb-gcdev01.adb.ap-hyderabad-1.oraclecloudapps.com/ords/wksp_gcode2/webhooks/cashfree');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_RETURN_BASE_URL',      'http://localhost:3000');
INSERT INTO GCODE_APP_SECRETS (secret_name, secret_value) VALUES ('CASHFREE_ORDER_EXPIRY_MINUTES', '30');
COMMIT;
```
Verify (shows names only): `SELECT secret_name FROM GCODE_APP_SECRETS WHERE secret_name LIKE 'CASHFREE%' ORDER BY 1;` → **7 rows**.

### 3. Create the package
**SQL Scripts → Create** → `cashfree_02_package` → paste all of `02_gcode_cashfree_payments_api.sql` → Save → Run → Run Now.
Verify (**the key check**):
```sql
SELECT object_type, object_name, status FROM user_objects WHERE object_name = 'GCODE_CASHFREE_PAYMENTS_API';
```
Expect PACKAGE and PACKAGE BODY, both **VALID**. If not:
```sql
SELECT line, position, text FROM user_errors WHERE name = 'GCODE_CASHFREE_PAYMENTS_API' ORDER BY sequence;
```
and send me the output.

### 4. Connection check (read-only, no paid event needed)
`ping` asks Cashfree about an order id that cannot exist, so it creates and changes nothing. In **SQL Commands**:
```sql
DECLARE
  v_status NUMBER; v_result VARCHAR2(1000);
BEGIN
  GCODE_CASHFREE_PAYMENTS_API.ping(v_status, v_result);
  DBMS_OUTPUT.PUT_LINE('HTTP ' || NVL(TO_CHAR(v_status), '-') || ' | ' || v_result);
END;
```
(Do not add `SET SERVEROUTPUT ON`: that is a SQL*Plus command and SQL Commands rejects it with ORA-00922.)
If you only see "Statement processed" with no text, swap the `DBMS_OUTPUT` line for
`RAISE_APPLICATION_ERROR(-20999, 'HTTP ' || NVL(TO_CHAR(v_status), '-') || ' | ' || v_result);`
which always displays the answer (as an error message; it changes nothing).
| Output starts with | Meaning | Do |
|---|---|---|
| `OK:` | Keys accepted, the database can reach Cashfree | Continue |
| `BAD KEYS:` | Cashfree rejected the App ID / Secret Key | Re-check the two config rows (sandbox keys, no spaces) |
| `NO CONFIG:` | A `CASHFREE_*` row is missing | Re-run step 2 |
| `NO NETWORK:` | The database can't reach Cashfree | Send me the full text (outbound/ACL/certificate) |
| `UNEXPECTED …` | Wrong base URL or an unexpected reply | Send me the full line |

(Optional, later: once a paid test event exists you can also call `create_order` directly. The first real
order is created by the app, so it isn't required here.)

### 5. Create the two ORDS routes
Follow `03_ords_endpoints.md`: a verify route on `gcode.participants.v1` and a webhook route on
`gcode.webhooks`. The order route (`:id/cashfree-order`, handler 15150) already exists and needs no change.
Check from a terminal:
```bash
BASE=https://g39bc7cd4ecbbbb-gcdev01.adb.ap-hyderabad-1.oraclecloudapps.com/ords/wksp_gcode2
curl -i -X POST "$BASE/v1/participants/cashfree" -H 'Content-Type: application/json' -d '{"order_id":"nope"}'   # 400 {"error":"Payment order not found."}
curl -i -X POST "$BASE/webhooks/cashfree" -H 'Content-Type: application/json' -d '{}'                            # 401
```
then `SELECT received_on, signature_ok, result_note FROM GCODE_PAYMENT_EVENTS_CF ORDER BY id DESC;` shows the
rejected call with `signature_ok = 'N'`.

### 6. Frontend
Cashfree is the default, so you only need the checkout mode. In
`/home/neuralnerd/projects/Gcode-Events/.env.local` **add**:
```
NEXT_PUBLIC_CASHFREE_MODE=sandbox
```
Restart `npm run dev` (these values are read at start). To go back to Razorpay at any time add
`NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay` and restart.

### 7. Test
Work through the matrix in `04_testing_and_rollout.md`. Minimum before you trust it: rows 1, 3, 5, 8 and 13.

## If something goes wrong
- Send me the exact error text plus the output of:
  `SELECT cf_order_id, status, failure_reason, created_on FROM GCODE_PAYMENT_ORDERS_CF ORDER BY id DESC FETCH FIRST 10 ROWS ONLY;`
  and `SELECT received_on, signature_ok, processed, result_note FROM GCODE_PAYMENT_EVENTS_CF ORDER BY id DESC FETCH FIRST 10 ROWS ONLY;`
- Instant fallback to Razorpay: `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay` + restart.
- Remove everything: `99_rollback.sql`.
