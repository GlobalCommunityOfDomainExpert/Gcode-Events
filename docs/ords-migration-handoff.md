# Handoff: ORDS → Next.js backend migration

Session date: 2026-11-17. Everything below is **uncommitted** on `main`
(base `dda7293`). Nothing has been committed or pushed; the user's own
earlier uncommitted edits (comments in `src/lib/api/client.ts`,
`src/lib/auth/*`, `src/lib/api/auth.ts`, `src/app/(public)/events/page.tsx`)
are mixed into the working tree — keep them.

## Goal

Remove Oracle ORDS from this app. The browser only calls our own Next.js
routes under `/api/v1`; those routes hold the business logic and talk to
Oracle directly through `src/infrastructure/database` (node-oracledb Thin).
The database becomes persistence only.

Approved plan: `~/.claude/plans/connect-to-the-mcp-wiggly-sedgewick.md`.
Decisions made with the user:

- **Phased.** Phase 1: routes call the existing PL/SQL packages (`db.call(...)`)
  so ORDS can be switched off. Phase 2: port each package's logic to
  TypeScript, one domain at a time.
- **Events app only.** Bookings, profiles, payouts, slots, WhatsApp, the 2
  scheduler jobs and the APEX app at `gcode.in/ords/r/...` are out of scope —
  the schema is shared with that other app; never drop shared packages.
- **Next.js owns auth**: signed HS256 JWT in httpOnly cookie `gcode_session`.
- **Clean REST under `/api/v1`**: camelCase JSON, `{ data }` /
  `{ data, page }` / `{ error: { code, message, details? } }`, zod validation.

## Progress (Phase 1 order)

| Step | Area | State |
|---|---|---|
| 0 | DB layer, HTTP plumbing, auth core | done |
| 1 | Auth (ported off `AUTH_PKG` to TS) + `/me/participations` | done, unit-tested; real sign-in not tested (needs a real password / Google login) |
| 2 | Lookups, public event list/detail/children, cover image | done, verified end-to-end against `gcdev01` |
| 3 | Organizer event writes (atomic save, patch, delete, cover upload, questions read) | done, verified end-to-end (24/24 checks, throwaway events 641/642 created + deleted) |
| 4 | Participants & registration | done: 21 unit tests (`participants.service.test.ts`), verified end-to-end on `gcdev01` 2026-11-19 (28/28 checks; throwaway events 661/662 + participants 1581/1582 created and removed) |
| 5 | Payments: coupons, UPI claims, Cashfree + webhook; Razorpay removed | done: grants applied, 27 unit tests, E2E 45/45 on `gcdev01` 2026-11-20. Real ₹1 payment blocked by Cashfree domain whitelisting (localhost) — run it as the first smoke test on the deployed, whitelisted domain |
| 6 | Rounds, ratings, panelists, live state, reactions + 2 SSE streams | done: 25 unit tests (147 total), E2E 51/51 on `gcdev01` 2026-11-20 (throwaway event 683 created and removed) |
| 7 | Interest + enquiries; ORDS client code removed — **Phase 1 complete** | done: 7 unit tests (154 total), E2E 13/13 on `gcdev01` 2026-11-21 (throwaway event 701 created and removed). `apiRequest`, `API_BASE_URL` and the `resolveImageUrl` ORDS fallback are gone; no `oraclecloudapps`/`/ords/` left outside docs |
| 8 | Merged `dev` (66 commits) and ported its ORDS-era features onto `/api/v1` | done 2026-11-21, unit-tested (179 total); **not verified against the DB** (see below). Partners: `GET /events/:id/partners`, saved with the event (direct SQL on `GCODE_EVENT_PARTNERS`). Card image: `GET`/`PUT /events/:id/card-image`, stored like the cover (`CARD_IMAGE`, `CARD_IMAGE_MIME`, `CARD_IMAGE_URL`). Multi-date days: `end_date` in `STAGES_JSON`, days for every mode. Image upload moved to `POST /api/v1/uploads/image` (cookie auth) |
| 9 | Organizer portal + live room (PR #94) moved off its ORDS module (`/api/portal` + `ORDS_PORTAL_KEY`) onto `/api/v1` | done 2026-11-26, unit-tested (201 total); **not verified against the DB**. `src/server/modules/portal` (plain SQL on the `GCODE_EVENT_TEAM`/`_SHARE_LINKS`/`_CHECKINS`/`_WEBINAR`/`_LIVE_*` tables and `GCODE_PORTAL_V_*` views). Event delete now runs `gcode_purge_event` with the draft/admin rules (`events.delete.service.ts`). Provider webhook moved to `/api/v1/webhooks/live`. Grants: end of `docs/sql/app-user/01_create_events_app_user.sql` |
| — | Phase 2 (port PL/SQL → TS), email adapter, secrets out of `GCODE_APP_SECRETS` | todo |

### Next actions

0. Verify the step 8 schema assumptions on `gcdev01` before deploying:
   `EVENTS.CARD_IMAGE_URL`, `EVENTS.CARD_IMAGE` (BLOB), `EVENTS.CARD_IMAGE_MIME`
   and `GCODE_EVENT_PARTNERS (event_id, name, role, logo_url, url, about,
   sort_order)` with a generated `id`. The event list selects
   `card_image_url`, so a missing column breaks every listing. Then apply the
   new `gcode_event_partners` grant from the app-user script.

1. Deployment checklist (with the user):
   - Real ₹1 Cashfree payment from the whitelisted production domain
     (localhost is refused: "domain not whitelisted"). Verify order →
     registration → webhook, then the user refunds.
   - Switch the `CASHFREE_NOTIFY_URL` secret row to
     `https://<app>/api/v1/webhooks/cashfree`.
   - Browser click-through of organizer editor, rounds tab, live panel,
     judge page, rate page, scoreboard, register flow, my-tickets, the
     "I'm interested" button and the enquiry form.
   - ORDS can then be switched off for this app (the shared schema's other
     APEX app still uses it — only disable the `gcode.events.v1` etc.
     modules, after confirming nothing else calls them).
2. Phase 2, when the user wants it.

E2E notes from step 4 (reuse for later steps):
- `create_participant` always sends a confirmation email and `submit_audio`
  a submission-received email (+ WhatsApp if the phone is verified). The
  user's own test address is `atharvashandilya886@gmail.com` (an existing
  account — never delete its `gcode_users` row).
- Deleting an event does NOT remove its participants (no FK, see open
  issues): hard-delete test participants via MCP afterwards, then
  `BEGIN COMMIT; END;` — a bare `COMMIT` isn't accepted by the MCP.
- After editing files the dev server's cached DB client can be stale;
  restart it before an E2E run.

## Architecture

```
src/app/api/v1/**/route.ts      HTTP only — always wrap with route()
src/server/http/                route() wrapper, AppError + error mapping, responses, contract.ts (shared wire types)
src/server/auth/                session.ts (cookie JWT, requireUser/requireAdmin), google.ts (id_token via JWKS)
src/server/db/transaction.ts    transaction(), within(tx), standalone — repositories take a DbSource
src/server/modules/<domain>/    *.schemas.ts (contract, browser-importable, NO server-only)
                                *.repository.ts (only place with SQL / package calls)
                                *.mapper.ts (row → DTO), *.service.ts (rules)
src/infrastructure/database/    vendor-neutral DatabaseClient: query/queryOne/execute/call/transaction
src/infrastructure/storage/     oci-object-storage.ts (audio uploads; server-only)
src/lib/api/                    browser clients: v1Request / v1RequestPage (/api/v1); apiRequest (legacy ORDS)
src/lib/api/adapters/           DTO → UI models, one file per domain (index.ts barrel)
src/lib/api/types/              legacy ORDS wire types; delete each file as its domain moves
src/lib/event-draft/payloads.ts editor draft → DB columns / child JSON (shared by server save + browser preview)
src/lib/datetime/ist.ts         IST helpers
```

Read `src/server/README.md` (layer rules, wire format) and
`src/infrastructure/database/README.md` first. Modules done:
`lookups`, `auth`, `events` (+ `events.write.service.ts`), `questions`,
`participants`.

Rules that matter:
- Identity always from the session (`user` in `route()` ctx), never the body.
- `route()` defaults to `auth: "user"`; public routes opt in with `auth: "public"`.
- Server components call services directly (no HTTP to ourselves).
- `DatabaseError` `APPLICATION_ERROR` (ORA-20xxx) messages pass through as
  `BAD_REQUEST` because the UI shows them; anything unknown becomes a generic
  `INTERNAL` and is logged.
- DB driver: plain DATE/TIMESTAMP read as UTC; strings > 32 KB bind as CLOB,
  Buffers > 32 KB as BLOB; bind TSTZ params as `Date`, never ISO strings.
- Packages are definer-rights. Some COMMIT internally (all of
  `GCODE_EVENT_PARTICIPANTS_API` writes except `replace_answers`; check
  before putting a call inside `transaction()`). `GCODE_EVENTS_API`,
  `GCODE_ROUNDS_API`, `GCODE_EVENT_ADV_Q_API` don't commit.

## DB access (read the memory note `db-access-and-secrets`)

- sqlcl MCP connection `gcdev01` = **ADMIN**. It logs every statement to
  `ADMIN.DBTOOLS$MCP_LOG` — **never put passwords in MCP SQL**. Package
  bodies are readable via `dba_source` as ADMIN; ORDS handler source is not
  (some old snapshots are in `docs/sql/**`).
- The app connects as least-privilege `GCODE_EVENTS_APP` (`DB_SCHEMA=WKSP_GCODE2`)
  over mTLS; wallet copy at `~/.oracle/gcdev01-wallet`. All of this is in
  `.env.local` (git-ignored), plus `AUTH_SECRET`. Password was rotated from
  Node, never via MCP.
- Every new table the app reads/writes directly needs a GRANT: apply it via
  MCP **and** append it to `docs/sql/app-user/01_create_events_app_user.sql`.

## Testing

- `npm test` → vitest `unit` project (Node, `src/**/*.test.ts`); 70 tests.
- `npx tsc --noEmit -p .` — ignore the stale `.next/dev/types/validator.ts` error.
- Pre-existing lint error in `rounds-tab.tsx` (setState in effect) and an
  unused-disable warning in `opengraph-image.tsx` — not ours.
- E2E against the real DB: `npx next dev -p 3456`, then mint an admin cookie
  with `jose` using `AUTH_SECRET` from `.env.local` (subject `"82"`, role
  `ADMIN` — user 82 is the user's own account). Last session's script:
  `/tmp/claude-1000/-home-kryptic-Documents-Work-Gcode-Events/589118c4-4776-489e-9297-3d0a0c0ff5c4/scratchpad/e2e_writes.mjs`
  (scratchpad may be gone; it's easy to rewrite). Always delete test data
  afterwards and confirm with an MCP query. Don't trigger flows that send
  real emails (guest OTP, sign-up, password reset) without asking.

## Behaviour changes made so far (tell reviewers)

- Old localStorage `gcode_token` sessions are cleared → everyone signs in once.
- Security fixes vs ORDS/AUTH_PKG: ADMIN no longer self-selectable at
  sign-up; first-role-for-Google requires that account's session (was an
  account takeover); reset-link origin comes from the server (`APP_URL` or
  request), not the client; organizer writes now require admin (ORDS allowed
  anyone); cover uploads restricted to raster images ≤10 MB and served with
  nosniff + sandbox CSP; participant contact details only to admins.
- Event saves are one transaction (was ~10 browser calls); created_by /
  organizer_id / updated_by now recorded from the session; FAQ save failure
  now fails the save; cover upload failure is a warning.
- Event delete also removes `event_social_links` (no FK there → orphans).
- Category filter on the list now actually filters (ORDS ignored it).
- App DB sessions are pinned to `TIME_ZONE = 'UTC'` (pool sessionCallback).
  node-oracledb gave them the machine's zone (IST), so every comparison of
  a plain TIMESTAMP column with SYSTIMESTAMP was 5.5 h off: guest/sign-up
  OTPs and reset links always "expired", and package checks (coupon dates,
  registration windows) drifted. Found 2026-11-20 during the ₹1 test.
- `DatabaseError` is now recognised by a `Symbol.for` brand
  (`DatabaseError.is()`), not `instanceof`: the DB client cached on
  `globalThis` can throw a class from another module copy (seen after a dev
  reload — ORA-20xxx business errors came back as 500 instead of 400).
- Razorpay removed (its event package `GCODE_PAYMENTS_API` no longer exists
  on gcdev01, so the fallback already failed); Cashfree is the only gateway
  and `NEXT_PUBLIC_PAYMENT_PROVIDER` is gone.
- Coupon dates are inclusive IST days. ORDS stored the picked day as
  midnight UTC and compared with SYSTIMESTAMP, so "valid to Oct 23" ended at
  05:30 IST on Oct 23 (coupon 61, from = to, was never usable). Older rows
  still read back as the day picked.
- Coupons and UPI claims: organizer routes now require admin and take
  created_by / reviewer from the session (ORDS trusted the body). UPI claims
  from signed-in users use the session's name/email.
- Judging: decisions, rounds config, live controls, rating links, panelist
  invites/list are admin-only; scores and the score/decision history are
  for admins and the event's accepted panelists (ORDS enforced nothing and
  took scorer/decider ids from the browser). Scores are checked against the
  criterion's max and the round/event (the package checks nothing).
- Panelist invites can only be viewed/answered by the invited account (email
  must match). Under ORDS anyone holding an invite id could accept it and
  become a judge.
- The attendee list is open to the event's accepted panelists too, without
  email/phone — the judge page needs it, and step 4 had made it admin-only
  (which broke non-admin judges).
- Live-state/reactions SSE moved to `/api/v1/events/:id/{live-state,reactions}/stream`
  (camelCase payloads; old `/api/events/...` routes deleted).
- Dead code removed: `event-wizard.tsx`, `step-event-type.tsx`, `step-review.tsx`,
  unused participant replace/age-category clients.

## Open issues to raise with the user

- Ratings are keyed by the attendee's registration id in the rating link
  (a guessable bearer, like `?pid=`): anyone can rate as any attendee once.
  Same as ORDS; signed rating links would fix it (needs the email template).

- `gcdev01` is wired to production Cashfree (24 real paid orders): it's
  effectively the production database, not a dev one.
- Deleting an event that has coupons or UPI claims fails (FKs, no cascade)
  with a generic "invalid data" error — same as under ORDS.
- Deleting an event that has interest or enquiry rows fails the same way
  (`gcode_event_interest`/`gcode_event_enquiries` reference `events`).
- Rate limiting (added 2026-11-21, `src/server/rate-limit/`, table
  `GCODE_RATE_LIMITS` — `docs/sql/rate-limits/`, created + granted on
  `gcdev01`; 8 unit tests, E2E 9/9, test counters deleted). Fixed-window counters in
  the DB, shared by all instances; keys are sha256 of the IP/email. Declared
  per route via `route({ rateLimit: [perIp(...), perEmail(...)] })`; over the
  limit → 429 `RATE_LIMITED` + `Retry-After`. Fails open if the counter
  can't be read (logged). Limits:

  | Route | Per email | Per IP |
  |---|---|---|
  | auth/guest-otp, sign-up, forgot-password | 5 / h | 20 / h |
  | auth/verify-otp, sign-in | 10 / 15 min | 50 / 15 min |
  | auth/reset-password | — | 20 / h |
  | coupons/validate | — | 20 / 10 min |
  | enquiries | 5 / h | 5 / h |
  | interest | — | 30 / h |
  | payment-orders | — | 20 / h |
  | upi-claims (POST) | — | 10 / h |

  Hosting is Vercel Pro, functions in `bom1` (confirmed 2026-11-21), which sets
  `x-real-ip`/`x-forwarded-for` itself, so the per-IP limits hold. Per-email caps let someone
  lock an address out of OTP verify / sign-in for up to 15 min. Not limited:
  `auth/google` (Google verifies the token), `select-role`, `ratings`,
  `reactions`. Still no captcha on enquiries. The ORDS `interest` endpoint
  trusted a `user_id` from the body; `/api/v1` uses the session instead.
- Confirming a UPI claim for an email with no account fails "Email not
  verified" (confirm doesn't pass skip-verification) — same as ORDS.

- Deleting an event leaves its registrations behind: `gcode_event_participants`
  has no FK to `events` and `delete_event` is a bare DELETE (same as under
  ORDS). Decide: block delete when there are registrations, or remove them.

- `AUTH_PKG` contains a hard-coded JWT secret; rotate once nothing uses ORDS login.
- Participant `?pid=` links are effectively bearer keys (guessable ids); a
  proper fix is signed links, which needs the PL/SQL confirmation-email
  templates (`GCODE_EMAIL_API`) changed.
- `create_participant` skips the registration-window check for signed-in users.
- Event 422 email-verification exemption was carried over from the frontend
  (`EMAIL_VERIFICATION_EXEMPT_EVENTS`) — unconfirmed.
- Events 81/61 hidden from listings (from the old ORDS query); drafts are
  still publicly readable (TODO in `events.service.ts`).
- Large UI components (`rounds-tab.tsx`, `event-editor.tsx`,
  `register/page.tsx`, `events/page.tsx`) were deliberately not split — each
  is one big component; needs per-screen visual checking.
- Browser click-through of the organizer editor, event pages, my-tickets and
  the registration flow has not been done.

## Remaining ORDS usage

None in `src/`. The only `/ords/` link left is `gcode.in/ords/r/...`, the
other APEX app (sign-up link) — keep it.
