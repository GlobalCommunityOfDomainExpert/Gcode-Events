-- ROLLBACK for the Cashfree backend. Run ONLY if you want to remove it completely.
--
-- WARNING: this DROPS the Cashfree order and webhook-log tables, i.e. the payment history of every
-- Cashfree order. Export them first if any real payments were taken:
--   SELECT * FROM GCODE_PAYMENT_ORDERS_CF;   SELECT * FROM GCODE_PAYMENT_EVENTS_CF;
-- It touches nothing else: no Razorpay table/package/route, no participant or coupon data.
--
-- To merely switch the app back to Razorpay you do NOT need this: set
-- NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay in the frontend env and restart/redeploy.
-- Also delete the two ORDS routes (participants/cashfree, webhooks/cashfree) in RESTful Services.

DROP PACKAGE GCODE_CASHFREE_PAYMENTS_API;
DROP VIEW    V_GCODE_PAYMENT_CF_NEEDS_ACTION;
DROP TABLE   GCODE_PAYMENT_EVENTS_CF PURGE;
DROP TABLE   GCODE_PAYMENT_ORDERS_CF PURGE;

DELETE FROM GCODE_APP_SECRETS WHERE secret_name LIKE 'CASHFREE\_%' ESCAPE '\';
COMMIT;
