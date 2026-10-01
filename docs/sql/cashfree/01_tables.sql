-- Run in WKSP_GCODE2 SQL Workshop: SQL Workshop -> SQL Scripts -> Create -> paste -> Run.
-- ADDITIVE ONLY: two new tables + one view. No existing table, column, constraint, package or
-- ORDS route is touched, so the live Razorpay system (GCODE_PAYMENT_ORDERS / GCODE_PAYMENT_EVENTS)
-- stays exactly as it is.
--
-- GCODE_PAYMENT_ORDERS_CF  = every column of GCODE_PAYMENT_ORDERS (Razorpay columns renamed to their
--                            Cashfree equivalents) + the extra columns Cashfree needs.
-- GCODE_PAYMENT_EVENTS_CF  = every column of GCODE_PAYMENT_EVENTS (renamed likewise) + signature/result
--                            columns so a webhook that fails verification is still recorded.
--
-- Money: AMOUNT / ORIGINAL_AMOUNT are in PAISE (1 INR = 100), exactly like GCODE_PAYMENT_ORDERS, so the
-- two tables can be UNIONed for reporting later. The package converts to rupees only when talking
-- to Cashfree (whose API is in rupees).

CREATE TABLE GCODE_PAYMENT_ORDERS_CF (
  -- ---- same as GCODE_PAYMENT_ORDERS --------------------------------------------------------
  ID                 NUMBER GENERATED ALWAYS AS IDENTITY,
  EVENT_ID           NUMBER        NOT NULL,
  CF_ORDER_ID        VARCHAR2(64)  NOT NULL,   -- (was RAZORPAY_ORDER_ID) OUR order id, sent to Cashfree as order_id
  CF_PAYMENT_ID      VARCHAR2(64),             -- (was RAZORPAY_PAYMENT_ID) Cashfree cf_payment_id, set once paid
  QUANTITY           NUMBER        NOT NULL,
  AMOUNT             NUMBER        NOT NULL,   -- paise, what Cashfree is asked to collect (after any coupon)
  CURRENCY           VARCHAR2(3)   DEFAULT 'INR' NOT NULL,
  STATUS             VARCHAR2(20)  DEFAULT 'CREATED' NOT NULL,
  EMAIL              VARCHAR2(255) NOT NULL,
  FULL_NAME          VARCHAR2(255) NOT NULL,
  PARTICIPANT_ID     NUMBER,
  CREATED_ON         TIMESTAMP(6)  DEFAULT SYSTIMESTAMP NOT NULL,
  PAID_ON            TIMESTAMP(6),
  CATEGORY           VARCHAR2(20)  DEFAULT 'ATTENDEE' NOT NULL,
  PHONE              VARCHAR2(20)  NOT NULL,   -- optional in the Razorpay table; Cashfree requires it (10 digits)
  COUPON_ID          NUMBER,
  -- ---- added for Cashfree ---------------------------------------------------------------
  PAYMENT_SESSION_ID VARCHAR2(500),            -- lets an identical retry reuse the still-open order
  USER_ID            NUMBER,                   -- NULL for guest checkout (up to 38 digits; kept as NUMBER)
  ORIGINAL_AMOUNT    NUMBER        NOT NULL,   -- paise, list price x quantity before any coupon
  EXPIRES_ON         TIMESTAMP(6)  NOT NULL,   -- also sent to Cashfree as order_expiry_time
  FAILURE_REASON     VARCHAR2(1000),           -- why a PAID order could not be registered
  UPDATED_ON         TIMESTAMP(6)  DEFAULT SYSTIMESTAMP NOT NULL,

  CONSTRAINT PK_GPOCF            PRIMARY KEY (ID),
  CONSTRAINT UQ_GPOCF_CF_ORDER   UNIQUE (CF_ORDER_ID),
  CONSTRAINT GPOCF_EVENT_FK      FOREIGN KEY (EVENT_ID)  REFERENCES EVENTS (ID),
  CONSTRAINT GPOCF_COUPON_FK     FOREIGN KEY (COUPON_ID) REFERENCES GCODE_COUPONS (ID),
  CONSTRAINT CK_GPOCF_CATEGORY   CHECK (CATEGORY IN ('ATTENDEE','PARTICIPANT')),
  CONSTRAINT CK_GPOCF_QTY        CHECK (QUANTITY >= 1),
  CONSTRAINT CK_GPOCF_AMOUNT     CHECK (AMOUNT >= 100 AND ORIGINAL_AMOUNT >= AMOUNT),   -- Cashfree minimum is 1.00 INR
  -- CREATED            order exists at Cashfree, not paid yet
  -- PROCESSING         paid; one worker has claimed it and is creating the participant
  -- PAID               paid AND the participant exists
  -- PAID_UNREGISTERED  paid but registration failed (event full, already registered, ...) -> manual refund
  -- FAILED / EXPIRED   never paid
  CONSTRAINT CK_GPOCF_STATUS     CHECK (STATUS IN ('CREATED','PROCESSING','PAID','PAID_UNREGISTERED','FAILED','EXPIRED'))
);

CREATE INDEX IX_GPOCF_EVENT_STATUS ON GCODE_PAYMENT_ORDERS_CF (EVENT_ID, CATEGORY, STATUS);
CREATE INDEX IX_GPOCF_EMAIL        ON GCODE_PAYMENT_ORDERS_CF (EVENT_ID, LOWER(EMAIL));

-- Every webhook delivery, valid or not, so debugging is a SELECT. Rows are written by an autonomous
-- transaction (see the package) so they survive the request's own rollback.
CREATE TABLE GCODE_PAYMENT_EVENTS_CF (
  -- ---- same as GCODE_PAYMENT_EVENTS --------------------------------------------------------
  ID            NUMBER GENERATED ALWAYS AS IDENTITY,
  CF_EVENT_ID   VARCHAR2(100),                 -- (was RAZORPAY_EVENT_ID) Cashfree's x-idempotency-key; the same
                                               -- key repeats on retries, so unlike Razorpay's it is NOT unique here
  CF_ORDER_ID   VARCHAR2(64),                  -- nullable: a rejected delivery may not carry a usable order id
  EVENT_TYPE    VARCHAR2(60),                  -- e.g. PAYMENT_SUCCESS_WEBHOOK
  PAYLOAD       CLOB,
  RECEIVED_ON   TIMESTAMP(6)  DEFAULT SYSTIMESTAMP NOT NULL,
  -- ---- added for Cashfree ---------------------------------------------------------------
  SIGNATURE_OK  VARCHAR2(1)   NOT NULL,        -- 'Y' / 'N'
  PROCESSED     VARCHAR2(1)   DEFAULT 'N' NOT NULL,
  RESULT_NOTE   VARCHAR2(1000),

  CONSTRAINT PK_GPECF PRIMARY KEY (ID),
  CONSTRAINT CK_GPECF_SIG  CHECK (SIGNATURE_OK IN ('Y','N')),
  CONSTRAINT CK_GPECF_PROC CHECK (PROCESSED IN ('Y','N'))
);

CREATE INDEX IX_GPECF_ORDER ON GCODE_PAYMENT_EVENTS_CF (CF_ORDER_ID);

-- Operations queue: customers who PAID and did NOT get a ticket. Refund these in the Cashfree dashboard
-- (Transactions -> the payment -> Refund).
CREATE OR REPLACE VIEW V_GCODE_PAYMENT_CF_NEEDS_ACTION AS
SELECT o.id, o.cf_order_id, o.cf_payment_id, o.event_id, o.email, o.full_name, o.phone,
       o.quantity, o.amount / 100 AS amount_inr, o.failure_reason, o.created_on, o.updated_on
  FROM GCODE_PAYMENT_ORDERS_CF o
 WHERE o.status = 'PAID_UNREGISTERED';
