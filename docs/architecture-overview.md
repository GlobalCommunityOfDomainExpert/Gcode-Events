# Architecture Overview

High-level map of gcode-core-events. For deep dives see [Routing & API](/routing-reference), [Components & Design System](/component-reference), [Tooling & Config](/tooling-reference), and the existing [Backend Integration](/backend-integration-strategy) / [Oracle ADB Schema](/oracle-adb-schema-gap-prompt) pages.

## Stack

- **Next.js 16.2.9** (App Router), **React 19.2.4**
- **Tailwind CSS v4** (CSS-first `@theme`, no `tailwind.config.js`)
- **Storybook 10.4.6** — component library + the project's only test layer
- **Zustand 5** — event-wizard form state
- **Zod 4** — event-wizard schema validation
- **Oracle Cloud** — ORDS REST API (Autonomous DB) as the sole backend, OCI Object Storage for file uploads
- **Cashfree** — event registration payments (default; legacy Razorpay flow still selectable via `NEXT_PUBLIC_PAYMENT_PROVIDER=razorpay`). Backend in `docs/sql/cashfree/`
- **Google Identity Services** (`@react-oauth/google`) — OAuth sign-in

::: tip This is not stock Next.js
Per `AGENTS.md`, this Next.js build has breaking changes vs the version in most training data. One confirmed example: **Middleware was renamed to Proxy** in Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) — a `middleware.ts` file would silently not run. This app has neither `middleware.ts` nor `proxy.ts`; see [Routing & API](/routing-reference) for why.
:::

## High-level shape

```
Browser (Client Components, "use client")
   │
   ├─ src/hooks/*  (use-event, use-events, use-my-tickets, use-attendees, use-lookup, use-server-now)
   │     │
   │     ▼
   ├─ src/lib/api/{events,participants,auth,lookups,payments,ratings}.ts
   │     │  (typed fetchers, built on apiRequest())
   │     ▼
   ├─ src/lib/api/client.ts  →  apiRequest<T>()
   │     │  attaches Bearer JWT from getSession(), normalizes ORDS errors
   │     ▼
   └─ Oracle ORDS REST API (Autonomous DB)  ── external, not in this repo

Next.js Route Handlers (src/app/api/**/route.ts) sit alongside this as a
backend-for-frontend layer for two things ORDS/the browser can't do directly:
  - OCI Object Storage uploads (audio submissions) — keeps OCI keys server-only
  - Server-Sent Event streams (live-performer, reactions) — polls ORDS, pushes deltas
```

## Key architectural facts

- **No database/ORM in the app.** All domain data comes from a remote Oracle ORDS API. See `src/lib/api/client.ts`.
- **No server actions.** Zero `"use server"` directives anywhere in `src/`.
- **Almost everything is a Client Component.** Data fetching happens in the browser via hooks, not in Server Components. The one exception is `generateMetadata()` in `src/app/(public)/events/[id]/layout.tsx`, which does a real server-side `getEvent(id)` fetch to build per-event Open Graph/Twitter metadata.
- **No middleware/proxy layer.** Auth gating is done entirely client-side: layouts like `src/app/(app)/layout.tsx` check `getSession()` and `router.replace("/sign-in")` if absent, rather than intercepting requests before they render.
- **Auth session lives in `localStorage`**, not cookies. `src/lib/auth/session.ts` decodes a JWT (`gcode_token` key) client-side; there is no server session at all. This is consistent with there being no proxy/middleware to read a cookie in.
- **Real-time is SSE-over-polling, not WebSockets.** `src/app/api/events/[id]/live-performer/stream/route.ts` and `.../reactions/stream/route.ts` hand-roll a `ReadableStream` that polls ORDS on an interval and emits `text/event-stream` frames, consumed client-side via `EventSource`.
- **Route groups model three audiences**: `(public)` (unauthenticated event browsing/registration), `(auth)` (guest-only sign-in/up flows), `(app)` (session-required area: profile, event management). See [Routing & API](/routing-reference) for the full tree.
- **Role vocabulary is `expert | fresher | startup | institution`** (event-platform stakeholder roles) — reused consistently across profile views, sign-up flow, and attendee typing. See [Components & Design System](/component-reference) §3.

## Known gaps (surfaced while documenting)

- `.env.example` only declares `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; the codebase also reads `NEXT_PUBLIC_API_BASE_URL` (`src/lib/api/client.ts`) which isn't documented there.
- `--g-color-warning` / `--g-color-danger` design tokens (`src/app/globals.css`) are flagged in-code as undocumented in the design-system skill docs — placeholders pending design confirmation.
- No unit tests exist (`*.test.ts(x)` — zero matches). Test coverage is whatever Storybook stories exercise. Several components have no story at all — see [Components & Design System](/component-reference) for the exact list.
- `mintlify` is a devDependency with no corresponding config found in the repo — likely leftover from before the VitePress docs setup.
