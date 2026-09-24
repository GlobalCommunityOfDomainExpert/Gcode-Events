# ORDS routes

`gcode.events.v1` module, new route:

| Method | Path | Source type | Body |
|---|---|---|---|
| POST | `/events/:id/interest` | `plsql/block` | JSON `{ "email"?: string, "user_id"?: number }` → `GCODE_EVENT_INTEREST_API.express_interest`. 201 `{ok:true}`, 400 `{error}` |

- Logged-in caller sends `user_id` (email looked up server-side).
- Guest sends `email`; it must have passed `POST /auth/guest-otp` +
  `POST /auth/verify-otp` within the last 15 minutes
  (`GCODE_PENDING_USERS.is_verified = 'Y'`). The pending row is **not**
  consumed, so a following registration still works.
- Repeat calls for the same (event, email) succeed and don't add a row.

`GET /events/:id` (existing) now also returns `interested_count`.

Full handler source: `GCODE-Backend/ords/gcode.events.v1/template/id-interest.sql`.
