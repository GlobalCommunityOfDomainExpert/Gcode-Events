# ORDS routes (module `gcode.events.v1`)

Each handler is a `plsql/block` that calls `GCODE_EVENT_PORTAL_API`. The
acting user id comes from the handler's verified session, **never** from the
request body. Map package errors to HTTP: `-20400` 400, `-20403` 403,
`-20404` 404, `-20429` 429.

| Method | Path | Calls | Notes |
|---|---|---|---|
| GET | `/events/:id/team` | `list_team` | manager only |
| POST | `/events/:id/team` | `invite_member` | body `{email, role}`; returns `{token}` once |
| PUT | `/team/:id` | `set_member_role` | body `{role}` |
| DELETE | `/team/:id` | `remove_member` | |
| GET | `/events/:id/share-links` | `list_share_links` | never returns tokens |
| POST | `/events/:id/share-links` | `create_share_link` | body `{label, role, expiry}`; returns `{id, token}` once |
| DELETE | `/share-links/:id` | `revoke_share_link` | |
| GET | `/shared/:token` | `resolve_shared` | **unauthenticated, no side effects**; field-filter the response with `role_can(role, area)` |
| POST | `/shared/:token/open` | `open_shared` | counts a view / activates an invite; pass `user_id` only for a signed-in caller |
| GET | `/events/:id/check-ins` | `list_check_ins` | organizer, co-organizer, or CHECK_IN token |
| POST | `/events/:id/check-ins` | `set_check_in` | body `{participant_id, arrived}` |
| GET | `/events/:id/communications` | `list_communications` | manager only |
| POST | `/events/:id/communications` | `send_communication` | body `{subject, message, group, participant_ids?}`; **ignore any `recipient_count`**; returns `{id, recipient_count}` |

## Not done in SQL (set these on the ORDS / mailer side)

- **Rate limit by IP** on `GET /shared/:token` and `POST /shared/:token/open`
  (ORDS or the gateway). The package only limits email sends per event.
- **Field filtering for `/shared/:token`**: the handler builds the payload
  from the data the role may see (`role_can`). CHECK_IN never gets emails or
  phones; SPONSOR never gets names or money. Test the API response, not just
  the page.
- **Mailer job**: reads `GCODE_EVENT_COMM_RECIPIENTS` rows with
  `STATUS = 'QUEUED'`, sends, then sets `STATUS` and the parent row's
  `STATUS`. Until it exists, do not show "Email sent" anywhere. The
  `{first_name}` placeholders are filled by the job, never the browser.
- **Panelist invites** (`POST /events/:id/panelists`): accept optional
  `role` (JUDGE, MENTOR, SPEAKER) and `note`; a backend that ignores them
  behaves as today.
- **Cancel with notify**: not built. Add an optional `notify` flag to the
  cancel procedure only once the mailer job exists (D10).
