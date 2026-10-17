# ORDS handler change: pass the environment through

Only ONE handler changes: `POST /v1/events/:id/cashfree-order` (module `gcode.events.v1`).
`/v1/participants/cashfree` and `/webhooks/cashfree` stay exactly as they are.

ORDS binds JSON body fields by name (that is how `:coupon_code` already works), so no input parameter
needs declaring. Three edits to the handler source:

```plsql
DECLARE
  ...
  v_cf_env VARCHAR2(4);                      -- 1. add this declaration
BEGIN
  GCODE_CASHFREE_PAYMENTS_API.create_order(
    ...
    p_coupon_code => :coupon_code,
    p_env         => :env,                   -- 2. optional override (localhost); absent = CF_ENV row
    ...
    p_currency    => v_currency,
    p_cf_env      => v_cf_env                -- 3. new OUT parameter (last)
  );
  APEX_JSON.open_object;
  IF v_is_free THEN ... ELSE
    ...
    APEX_JSON.write('currency', v_currency);
    APEX_JSON.write('env', LOWER(v_cf_env)); -- 4. frontend opens checkout in this mode ('test' / 'prod')
  END IF;
```
Everything else is unchanged.
