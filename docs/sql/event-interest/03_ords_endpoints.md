# ORDS routes

`gcode.events.v1` module, new route:

| Method | Path | Source type | Body |
|---|---|---|---|
| POST | `/events/:id/interest` | `plsql/block` | JSON `{ "email"?: string, "phone"?: string, "user_id"?: number }` → `GCODE_EVENT_INTEREST_API.express_interest`. 201 `{ok:true}`, 400 `{error}` |

- Logged-in caller sends `user_id` (email looked up server-side, no phone
  collected or required).
- Guest sends `email` + `phone`; email must have passed `POST /auth/guest-otp` +
  `POST /auth/verify-otp` within the last 15 minutes
  (`GCODE_PENDING_USERS.is_verified = 'Y'`). The pending row is **not**
  consumed, so a following registration still works. `phone` is
  format-checked only (regex, spaces/dashes/parens stripped before storing)
  — never OTP/SMS-verified.
- Repeat calls for the same (event, email) succeed and don't add a row; a
  resubmit with a different phone updates the stored phone.

`GET /events/:id` (existing) now also returns `interested_count`.

Full handler source: `GCODE-Backend/ords/gcode.events.v1/template/id-interest.sql`.
