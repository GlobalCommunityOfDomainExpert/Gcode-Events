# Server (business layer)

Everything the browser used to get from Oracle ORDS now goes through our own
Next.js routes under `/api/v1`. This folder holds the business logic behind
those routes. Plan and progress: ORDS is retired one domain at a time.

```
Browser  ──fetch──▶  src/app/api/v1/**/route.ts     HTTP only
                          │ route({ auth, params, query, body }, fn)
                          ▼
                     src/server/modules/<domain>/
                       <domain>.service.ts           business rules
                       <domain>.repository.ts        all SQL (only file using the DB)
                       <domain>.mapper.ts            DB row → API shape
                       <domain>.schemas.ts           zod contract, shared with the browser
                          │
                          ▼
                     src/infrastructure/database      vendor-neutral DB client
```

## Rules

1. **Routes are thin.** Parse, check auth, call one service function, return.
   No SQL, no business rules. Always wrap with `route()` from
   `src/server/http/handler.ts`.
2. **Only repositories touch the database.** Services never import
   `@/infrastructure/database`. While a domain still lives in PL/SQL, its
   repository calls the package (`db.call("BEGIN pkg.proc(...); END;")`);
   porting it to TypeScript only changes the repository and service.
3. **Identity comes from the session, never the body.** Use `user` from the
   `route()` context (or `requireUser()`/`requireAdmin()` from
   `src/server/auth/session.ts`). Don't accept `user_id`, `created_by`,
   `decided_by` etc. from the client.
4. **`*.schemas.ts` is the contract.** It has no `server-only` import, so
   `src/lib/api/*` can import its types (and zod schemas) in the browser.
   Everything else here is `server-only`.
5. **Server components call services directly** — no HTTP round-trip to
   our own API (see `src/lib/client-dashboard/data.ts`).
6. **Public writes are rate limited.** Any public route that sends email,
   checks a secret (code, password, coupon) or stores user content gets
   `rateLimit: [perIp(...), perEmail(...)]` in its `route()` options
   (`src/server/rate-limit/rate-limit.ts`). Over the limit → 429
   `RATE_LIMITED` with `Retry-After`.

## Wire format

| Case    | Status  | Body                                                           |
| ------- | ------- | -------------------------------------------------------------- |
| Success | 200/201 | `{ "data": … }`                                                |
| List    | 200     | `{ "data": [...], "page": { limit, offset, total, hasMore } }` |
| No body | 204     | —                                                              |
| Error   | 4xx/5xx | `{ "error": { "code", "message", "details?" } }`               |

- JSON keys are camelCase; `null` is sent, never omitted.
- User ids are strings (30–40 digit numbers lose precision as JSON numbers).
- Error codes: `BAD_REQUEST`, `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `UNAVAILABLE`, `INTERNAL`. Messages raised by
  PL/SQL `RAISE_APPLICATION_ERROR` are passed through as `BAD_REQUEST` (the
  UI shows them); any other unexpected error becomes a generic `INTERNAL`
  and is logged server-side.

The browser client for this format is `v1Request()` in
`src/lib/api/client.ts`.

## Adding a domain

1. `src/server/modules/<domain>/` — schemas, repository, mapper, service.
2. `src/app/api/v1/<resource>/route.ts` using `route()`.
3. Point `src/lib/api/<domain>.ts` at `v1Request()` and update callers.
4. Add any new table grants to `docs/sql/app-user/`.

Reference implementations: `modules/lookups` (plain SQL), `modules/events`
(package call + SQL, pagination, binary response), `modules/auth`
(transactions, sessions).
