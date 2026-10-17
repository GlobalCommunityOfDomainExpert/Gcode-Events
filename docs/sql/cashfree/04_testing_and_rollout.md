# Testing, operations, and going to production

## Sandbox test data (Cashfree)
No real money moves in sandbox. Card numbers are published on Cashfree's sandbox page
(https://www.cashfree.com/docs/payments/online/resources/sandbox-environment); use expiry `03/2028`,
CVV `123`, name `Test`, OTP `111000`. UPI: `testsuccess@gocash` (pays), `testfailure@gocash` (fails),
`testinvalid@gocash` (invalid VPA). Net banking: "Test Bank", code `3333`. PayPal/bank transfer don't
exist in sandbox; cardless EMI needs ≥ ₹1,000.

## Before you start
Create these in the app (as an admin, My Organized Events → New) so every test has what it needs:
- **Event A**: paid (₹10), open registration, capacity 50. Used for most rows.
- **Event B**: paid, **capacity 1** (row 11).
- **Event C**: paid, status set to **Cancelled** afterwards (row 12).
- A **100% coupon** and a **20% coupon** on Event A (organizer → event → Coupons tab).
- Two browser profiles: one signed in, one private window as a guest.

## Test matrix
| # | Scenario | How | Expected |
|---|---|---|---|
| 1 | Happy path, guest | Guest: fill the form (phone 10 digits), verify the email code, pay with `testsuccess@gocash` | `/registered` page; order `PAID`; one participant row (`CONFIRMED`); confirmation email |
| 2 | Happy path, signed in | Same while logged in | The phone field is shown; participant attached to the account |
| 3 | Failed payment | Pay with `testfailure@gocash` | Message, no ticket; order stays `CREATED`; retry in the same checkout works |
| 4 | Closed modal | Close checkout without paying | "Payment was not completed… not charged"; order `CREATED` |
| 5 | Closed tab after paying | Pay, close the tab before the page loads | Within about a minute the webhook registers you: order `PAID`, a row in `GCODE_PAYMENT_EVENTS_CF` with `signature_ok = 'Y'` |
| 6 | 100% coupon | Apply the 100% coupon, register | Free registration, no checkout, no order row |
| 7 | Partial coupon | Apply the 20% coupon | Checkout shows the discounted amount; `amount < original_amount`; coupon redemption count +1 after payment |
| 8 | Already registered | Register, then try again with the same email | Rejected **before** checkout: "You are already registered for this event." |
| 9 | Phone validation | Type 5 digits | Field error, no order created |
| 10 | Double click | Click Pay twice quickly | One order; the second call reuses it |
| 11 | Event full | On Event B, register once, then try as a second person | "Only 0 ticket(s) left for this event." before checkout |
| 12 | Cancelled event | Open Event C's register page | "Registration is not open for this event." |
| 13 | Bad webhook signature | `curl -X POST <webhook url> -d '{}'` | HTTP 401; a `signature_ok = 'N'` row in `GCODE_PAYMENT_EVENTS_CF` |
| 14 | Dashboard "Test" webhook | Cashfree → Webhooks → Test | HTTP 200; a row noting "Unknown order id - ignored" |
| 15 | Expiry | Temporarily set `CASHFREE_ORDER_EXPIRY_MINUTES` to `16`, create an order, wait | After expiry the order shows `EXPIRED`; the capacity hold is released |
| 16 | Pass type switched off | Disable the Participant pass on an event, call create-order for it | "Registration for this pass type is not open." |
| 17 | Fall back to Razorpay | Set `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay`, restart, open a paid event | The Razorpay flow runs exactly as before (needs the Razorpay backend to exist in that database) |

Useful queries:
```sql
SELECT cf_order_id, status, amount/100 AS inr, original_amount/100 AS list_inr, email, participant_id, failure_reason, created_on
  FROM GCODE_PAYMENT_ORDERS_CF ORDER BY id DESC FETCH FIRST 20 ROWS ONLY;

SELECT received_on, event_type, signature_ok, processed, result_note, cf_order_id
  FROM GCODE_PAYMENT_EVENTS_CF ORDER BY id DESC FETCH FIRST 20 ROWS ONLY;

SELECT * FROM V_GCODE_PAYMENT_CF_NEEDS_ACTION;   -- paid but no ticket: refund these
```

## Operations runbook
- **"I paid but have no ticket":** find their email in `GCODE_PAYMENT_ORDERS_CF`.
  - `PAID` → they have a ticket (`participant_id`); the email may be in spam.
  - `CREATED` / `PROCESSING`, and Cashfree shows the payment succeeded → have them reload the
    registration page (verify is idempotent), or wait for the webhook retry.
  - `PAID_UNREGISTERED` → charged but registration failed (event filled up, they had registered another
    way, ...). `failure_reason` says why. **Refund** in the Cashfree dashboard (Transactions → the
    payment → Refund). The queue is `V_GCODE_PAYMENT_CF_NEEDS_ACTION`.
- **There are no automatic refunds.** Paid-but-unregistered orders are only recorded. Check that view daily
  for the first weeks.
- **Optional hourly cleanup** (reports only; correctness doesn't depend on it):
  `BEGIN GCODE_CASHFREE_PAYMENTS_API.expire_stale_orders; END;`

## Behaviour to know about
- A coupon with one redemption left can be used by two people who both started checkout before either paid;
  both are registered (refusing someone who already paid is worse) and the redemption count may exceed the
  maximum by one.
- Rules are checked at order creation **and** capacity/limits again at registration. If the event fills in
  the seconds between payment and registration, the order becomes `PAID_UNREGISTERED`.
- The organizer dashboard's "Revenue" and "₹ paid" are computed in the browser as list price × quantity and
  ignore coupons. That predates this work and is unchanged.
- `GCODE_WHATSAPP_API` (package body) is currently INVALID in the database. That is unrelated to payments, but
  it means WhatsApp thank-you messages sent after registration are failing silently.

## Going to production
Environment is one backend switch, the `CF_ENV` row in `GCODE_APP_SECRETS` (`production` or `sandbox`) and stored on the order (`CF_ENV`). See `05_production_secrets.sql`, `06_env_per_order.sql`, `07_ords_order_handler.md`.

In the database and Cashfree **production** account:

| What | Sandbox | Production |
|---|---|---|
| `CASHFREE_BASE_URL` (prod: `CASHFREE_PROD_BASE_URL`) | `https://sandbox.cashfree.com/pg` | `https://api.cashfree.com/pg` |
| `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` | test keys | live keys (never in the frontend) |
| `CASHFREE_API_VERSION` | `2025-01-01` | same (upgrade deliberately and re-run the matrix) |
| `CASHFREE_NOTIFY_URL` | dev ORDS webhook URL | **production** ORDS webhook URL, HTTPS only |
| `CASHFREE_RETURN_BASE_URL` | `http://localhost:3000` | your real site, e.g. `https://events.gcode.in` |
| `NEXT_PUBLIC_CASHFREE_MODE` | `sandbox` | `production` |

Also, in the Cashfree **production** dashboard: whitelist your site domain (checkout is blocked on
non-whitelisted domains), configure the production webhook endpoint if the per-order URL isn't delivering,
and activate the payment methods you want.

The production database needs the same objects: `01_tables.sql`, the secrets rows (production values),
`02_gcode_cashfree_payments_api.sql`, and the two ORDS routes. **Do not deploy the frontend to production
before that is done**, because the frontend now defaults to Cashfree. Run rows 1, 3, 5 and 13 with a small real
payment (and refund it afterwards).
