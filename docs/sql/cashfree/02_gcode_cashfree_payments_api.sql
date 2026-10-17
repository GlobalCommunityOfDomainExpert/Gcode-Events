-- Run in WKSP_GCODE2 SQL Workshop AFTER 01_tables.sql and the secrets rows (README.md).
-- Depends only on objects confirmed to exist: GCODE_COUPONS_API, GCODE_EVENT_PARTICIPANTS_API,
-- GCODE_APP_SECRETS, EVENTS, EVENT_STATUS, GCODE_EVENT_PARTICIPANTS, GCODE_USERS, GCODE_PENDING_USERS,
-- and the two new tables GCODE_PAYMENT_ORDERS_CF / GCODE_PAYMENT_EVENTS_CF.
-- Does NOT depend on (or modify) GCODE_PAYMENTS_API, the Razorpay package.
--
-- The package name and create_order's parameter list match what the existing ORDS handler 15150
-- already calls, so that handler needs no change.
--
-- DESIGN NOTES (read before editing)
-- 1. GCODE_EVENT_PARTICIPANTS_API.create_participant COMMITs internally and silently returns the
--    EXISTING participant if the person is already registered. So:
--      * every rule it enforces (capacity, limits, window, email verification, duplicate) is
--        checked here BEFORE payment too - otherwise a customer pays and then gets no ticket;
--      * finalize_order claims an order with a committed compare-and-set (status PROCESSING) so
--        the browser verify and the webhook racing each other can never double-register;
--      * anything that still fails after payment ends as PAID_UNREGISTERED (refund queue), never
--        as a silent loss.
-- 2. Amounts are stored in PAISE (like GCODE_PAYMENT_ORDERS) and converted to rupees only for Cashfree.
--    Cashfree gives the browser no signature. "Paid" is only ever established by asking Cashfree.
-- 3. Webhook body is hashed exactly as received; the webhook never decides "paid" by itself.
--
-- Config/secret rows read from GCODE_APP_SECRETS:
--   CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_BASE_URL, CASHFREE_API_VERSION   (required)
--   CASHFREE_NOTIFY_URL, CASHFREE_RETURN_BASE_URL, CASHFREE_ORDER_EXPIRY_MINUTES    (optional)
--   Environment is chosen per order (p_env, sent by the frontend) and stored in GCODE_PAYMENT_ORDERS_CF.CF_ENV.
--   Per-environment rows: TEST_CASHFREE_<X> and CASHFREE_PROD_<X> for APP_ID, SECRET_KEY, BASE_URL, RETURN_BASE_URL.
--   Shared rows: CASHFREE_API_VERSION, CASHFREE_NOTIFY_URL, CASHFREE_ORDER_EXPIRY_MINUTES.

CREATE OR REPLACE PACKAGE GCODE_CASHFREE_PAYMENTS_API AS

  -- When p_is_free is TRUE a coupon covered the whole price: the participant is already
  -- registered and no Cashfree order exists (p_participant_id is set, the rest are NULL).
  PROCEDURE create_order(
    p_event_id           IN  NUMBER,
    p_email              IN  VARCHAR2 DEFAULT NULL,
    p_full_name          IN  VARCHAR2 DEFAULT NULL,
    p_quantity           IN  NUMBER,
    p_category           IN  VARCHAR2 DEFAULT 'ATTENDEE',
    p_phone              IN  VARCHAR2 DEFAULT NULL,
    p_user_id            IN  NUMBER   DEFAULT NULL,
    p_coupon_code        IN  VARCHAR2 DEFAULT NULL,
    p_env                IN  VARCHAR2 DEFAULT NULL,     -- optional override 'test'|'prod'; NULL = the CF_ENV row
    p_is_free            OUT BOOLEAN,
    p_participant_id     OUT NUMBER,
    p_order_id           OUT VARCHAR2,
    p_payment_session_id OUT VARCHAR2,
    p_amount             OUT NUMBER,
    p_currency           OUT VARCHAR2,
    p_cf_env             OUT VARCHAR2    -- 'TEST'|'PROD' actually used; checkout must run in the same mode
  );

  -- p_status: PAID (p_participant_id set) | PENDING (not paid / still being processed - poll
  -- again) | FAILED (expired, never paid) | PAID_UNREGISTERED (paid but registration failed).
  PROCEDURE verify_order(
    p_order_id       IN  VARCHAR2,
    p_status         OUT VARCHAR2,
    p_participant_id OUT NUMBER
  );

  PROCEDURE process_webhook(
    p_payload         IN CLOB,
    p_signature       IN VARCHAR2,
    p_timestamp       IN VARCHAR2,
    p_idempotency_key IN VARCHAR2 DEFAULT NULL
  );

  -- Read-only connectivity/credentials check. Asks Cashfree about an order id that cannot exist, so it
  -- creates and changes nothing anywhere. p_http_status is Cashfree's HTTP status (NULL if the call
  -- never completed); p_result is a plain-English verdict:
  --   OK ...        keys accepted and the database can reach Cashfree (Cashfree answered "order not found")
  --   BAD KEYS ...  Cashfree rejected CASHFREE_APP_ID / CASHFREE_SECRET_KEY
  --   NO CONFIG ... a required GCODE_APP_SECRETS row is missing
  --   NO NETWORK .. the database could not reach CASHFREE_BASE_URL (outbound/ACL/certificate problem)
  PROCEDURE ping(
    p_http_status OUT NUMBER,
    p_result      OUT VARCHAR2,
    p_env         IN  VARCHAR2 DEFAULT 'TEST'
  );

  -- Housekeeping: flips never-paid orders past their expiry to EXPIRED. Correctness does not
  -- depend on it (capacity holds look at EXPIRES_ON directly); it just keeps reports clean.
  PROCEDURE expire_stale_orders;

END GCODE_CASHFREE_PAYMENTS_API;
/

CREATE OR REPLACE PACKAGE BODY GCODE_CASHFREE_PAYMENTS_API AS

  C_DEFAULT_EXPIRY_MIN CONSTANT PLS_INTEGER := 30;   -- Cashfree minimum is 15
  C_MAX_WEBHOOK_CHARS  CONSTANT PLS_INTEGER := 8000; -- keeps the HMAC input inside VARCHAR2/RAW limits

  ---------------------------------------------------------------------------
  -- Config / secrets
  ---------------------------------------------------------------------------
  -- Environment of the request being served: 'TEST' or 'PROD'. Every entry point (create_order,
  -- verify_order, process_webhook, ping) sets it before any lookup, because pooled ORDS sessions keep
  -- package state between requests.
  g_env VARCHAR2(4) := 'TEST';

  -- Raw single-row lookup; NULL when the row is absent.
  FUNCTION read_row(p_name VARCHAR2) RETURN VARCHAR2 IS
    v_val GCODE_APP_SECRETS.secret_value%TYPE;
  BEGIN
    SELECT secret_value INTO v_val FROM GCODE_APP_SECRETS WHERE secret_name = p_name;
    RETURN v_val;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN RETURN NULL;
  END read_row;

  -- 'PROD'/'PRODUCTION' -> PROD, 'TEST'/'SANDBOX' -> TEST, missing -> PROD (never fall into sandbox
  -- by accident), anything else is rejected.
  FUNCTION norm_env(p_env VARCHAR2) RETURN VARCHAR2 IS
    v VARCHAR2(20) := UPPER(NVL(TRIM(p_env), 'PROD'));
  BEGIN
    IF v IN ('PROD', 'PRODUCTION') THEN RETURN 'PROD'; END IF;
    IF v IN ('TEST', 'SANDBOX')    THEN RETURN 'TEST'; END IF;
    RAISE_APPLICATION_ERROR(-20032, 'Unknown payment environment.');
  END norm_env;

  -- Rows that differ per environment: TEST_CASHFREE_<X> / CASHFREE_PROD_<X>. Everything else
  -- (CASHFREE_API_VERSION, CASHFREE_NOTIFY_URL, CASHFREE_ORDER_EXPIRY_MINUTES) is shared.
  FUNCTION resolve_name(p_name VARCHAR2, p_env VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    IF p_name IN ('CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'CASHFREE_BASE_URL', 'CASHFREE_RETURN_BASE_URL') THEN
      RETURN CASE WHEN p_env = 'PROD'
                  THEN 'CASHFREE_PROD_' || SUBSTR(p_name, LENGTH('CASHFREE_') + 1)
                  ELSE 'TEST_' || p_name END;
    END IF;
    RETURN p_name;
  END resolve_name;

  FUNCTION get_secret_for(p_env VARCHAR2, p_name VARCHAR2) RETURN VARCHAR2 IS
    v_name VARCHAR2(128) := resolve_name(p_name, p_env);
    v_val  GCODE_APP_SECRETS.secret_value%TYPE;
  BEGIN
    SELECT secret_value INTO v_val FROM GCODE_APP_SECRETS WHERE secret_name = v_name;
    RETURN v_val;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20030, 'Missing config row ' || v_name || ' in GCODE_APP_SECRETS.');
  END get_secret_for;

  FUNCTION get_secret(p_name VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN get_secret_for(g_env, p_name);
  END get_secret;

  FUNCTION get_optional(p_name VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    RETURN read_row(resolve_name(p_name, g_env));
  END get_optional;

  FUNCTION expiry_minutes RETURN PLS_INTEGER IS
    v_min PLS_INTEGER;
  BEGIN
    v_min := TO_NUMBER(get_optional('CASHFREE_ORDER_EXPIRY_MINUTES'));
    RETURN LEAST(GREATEST(NVL(v_min, C_DEFAULT_EXPIRY_MIN), 16), 1440);
  EXCEPTION
    WHEN OTHERS THEN RETURN C_DEFAULT_EXPIRY_MIN;
  END expiry_minutes;

  ---------------------------------------------------------------------------
  -- HMAC-SHA256 (hand-rolled on STANDARD_HASH like GCODE_PAYMENTS_API - DBMS_CRYPTO is not
  -- assumed to be granted). Cashfree signs with BASE64, Razorpay with hex.
  ---------------------------------------------------------------------------
  FUNCTION sha256(p_data RAW) RETURN RAW IS
    v_hash RAW(32);
  BEGIN
    SELECT STANDARD_HASH(p_data, 'SHA256') INTO v_hash FROM DUAL;
    RETURN v_hash;
  END sha256;

  FUNCTION hmac_sha256(p_payload VARCHAR2, p_key VARCHAR2) RETURN RAW IS
    C_BLOCK CONSTANT PLS_INTEGER := 64;
    v_key   RAW(2000) := UTL_RAW.CAST_TO_RAW(p_key);
    v_len   PLS_INTEGER;
    v_opad  RAW(64) := HEXTORAW(RPAD('5C', C_BLOCK * 2, '5C'));
    v_ipad  RAW(64) := HEXTORAW(RPAD('36', C_BLOCK * 2, '36'));
    v_inner RAW(32);
  BEGIN
    IF UTL_RAW.LENGTH(v_key) > C_BLOCK THEN
      v_key := sha256(v_key);
    END IF;
    v_len := UTL_RAW.LENGTH(v_key);
    IF v_len < C_BLOCK THEN
      v_key := UTL_RAW.CONCAT(v_key, HEXTORAW(RPAD('00', (C_BLOCK - v_len) * 2, '0')));
    END IF;
    v_inner := sha256(UTL_RAW.CONCAT(UTL_RAW.BIT_XOR(v_key, v_ipad), UTL_RAW.CAST_TO_RAW(p_payload)));
    RETURN sha256(UTL_RAW.CONCAT(UTL_RAW.BIT_XOR(v_key, v_opad), v_inner));
  END hmac_sha256;

  FUNCTION to_base64(p_raw RAW) RETURN VARCHAR2 IS
  BEGIN
    RETURN REPLACE(REPLACE(UTL_RAW.CAST_TO_VARCHAR2(UTL_ENCODE.BASE64_ENCODE(p_raw)), CHR(10), ''), CHR(13), '');
  END to_base64;

  ---------------------------------------------------------------------------
  -- Cashfree HTTP. p_body NULL => no body (GET). Raises on any non-2xx with Cashfree's own
  -- "message"; never includes the keys.
  ---------------------------------------------------------------------------
  FUNCTION cf_call(p_method VARCHAR2, p_path VARCHAR2, p_body CLOB DEFAULT NULL) RETURN CLOB IS
    v_resp CLOB;
    v_msg  VARCHAR2(500);
  BEGIN
    APEX_WEB_SERVICE.g_request_headers.DELETE;
    APEX_WEB_SERVICE.g_request_headers(1).name  := 'x-client-id';
    APEX_WEB_SERVICE.g_request_headers(1).value := get_secret('CASHFREE_APP_ID');
    APEX_WEB_SERVICE.g_request_headers(2).name  := 'x-client-secret';
    APEX_WEB_SERVICE.g_request_headers(2).value := get_secret('CASHFREE_SECRET_KEY');
    APEX_WEB_SERVICE.g_request_headers(3).name  := 'x-api-version';
    APEX_WEB_SERVICE.g_request_headers(3).value := get_secret('CASHFREE_API_VERSION');
    APEX_WEB_SERVICE.g_request_headers(4).name  := 'Content-Type';
    APEX_WEB_SERVICE.g_request_headers(4).value := 'application/json';

    IF p_body IS NULL THEN
      v_resp := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
        p_url => get_secret('CASHFREE_BASE_URL') || p_path, p_http_method => p_method);
    ELSE
      v_resp := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
        p_url => get_secret('CASHFREE_BASE_URL') || p_path, p_http_method => p_method, p_body => p_body);
    END IF;

    IF APEX_WEB_SERVICE.g_status_code NOT BETWEEN 200 AND 299 THEN
      BEGIN
        APEX_JSON.PARSE(v_resp);
        v_msg := APEX_JSON.get_varchar2(p_path => 'message');
      EXCEPTION
        WHEN OTHERS THEN v_msg := NULL;
      END;
      RAISE_APPLICATION_ERROR(-20031,
        'Cashfree ' || p_method || ' ' || p_path || ' failed (HTTP ' ||
        APEX_WEB_SERVICE.g_status_code || '): ' || NVL(v_msg, SUBSTR(v_resp, 1, 300)));
    END IF;

    RETURN v_resp;
  END cf_call;

  ---------------------------------------------------------------------------
  -- Rule helpers (mirror GCODE_EVENT_PARTICIPANTS_API.create_participant so the same rules are
  -- applied BEFORE money is taken)
  ---------------------------------------------------------------------------
  -- Cashfree rejects anything but a 10-digit mobile. "+91 98765 43210" / "098765-43210" are fine:
  -- the last 10 digits are kept.
  FUNCTION normalize_phone(p_phone VARCHAR2) RETURN VARCHAR2 IS
    v_digits VARCHAR2(100) := REGEXP_REPLACE(p_phone, '[^0-9]', '');
  BEGIN
    IF v_digits IS NULL OR LENGTH(v_digits) < 10 THEN
      RAISE_APPLICATION_ERROR(-20010, 'A valid 10-digit phone number is required for payment.');
    END IF;
    RETURN SUBSTR(v_digits, -10);
  END normalize_phone;

  -- Same predicate create_participant uses for "already actively registered".
  FUNCTION find_registration(p_event_id NUMBER, p_user_id NUMBER, p_email VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT MIN(ep.id) INTO v_id
      FROM GCODE_EVENT_PARTICIPANTS ep
      JOIN gcode_users u ON u.user_id = ep.user_id
     WHERE ep.event_id = p_event_id
       AND ep.active = 'Y'
       AND ep.status <> 'CANCELLED'
       AND ((p_user_id IS NOT NULL AND u.user_id = p_user_id)
            OR (p_email IS NOT NULL AND u.email = p_email));
    RETURN v_id;
  END find_registration;

  -- Webhook audit rows must survive the request's own rollback.
  PROCEDURE log_webhook(
    p_order_id VARCHAR2, p_type VARCHAR2, p_idem VARCHAR2, p_sig_ok VARCHAR2,
    p_processed VARCHAR2, p_note VARCHAR2, p_payload CLOB
  ) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    INSERT INTO GCODE_PAYMENT_EVENTS_CF
      (cf_order_id, event_type, cf_event_id, signature_ok, processed, result_note, payload)
    VALUES
      (p_order_id, p_type, p_idem, p_sig_ok, p_processed, SUBSTR(p_note, 1, 1000), p_payload);
    COMMIT;
  END log_webhook;

  PROCEDURE mark_unregistered(p_cf_order_id VARCHAR2, p_reason VARCHAR2) IS
  BEGIN
    UPDATE GCODE_PAYMENT_ORDERS_CF
       SET status = 'PAID_UNREGISTERED',
           failure_reason = SUBSTR(p_reason, 1, 1000),
           updated_on = SYSTIMESTAMP
     WHERE cf_order_id = p_cf_order_id;
    COMMIT;
  END mark_unregistered;

  ---------------------------------------------------------------------------
  -- finalize_order: the ONLY place that turns a paid order into a participant.
  --
  -- create_participant COMMITs internally, so a plain SELECT ... FOR UPDATE lock would be
  -- released mid-way and two callers (browser verify + webhook) could both proceed. Instead the
  -- order is CLAIMED with a committed compare-and-set to PROCESSING. The loser of the race sees
  -- rowcount 0 and just reports the current state. A claim stuck in PROCESSING for 2+ minutes
  -- (crashed worker) can be re-claimed; in that case an already-existing participant is treated
  -- as ours rather than as a duplicate.
  ---------------------------------------------------------------------------
  PROCEDURE finalize_order(
    p_cf_order_id    IN  VARCHAR2,
    p_cf_payment_id  IN  VARCHAR2,
    p_status         OUT VARCHAR2,
    p_participant_id OUT NUMBER
  ) IS
    v_row      GCODE_PAYMENT_ORDERS_CF%ROWTYPE;
    v_reclaim  BOOLEAN := FALSE;
    v_existing NUMBER;
    v_error    VARCHAR2(1000);
  BEGIN
    UPDATE GCODE_PAYMENT_ORDERS_CF
       SET status = 'PROCESSING',
           cf_payment_id = NVL(p_cf_payment_id, cf_payment_id),
           updated_on = SYSTIMESTAMP
     WHERE cf_order_id = p_cf_order_id
       AND status IN ('CREATED', 'FAILED', 'EXPIRED');

    IF SQL%ROWCOUNT = 0 THEN
      UPDATE GCODE_PAYMENT_ORDERS_CF
         SET updated_on = SYSTIMESTAMP
       WHERE cf_order_id = p_cf_order_id
         AND status = 'PROCESSING'
         AND updated_on < SYSTIMESTAMP - INTERVAL '2' MINUTE;

      IF SQL%ROWCOUNT = 1 THEN
        v_reclaim := TRUE;
      ELSE
        SELECT status, participant_id INTO p_status, p_participant_id
          FROM GCODE_PAYMENT_ORDERS_CF WHERE cf_order_id = p_cf_order_id;
        -- Someone else is mid-flight on it: tell the caller to poll again.
        IF p_status = 'PROCESSING' THEN p_status := 'PENDING'; END IF;
        RETURN;
      END IF;
    END IF;
    COMMIT; -- publish the claim

    SELECT * INTO v_row FROM GCODE_PAYMENT_ORDERS_CF WHERE cf_order_id = p_cf_order_id;

    -- A fresh claim for a person who is ALREADY registered means they registered some other way
    -- (free link, UPI confirmation, second order) after this order was created. create_participant
    -- would silently hand back that other participant, so refuse to pretend this payment bought it.
    IF NOT v_reclaim THEN
      v_existing := find_registration(v_row.event_id, v_row.user_id, v_row.email);
      IF v_existing IS NOT NULL THEN
        mark_unregistered(p_cf_order_id, 'ALREADY_REGISTERED: participant ' || v_existing || ' exists. Refund this payment.');
        p_status := 'PAID_UNREGISTERED';
        RETURN;
      END IF;
    END IF;

    BEGIN
      GCODE_EVENT_PARTICIPANTS_API.create_participant(
        p_event_id                => v_row.event_id,
        p_email                   => v_row.email,
        p_full_name               => v_row.full_name,
        p_quantity                => v_row.quantity,
        p_status                  => 'CONFIRMED',
        p_active                  => 'Y',
        p_category                => v_row.category,
        p_phone                   => v_row.phone,
        p_user_id                 => v_row.user_id,
        -- Payment is already taken, so late-window and unverified-email cases still register.
        -- Both were enforced at order creation; capacity/limits are re-enforced here by
        -- create_participant itself and surface as PAID_UNREGISTERED if they fail.
        p_skip_window_check       => 'Y',
        p_skip_email_verification => 'Y',
        p_id                      => p_participant_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_error := SQLERRM;
        ROLLBACK; -- discard anything create_participant left uncommitted
        mark_unregistered(p_cf_order_id, 'REGISTRATION_FAILED: ' || v_error);
        p_status := 'PAID_UNREGISTERED';
        p_participant_id := NULL;
        RETURN;
    END;

    UPDATE GCODE_PAYMENT_ORDERS_CF
       SET status = 'PAID',
           participant_id = p_participant_id,
           paid_on = SYSTIMESTAMP,
           updated_on = SYSTIMESTAMP
     WHERE cf_order_id = p_cf_order_id;
    COMMIT;

    -- Coupon bookkeeping is best-effort and never undoes a successful registration. Two people
    -- racing for the very last redemption can both pay; refusing a customer who already paid is
    -- the worse failure, so that over-redemption is accepted.
    IF v_row.coupon_id IS NOT NULL THEN
      BEGIN
        GCODE_COUPONS_API.record_paid_redemption(
          p_coupon_id => v_row.coupon_id,
          p_email     => v_row.email,
          p_order_id  => p_cf_order_id
        );
        COMMIT;
      EXCEPTION
        WHEN OTHERS THEN ROLLBACK;
      END;
    END IF;

    p_status := 'PAID';
  END finalize_order;

  ---------------------------------------------------------------------------
  -- create_order
  ---------------------------------------------------------------------------
  PROCEDURE create_order(
    p_event_id           IN  NUMBER,
    p_email              IN  VARCHAR2 DEFAULT NULL,
    p_full_name          IN  VARCHAR2 DEFAULT NULL,
    p_quantity           IN  NUMBER,
    p_category           IN  VARCHAR2 DEFAULT 'ATTENDEE',
    p_phone              IN  VARCHAR2 DEFAULT NULL,
    p_user_id            IN  NUMBER   DEFAULT NULL,
    p_coupon_code        IN  VARCHAR2 DEFAULT NULL,
    p_env                IN  VARCHAR2 DEFAULT NULL,
    p_is_free            OUT BOOLEAN,
    p_participant_id     OUT NUMBER,
    p_order_id           OUT VARCHAR2,
    p_payment_session_id OUT VARCHAR2,
    p_amount             OUT NUMBER,
    p_currency           OUT VARCHAR2,
    p_cf_env             OUT VARCHAR2    -- 'TEST'|'PROD' actually used; checkout must run in the same mode
  ) IS
    v_category          VARCHAR2(20) := NVL(UPPER(p_category), 'ATTENDEE');
    v_email             gcode_users.email%TYPE     := TRIM(p_email);
    v_full_name         gcode_users.full_name%TYPE := TRIM(p_full_name);
    v_phone_raw         VARCHAR2(100)              := p_phone;
    v_phone             VARCHAR2(20);
    v_user_phone        gcode_users.phone%TYPE;

    v_ticket_price      EVENTS.ticket_price%TYPE;
    v_participant_price EVENTS.participant_price%TYPE;
    v_max_attendees     EVENTS.max_attendees%TYPE;
    v_max_per_reg       EVENTS.max_tickets_per_registration%TYPE;
    v_part_capacity     EVENTS.participant_capacity%TYPE;
    v_part_max_per_reg  EVENTS.participant_max_tickets_per_registration%TYPE;
    v_reg_start         EVENTS.registration_start%TYPE;
    v_reg_deadline      EVENTS.registration_deadline%TYPE;
    v_part_reg_start    EVENTS.participant_registration_start%TYPE;
    v_part_reg_deadline EVENTS.participant_registration_deadline%TYPE;
    v_status_id         EVENTS.status_id%TYPE;
    v_status_code       EVENT_STATUS.status_code%TYPE;
    v_attendee_enabled  EVENTS.attendee_registration_enabled%TYPE;
    v_part_enabled      EVENTS.participant_registration_enabled%TYPE;
    v_is_external       EVENTS.is_external%TYPE;

    v_price             NUMBER;
    v_eff_start         EVENTS.registration_start%TYPE;
    v_eff_deadline      EVENTS.registration_deadline%TYPE;
    v_eff_max_per_reg   NUMBER;
    v_capacity          NUMBER;
    v_booked            NUMBER := 0;
    v_held              NUMBER := 0;
    v_verified          NUMBER;
    v_user_exists       NUMBER;

    v_original_amount   NUMBER;
    v_amount            NUMBER;
    v_coupon_id         NUMBER;
    v_discount_type     VARCHAR2(10);
    v_discount_value    NUMBER;
    v_c_original        NUMBER;
    v_c_final           NUMBER;
    v_coupon_error      VARCHAR2(30);

    v_cf_order_id       VARCHAR2(64);
    v_customer_id       VARCHAR2(64);
    v_return_base       VARCHAR2(500);
    v_notify_url        VARCHAR2(500);
    v_return_url        VARCHAR2(600);
    v_expires_on        TIMESTAMP WITH TIME ZONE;
    v_expiry_iso        VARCHAR2(40);
    v_body              CLOB;
    v_meta              VARCHAR2(1000);
    v_resp              CLOB;
  BEGIN
    p_is_free := FALSE;
    -- Explicit override (localhost) wins; otherwise the CF_ENV row in GCODE_APP_SECRETS decides.
    g_env    := norm_env(NVL(p_env, read_row('CF_ENV')));
    p_cf_env := g_env;

    -- ---- Basic input ---------------------------------------------------
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity <> TRUNC(p_quantity) THEN
      RAISE_APPLICATION_ERROR(-20001, 'Quantity must be a whole number of at least 1.');
    END IF;
    IF v_category NOT IN ('ATTENDEE', 'PARTICIPANT') THEN
      RAISE_APPLICATION_ERROR(-20001, 'Unknown registration category.');
    END IF;

    -- ---- Identity ------------------------------------------------------
    -- Signed-in: name/email come from the account. The phone typed on the registration form wins
    -- over the stored one (platform onboarding does not collect a phone).
    IF p_user_id IS NOT NULL THEN
      BEGIN
        SELECT email, full_name, phone INTO v_email, v_full_name, v_user_phone
          FROM gcode_users WHERE user_id = p_user_id;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-20012, 'Account not found.');
      END;
      v_phone_raw := NVL(p_phone, v_user_phone);
    ELSIF v_email IS NULL OR v_full_name IS NULL THEN
      RAISE_APPLICATION_ERROR(-20012, 'Name and email are required.');
    END IF;

    -- ---- Event + rules (same ones create_participant enforces, checked up front) ----
    BEGIN
      SELECT ticket_price, participant_price, max_attendees, max_tickets_per_registration,
             participant_capacity, participant_max_tickets_per_registration,
             registration_start, registration_deadline,
             participant_registration_start, participant_registration_deadline, status_id,
             attendee_registration_enabled, participant_registration_enabled, is_external
        INTO v_ticket_price, v_participant_price, v_max_attendees, v_max_per_reg,
             v_part_capacity, v_part_max_per_reg,
             v_reg_start, v_reg_deadline,
             v_part_reg_start, v_part_reg_deadline, v_status_id,
             v_attendee_enabled, v_part_enabled, v_is_external
        FROM EVENTS WHERE id = p_event_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20040, 'Event not found.');
    END;

    -- Event status. create_participant has no status check at all, so a cancelled or finished
    -- event would otherwise happily take payments.
    BEGIN
      SELECT status_code INTO v_status_code FROM EVENT_STATUS WHERE id = v_status_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN v_status_code := NULL;
    END;
    IF v_status_code IN ('DRAFT', 'APPROVAL_PENDING', 'REGISTRATION_CLOSED', 'COMPLETED', 'CANCELLED') THEN
      RAISE_APPLICATION_ERROR(-20040, 'Registration is not open for this event.');
    END IF;

    -- Organizers can switch each pass type off, and external events are registered elsewhere.
    -- create_participant checks neither, so without this a switched-off pass could still take payment.
    IF v_is_external = 1 THEN
      RAISE_APPLICATION_ERROR(-20040, 'This event is registered on an external site.');
    END IF;
    IF (v_category = 'PARTICIPANT' AND v_part_enabled = 0)
       OR (v_category = 'ATTENDEE' AND v_attendee_enabled = 0) THEN
      RAISE_APPLICATION_ERROR(-20040, 'Registration for this pass type is not open.');
    END IF;

    v_price := CASE WHEN v_category = 'PARTICIPANT' THEN v_participant_price ELSE v_ticket_price END;
    IF v_price IS NULL OR v_price <= 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Event is free - no payment order needed.');
    END IF;

    v_eff_max_per_reg := CASE WHEN v_category = 'PARTICIPANT' THEN v_part_max_per_reg ELSE v_max_per_reg END;
    IF v_eff_max_per_reg IS NOT NULL AND p_quantity > v_eff_max_per_reg THEN
      RAISE_APPLICATION_ERROR(-20001,
        'Maximum ' || v_eff_max_per_reg || ' ticket(s) allowed per registration.');
    END IF;

    -- Registration window, for everyone (create_participant itself only gates guests, but the
    -- registration UI already blocks everyone outside the window, so this just makes it real).
    v_eff_start    := CASE WHEN v_category = 'PARTICIPANT' THEN v_part_reg_start    ELSE v_reg_start    END;
    v_eff_deadline := CASE WHEN v_category = 'PARTICIPANT' THEN v_part_reg_deadline ELSE v_reg_deadline END;
    IF v_eff_start IS NOT NULL AND SYSTIMESTAMP < v_eff_start THEN
      RAISE_APPLICATION_ERROR(-20004, 'Registration has not opened yet.');
    END IF;
    IF v_eff_deadline IS NOT NULL AND SYSTIMESTAMP > v_eff_deadline THEN
      RAISE_APPLICATION_ERROR(-20004, 'Registration is closed.');
    END IF;

    -- Already registered: create_participant would silently return the existing row after the
    -- customer had paid, so stop it here, before any money moves.
    IF find_registration(p_event_id, p_user_id, v_email) IS NOT NULL THEN
      RAISE_APPLICATION_ERROR(-20041, 'You are already registered for this event.');
    END IF;

    -- Guests need a verified email (OTP) unless an account with that email already exists.
    IF p_user_id IS NULL THEN
      SELECT COUNT(*) INTO v_user_exists FROM gcode_users WHERE email = v_email;
      IF v_user_exists = 0 THEN
        SELECT COUNT(*) INTO v_verified
          FROM gcode_pending_users WHERE email = v_email AND is_verified = 'Y';
        IF v_verified = 0 THEN
          RAISE_APPLICATION_ERROR(-20003, 'Email not verified. Please verify your email before registering.');
        END IF;
      END IF;
    END IF;

    -- Capacity = confirmed bookings + other people's open (unexpired) orders, so two buyers
    -- cannot both be told the last seat is theirs. Same SUM create_participant uses for "booked".
    v_capacity := CASE WHEN v_category = 'PARTICIPANT' THEN v_part_capacity ELSE v_max_attendees END;
    IF v_capacity IS NOT NULL THEN
      SELECT NVL(SUM(quantity), 0) INTO v_booked
        FROM GCODE_EVENT_PARTICIPANTS
       WHERE event_id = p_event_id AND active = 'Y' AND category = v_category;

      SELECT NVL(SUM(quantity), 0) INTO v_held
        FROM GCODE_PAYMENT_ORDERS_CF
       WHERE event_id = p_event_id AND category = v_category
         AND status IN ('CREATED', 'PROCESSING')
         AND expires_on > SYSTIMESTAMP
         AND LOWER(email) <> LOWER(v_email);

      IF v_booked + v_held + p_quantity > v_capacity THEN
        RAISE_APPLICATION_ERROR(-20001,
          'Only ' || GREATEST(v_capacity - v_booked - v_held, 0) || ' ticket(s) left for this event.');
      END IF;
    END IF;

    -- ---- Price + coupon (always server-side) ---------------------------
    v_original_amount := ROUND(v_price * p_quantity, 2);
    v_amount          := v_original_amount;

    IF TRIM(p_coupon_code) IS NOT NULL THEN
      GCODE_COUPONS_API.validate_coupon(
        p_event_id        => p_event_id,
        p_code            => TRIM(p_coupon_code),
        p_email           => v_email,
        p_category        => v_category,
        p_quantity        => p_quantity,
        p_user_id         => p_user_id,
        p_coupon_id       => v_coupon_id,
        p_discount_type   => v_discount_type,
        p_discount_value  => v_discount_value,
        p_original_amount => v_c_original,
        p_final_amount    => v_c_final,
        p_error_code      => v_coupon_error
      );
      IF v_coupon_error IS NOT NULL THEN
        RAISE_APPLICATION_ERROR(-20002, 'Invalid coupon: ' || v_coupon_error);
      END IF;

      IF v_c_final <= 0 THEN
        -- Coupon covers everything: register directly, no gateway involved.
        GCODE_COUPONS_API.redeem_free_coupon(
          p_coupon_id      => v_coupon_id,
          p_event_id       => p_event_id,
          p_email          => v_email,
          p_full_name      => v_full_name,
          p_quantity       => p_quantity,
          p_category       => v_category,
          p_phone          => v_phone_raw,
          p_user_id        => p_user_id,
          p_participant_id => p_participant_id
        );
        p_is_free := TRUE;
        RETURN;
      END IF;

      v_amount := ROUND(v_c_final, 2);
    END IF;

    -- ---- Cashfree-specific requirements --------------------------------
    v_phone := normalize_phone(v_phone_raw);
    IF v_amount < 1 THEN
      RAISE_APPLICATION_ERROR(-20011, 'Cashfree minimum order amount is 1.00 INR.');
    END IF;

    -- ---- Reuse an identical still-open order (double click, page refresh) ----
    BEGIN
      SELECT cf_order_id, payment_session_id
        INTO p_order_id, p_payment_session_id
        FROM GCODE_PAYMENT_ORDERS_CF
       WHERE event_id = p_event_id
         AND LOWER(email) = LOWER(v_email)
         AND category = v_category
         AND quantity = p_quantity
         AND amount = ROUND(v_amount * 100)
         AND NVL(coupon_id, -1) = NVL(v_coupon_id, -1)
         AND status = 'CREATED'
         AND cf_env = g_env
         AND expires_on > SYSTIMESTAMP + INTERVAL '5' MINUTE
         AND payment_session_id IS NOT NULL
       ORDER BY created_on DESC
       FETCH FIRST 1 ROW ONLY;

      p_amount   := v_amount;
      p_currency := 'INR';
      RETURN;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;
    END;

    -- ---- Create the order at Cashfree ----------------------------------
    -- Cashfree order_id: letters/digits/_/- only, 3-45 chars.
    v_cf_order_id := 'GC' || p_event_id || '_' || LOWER(SUBSTR(RAWTOHEX(SYS_GUID()), 1, 20));

    v_customer_id := CASE
      -- USER_ID can be 38 digits; plain TO_CHAR would fall back to scientific notation.
      WHEN p_user_id IS NOT NULL THEN 'u' || TO_CHAR(p_user_id, 'FM99999999999999999999999999999999999999')
      ELSE 'g' || SUBSTR(LOWER(RAWTOHEX(sha256(UTL_RAW.CAST_TO_RAW(LOWER(v_email))))), 1, 32)
    END;

    v_notify_url  := get_optional('CASHFREE_NOTIFY_URL');
    v_return_base := get_optional('CASHFREE_RETURN_BASE_URL');
    IF v_return_base IS NOT NULL THEN
      -- {order_id} is substituted by Cashfree on redirect. Cashfree allows 250 chars max.
      v_return_url := RTRIM(v_return_base, '/') || '/events/' || p_event_id ||
                      '/register?cf_order_id={order_id}';
    END IF;

    v_expires_on := SYSTIMESTAMP + NUMTODSINTERVAL(expiry_minutes, 'MINUTE');
    -- SQL-only function, so it goes through a SELECT (same reason as sha256 above).
    SELECT TO_CHAR(SYS_EXTRACT_UTC(v_expires_on), 'YYYY-MM-DD"T"HH24:MI:SS') || '+00:00'
      INTO v_expiry_iso FROM DUAL;

    -- Built by hand with APEX_JSON.stringify (escapes quotes/unicode correctly). JSON_OBJECT ...
    -- RETURNING CLOB is rejected inside PL/SQL (PLS-00684), and the number is formatted explicitly so
    -- a session NLS setting can never turn 10.50 into 10,50.
    IF v_return_url IS NOT NULL THEN
      v_meta := '"return_url":' || APEX_JSON.stringify(v_return_url);
    END IF;
    IF v_notify_url IS NOT NULL THEN
      v_meta := v_meta || CASE WHEN v_meta IS NOT NULL THEN ',' END
                       || '"notify_url":' || APEX_JSON.stringify(v_notify_url);
    END IF;

    v_body := '{'
      || '"order_id":'          || APEX_JSON.stringify(v_cf_order_id)
      || ',"order_amount":'     || TO_CHAR(v_amount, 'FM9999999990.00', 'NLS_NUMERIC_CHARACTERS=''.,''')
      || ',"order_currency":"INR"'
      || ',"order_expiry_time":' || APEX_JSON.stringify(v_expiry_iso)
      || ',"order_note":'       || APEX_JSON.stringify(SUBSTR('GCODE event ' || p_event_id, 1, 200))
      || ',"customer_details":{'
      ||   '"customer_id":'     || APEX_JSON.stringify(v_customer_id)
      ||   CASE WHEN LENGTH(v_full_name) >= 3
                THEN ',"customer_name":' || APEX_JSON.stringify(SUBSTR(v_full_name, 1, 100)) END
      ||   ',"customer_email":' || APEX_JSON.stringify(SUBSTR(v_email, 1, 100))
      ||   ',"customer_phone":' || APEX_JSON.stringify(v_phone)
      || '}'
      || CASE WHEN v_meta IS NOT NULL THEN ',"order_meta":{' || v_meta || '}' END
      || '}';

    v_resp := cf_call('POST', '/orders', v_body);

    APEX_JSON.PARSE(v_resp);
    p_payment_session_id := APEX_JSON.get_varchar2(p_path => 'payment_session_id');
    IF p_payment_session_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20031, 'Cashfree order creation returned no payment session.');
    END IF;

    -- Written only after Cashfree accepted the order (the ORDS handler swallows exceptions and
    -- still completes normally, so a row inserted first would be left behind on a failed call).
    INSERT INTO GCODE_PAYMENT_ORDERS_CF (
      event_id, cf_order_id, payment_session_id, user_id, quantity, original_amount, amount,
      currency, status, email, full_name, phone, category, coupon_id, expires_on, cf_env
    ) VALUES (
      p_event_id, v_cf_order_id, p_payment_session_id, p_user_id, p_quantity,
      ROUND(v_original_amount * 100), ROUND(v_amount * 100),
      'INR', 'CREATED', v_email, v_full_name, v_phone, v_category, v_coupon_id, v_expires_on, g_env
    );
    COMMIT;

    p_order_id := v_cf_order_id;
    p_amount   := v_amount;
    p_currency := 'INR';
  END create_order;

  ---------------------------------------------------------------------------
  -- verify_order
  ---------------------------------------------------------------------------
  PROCEDURE verify_order(
    p_order_id       IN  VARCHAR2,
    p_status         OUT VARCHAR2,
    p_participant_id OUT NUMBER
  ) IS
    v_row        GCODE_PAYMENT_ORDERS_CF%ROWTYPE;
    v_resp       CLOB;
    v_cf_status  VARCHAR2(30);
    v_cf_amount  NUMBER;
    v_payment_id VARCHAR2(64);
    v_count      PLS_INTEGER;
  BEGIN
    BEGIN
      SELECT * INTO v_row FROM GCODE_PAYMENT_ORDERS_CF WHERE cf_order_id = p_order_id;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20001, 'Payment order not found.');
    END;

    -- The order was created in one environment; it is always checked with that one's keys.
    g_env := v_row.cf_env;

    -- Terminal states we already know: no need to bother Cashfree.
    IF v_row.status IN ('PAID', 'PAID_UNREGISTERED') THEN
      p_status := v_row.status;
      p_participant_id := v_row.participant_id;
      RETURN;
    END IF;

    -- Cashfree is the only source of truth for "was it paid".
    v_resp := cf_call('GET', '/orders/' || p_order_id);
    APEX_JSON.PARSE(v_resp);
    v_cf_status := APEX_JSON.get_varchar2(p_path => 'order_status');
    v_cf_amount := APEX_JSON.get_number(p_path => 'order_amount');

    IF v_cf_status = 'PAID' THEN
      IF v_cf_amount IS NULL OR ROUND(v_cf_amount * 100) <> v_row.amount THEN
        mark_unregistered(p_order_id, 'AMOUNT_MISMATCH: expected ' || (v_row.amount / 100) || ' INR, Cashfree reports ' || v_cf_amount || ' INR');
        p_status := 'PAID_UNREGISTERED';
        RETURN;
      END IF;

      -- Best effort: record the successful payment's id for reconciliation.
      BEGIN
        v_resp := cf_call('GET', '/orders/' || p_order_id || '/payments');
        APEX_JSON.PARSE(v_resp);
        v_count := NVL(APEX_JSON.get_count(p_path => '.'), 0);
        FOR i IN 1 .. v_count LOOP
          IF APEX_JSON.get_varchar2(p_path => '[%d].payment_status', p0 => i) = 'SUCCESS' THEN
            v_payment_id := APEX_JSON.get_varchar2(p_path => '[%d].cf_payment_id', p0 => i);
            EXIT;
          END IF;
        END LOOP;
      EXCEPTION
        WHEN OTHERS THEN v_payment_id := NULL;
      END;

      finalize_order(p_order_id, v_payment_id, p_status, p_participant_id);

    ELSIF v_cf_status IN ('EXPIRED', 'TERMINATED', 'TERMINATION_REQUESTED') THEN
      UPDATE GCODE_PAYMENT_ORDERS_CF
         SET status = 'EXPIRED', updated_on = SYSTIMESTAMP
       WHERE cf_order_id = p_order_id AND status = 'CREATED';
      COMMIT;
      p_status := 'FAILED';

    ELSE
      -- ACTIVE: no successful payment yet. A failed attempt can be retried on the same order
      -- until it expires, so this is PENDING rather than FAILED.
      p_status := 'PENDING';
    END IF;
  END verify_order;

  ---------------------------------------------------------------------------
  -- process_webhook
  ---------------------------------------------------------------------------
  PROCEDURE process_webhook(
    p_payload         IN CLOB,
    p_signature       IN VARCHAR2,
    p_timestamp       IN VARCHAR2,
    p_idempotency_key IN VARCHAR2 DEFAULT NULL
  ) IS
    v_body           VARCHAR2(8000);
    v_expected       VARCHAR2(200);
    v_order_id       VARCHAR2(64);
    v_type           VARCHAR2(60);
    v_exists         NUMBER;
    v_status         VARCHAR2(30);
    v_participant_id NUMBER;
  BEGIN
    IF p_payload IS NULL OR DBMS_LOB.GETLENGTH(p_payload) > C_MAX_WEBHOOK_CHARS THEN
      log_webhook(NULL, NULL, p_idempotency_key, 'N', 'N', 'Empty or oversized payload', NULL);
      RAISE_APPLICATION_ERROR(-20020, 'Webhook payload rejected.');
    END IF;
    v_body := DBMS_LOB.SUBSTR(p_payload, C_MAX_WEBHOOK_CHARS, 1);

    -- base64(HMAC-SHA256(timestamp || rawBody, secretKey)). The body must be hashed exactly as
    -- received - never re-serialised.
    IF p_signature IS NULL OR p_timestamp IS NULL THEN
      log_webhook(NULL, NULL, p_idempotency_key, 'N', 'N', 'Missing signature/timestamp header', p_payload);
      RAISE_APPLICATION_ERROR(-20020, 'Webhook signature verification failed.');
    END IF;

    -- Test and live orders share this URL, so try each environment's secret. Whichever matches only
    -- proves the call came from Cashfree; verify_order below still re-reads the order itself.
    FOR e IN (SELECT 'PROD' AS env FROM DUAL UNION ALL SELECT 'TEST' FROM DUAL) LOOP
      v_expected := NULL;
      BEGIN
        v_expected := to_base64(hmac_sha256(p_timestamp || v_body, get_secret_for(e.env, 'CASHFREE_SECRET_KEY')));
      EXCEPTION
        WHEN OTHERS THEN NULL; -- that environment has no secret configured
      END;
      EXIT WHEN v_expected = p_signature;
      v_expected := NULL;
    END LOOP;
    IF v_expected IS NULL THEN
      log_webhook(NULL, NULL, p_idempotency_key, 'N', 'N', 'Signature mismatch', p_payload);
      RAISE_APPLICATION_ERROR(-20020, 'Webhook signature verification failed.');
    END IF;

    APEX_JSON.PARSE(v_body);
    v_type     := APEX_JSON.get_varchar2(p_path => 'type');
    v_order_id := APEX_JSON.get_varchar2(p_path => 'data.order.order_id');

    SELECT COUNT(*) INTO v_exists FROM GCODE_PAYMENT_ORDERS_CF WHERE cf_order_id = v_order_id;
    IF v_exists = 0 THEN
      -- e.g. the dashboard's "Test" button sends a dummy order. Acknowledge (2xx) so it isn't retried.
      log_webhook(v_order_id, v_type, p_idempotency_key, 'Y', 'N', 'Unknown order id - ignored', p_payload);
      RETURN;
    END IF;

    -- The webhook never decides "paid" by itself: verify_order re-reads the order from Cashfree.
    BEGIN
      verify_order(v_order_id, v_status, v_participant_id);
      log_webhook(v_order_id, v_type, p_idempotency_key, 'Y', 'Y', 'status=' || v_status, p_payload);
    EXCEPTION
      WHEN OTHERS THEN
        log_webhook(v_order_id, v_type, p_idempotency_key, 'Y', 'N', SQLERRM, p_payload);
        RAISE; -- non-2xx so Cashfree retries
    END;
  END process_webhook;

  ---------------------------------------------------------------------------
  -- ping: read-only credentials + connectivity check (see the spec for the verdicts).
  ---------------------------------------------------------------------------
  PROCEDURE ping(
    p_http_status OUT NUMBER,
    p_result      OUT VARCHAR2,
    p_env         IN  VARCHAR2 DEFAULT 'TEST'
  ) IS
    C_PROBE CONSTANT VARCHAR2(40) := 'GC_PING_ORDER_THAT_DOES_NOT_EXIST';
    v_base  VARCHAR2(500);
    v_resp  CLOB;
    v_code  VARCHAR2(100);
    v_msg   VARCHAR2(300);
  BEGIN
    p_http_status := NULL;
    g_env := norm_env(p_env);

    -- Reads every required row first so a missing one gets a precise message.
    BEGIN
      v_base := get_secret('CASHFREE_BASE_URL');
      APEX_WEB_SERVICE.g_request_headers.DELETE;
      APEX_WEB_SERVICE.g_request_headers(1).name  := 'x-client-id';
      APEX_WEB_SERVICE.g_request_headers(1).value := get_secret('CASHFREE_APP_ID');
      APEX_WEB_SERVICE.g_request_headers(2).name  := 'x-client-secret';
      APEX_WEB_SERVICE.g_request_headers(2).value := get_secret('CASHFREE_SECRET_KEY');
      APEX_WEB_SERVICE.g_request_headers(3).name  := 'x-api-version';
      APEX_WEB_SERVICE.g_request_headers(3).value := get_secret('CASHFREE_API_VERSION');
      APEX_WEB_SERVICE.g_request_headers(4).name  := 'Content-Type';
      APEX_WEB_SERVICE.g_request_headers(4).value := 'application/json';
    EXCEPTION
      WHEN OTHERS THEN
        p_result := 'NO CONFIG: ' || SQLERRM;
        RETURN;
    END;

    BEGIN
      v_resp := APEX_WEB_SERVICE.MAKE_REST_REQUEST(
        p_url         => v_base || '/orders/' || C_PROBE,
        p_http_method => 'GET'
      );
    EXCEPTION
      WHEN OTHERS THEN
        p_result := 'NO NETWORK: could not reach ' || v_base || ' - ' || SUBSTR(SQLERRM, 1, 250);
        RETURN;
    END;

    p_http_status := APEX_WEB_SERVICE.g_status_code;
    BEGIN
      APEX_JSON.PARSE(v_resp);
      v_code := APEX_JSON.get_varchar2(p_path => 'code');
      v_msg  := SUBSTR(APEX_JSON.get_varchar2(p_path => 'message'), 1, 200);
    EXCEPTION
      WHEN OTHERS THEN v_code := NULL; v_msg := SUBSTR(v_resp, 1, 200);
    END;

    p_result := CASE
      WHEN p_http_status = 404 AND v_code = 'order_not_found' THEN
        'OK: Cashfree reached at ' || v_base || ' and the keys were accepted (order not found, as expected).'
      WHEN p_http_status IN (401, 403) THEN
        'BAD KEYS: Cashfree rejected the credentials (HTTP ' || p_http_status || '). ' || v_msg
      WHEN p_http_status = 404 THEN
        'UNEXPECTED 404 (code=' || NVL(v_code, 'none') || '): check CASHFREE_BASE_URL (' || v_base || '). ' || v_msg
      ELSE
        'UNEXPECTED HTTP ' || p_http_status || ' (code=' || NVL(v_code, 'none') || '): ' || v_msg
    END;
  END ping;

  ---------------------------------------------------------------------------
  PROCEDURE expire_stale_orders IS
  BEGIN
    UPDATE GCODE_PAYMENT_ORDERS_CF
       SET status = 'EXPIRED', updated_on = SYSTIMESTAMP
     WHERE status = 'CREATED'
       AND expires_on < SYSTIMESTAMP - INTERVAL '5' MINUTE;
    COMMIT;
  END expire_stale_orders;

END GCODE_CASHFREE_PAYMENTS_API;
/
