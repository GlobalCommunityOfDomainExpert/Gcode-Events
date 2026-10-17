# ORDS handler change: pass the environment through

Only ONE handler changes: `POST /v1/events/:id/cashfree-order` (module `gcode.events.v1`).
`/v1/participants/cashfree` and `/webhooks/cashfree` stay exactly as they are.

ORDS binds JSON body fields by name (that is how `:coupon_code` already works), so no parameter
needs declaring. In the handler source add one line after `p_coupon_code => :coupon_code,`:

```plsql
      p_coupon_code => :coupon_code,
      p_env => :env,
```
Everything else is unchanged. A request without `env` is treated as PROD.
