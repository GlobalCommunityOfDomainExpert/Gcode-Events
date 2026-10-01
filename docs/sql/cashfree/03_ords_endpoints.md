# ORDS routes for Cashfree

Create these **after** `01_tables.sql` and `02_gcode_cashfree_payments_api.sql` compile cleanly.
All are **Source Type: PL/SQL** (not Collection Query - see HANDOVER.md gotcha #3). Create them in
SQL Workshop → RESTful Services. Nothing here edits an existing Razorpay route.

## 1. `POST /v1/events/:id/cashfree-order` — already exists (handler 15150): leave it alone

Its source already calls `GCODE_CASHFREE_PAYMENTS_API.create_order` with exactly the argument names
the package now has. It only failed because the package didn't exist.

Request body (what the frontend sends): `quantity`, `category`, `coupon_code`, `phone`, and either
`user_id` **or** `email` + `full_name`.
Response: `{order_id, payment_session_id, amount, currency}` or `{free:true, participant_id}`.
Errors come back as `{error: "..."}` with HTTP 400 and a user-readable message (already registered,
event full, registration closed, invalid coupon, invalid phone, ...).

## 2. `POST /v1/participants/cashfree` — NEW (verify after checkout)

Module `gcode.participants.v1` → new template `cashfree` → method `POST`:

```sql
DECLARE
  v_status         VARCHAR2(30);
  v_participant_id NUMBER;
BEGIN
  GCODE_CASHFREE_PAYMENTS_API.verify_order(
    p_order_id       => :order_id,
    p_status         => v_status,
    p_participant_id => v_participant_id
  );
  APEX_JSON.open_object;
  APEX_JSON.write('status', v_status);
  APEX_JSON.write('participant_id', v_participant_id);
  APEX_JSON.close_object;
  :status_code := 200;
EXCEPTION
  WHEN OTHERS THEN
    APEX_JSON.open_object;
    APEX_JSON.write('error', SQLERRM);
    APEX_JSON.close_object;
    :status_code := 400;
END;
```

Body: `{ "order_id": "GC12_ab12..." }`. Public, like the Razorpay verify route, and safe to be: it cannot
create a participant unless **Cashfree itself** reports the order PAID for the exact stored amount,
and order ids are unguessable.

## 3. `POST /webhooks/cashfree` — NEW

Module `gcode.webhooks` (the module the Razorpay webhook lives in) → new template `cashfree` →
method `POST`:

```sql
BEGIN
  GCODE_CASHFREE_PAYMENTS_API.process_webhook(
    p_payload         => :body_text,
    p_signature       => OWA_UTIL.get_cgi_env('HTTP_X_WEBHOOK_SIGNATURE'),
    p_timestamp       => OWA_UTIL.get_cgi_env('HTTP_X_WEBHOOK_TIMESTAMP'),
    p_idempotency_key => OWA_UTIL.get_cgi_env('HTTP_X_IDEMPOTENCY_KEY')
  );
  :status_code := 200;
EXCEPTION
  WHEN OTHERS THEN
    -- 401 for a bad signature, 500 for anything else so Cashfree retries.
    :status_code := CASE WHEN SQLCODE = -20020 THEN 401 ELSE 500 END;
END;
```

Deliberately different from the Razorpay webhook handler: two signature headers (Cashfree signs
timestamp + body); a bad signature is `401` and a transient failure is `500` (retried) instead of a
blanket `400`; every delivery is written to `GCODE_PAYMENT_EVENTS_CF`.

`:status_code` is the same implicit bind the existing order handler (14381) uses, so no entry is needed in the Parameters grid.

Full URL (this is the value for the `CASHFREE_NOTIFY_URL` secret row):
`https://g39bc7cd4ecbbbb-gcdev01.adb.ap-hyderabad-1.oraclecloudapps.com/ords/wksp_gcode2/webhooks/cashfree`

### Cashfree dashboard
`create_order` sends this URL as `order_meta.notify_url` on every order, which is what the existing
`NOTIFY_URL` row on your Webhooks page describes, so nothing is required there to start. If after a
test payment the dashboard's **Webhooks → Logs** tab shows no delivery and
`GCODE_PAYMENT_EVENTS_CF` stays empty, add the same URL as an endpoint under **Webhooks → Add Webhook
Endpoint** (Payment Gateway tab, test environment, version 2025-01-01) — Cashfree's docs don't say
whether a per-order URL alone is enough, so this is the fallback. For production the endpoint must
be HTTPS and configured in the production dashboard.

The webhook is a safety net (customer closed the tab). The normal path is the browser calling
route 2 right after checkout, which works without any webhook.
