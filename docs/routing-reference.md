# Routing & API Reference

Full map of `src/app/` (App Router) and the Route Handlers under `src/app/api/`. See [Architecture Overview](/architecture-overview) for how these fit into the bigger picture.

## Why there's no `middleware.ts`

Next.js 16 renamed Middleware to **Proxy** (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`): a `proxy.ts` file at the project root or in `src/` exporting a `proxy` function replaces the old `middleware.ts` convention. This repo has **neither file** — all auth gating happens client-side inside layouts (session check + `router.replace(...)`), not at the request-interception layer. Route Handlers (`route.ts`) and standard App Router conventions (`page.tsx`, `layout.tsx`, `_components` for non-route folders, `(group)` route groups, `[param]` dynamic segments, `[...catchAll]`, `@modal` parallel slot, `(.)segment` intercepting routes) are otherwise used as documented.

## Route tree

```
src/app/
├── layout.tsx                Root layout — <html>/<body>, fonts, metadata, renders {children} + {modal} slot
├── not-found.tsx              Global 404 → CTA to /events
├── globals.css                 Tailwind v4 entry + design tokens
│
├── (app)/                     Route group — requires session
│   ├── layout.tsx              Redirects to /sign-in if no session
│   ├── profile/
│   │   ├── layout.tsx           Wraps in <AuthedShell>, guards on session
│   │   ├── page.tsx             Renders one of 4 role views based on session.roleName
│   │   └── _components/          expert-/fresher-/institution-/startup-profile-view.tsx
│   │
│   └── (events)/               Nested group — event management
│       ├── layout.tsx            Wraps <EventsShell>; redirects non-admins from /my-organized-events; warms lookup caches
│       ├── my-events/page.tsx     Attendee's own tickets (upcoming/past), via useMyTickets()
│       └── my-organized-events/
│           ├── page.tsx            Organizer's event list (draft/published), via useEvents()
│           ├── new/page.tsx         <EventWizard mode="create">
│           ├── _components/          event-wizard.tsx + 7 step-*.tsx files
│           └── [id]/
│               ├── page.tsx           Tabs: Overview/Attendees/Live/Communication, cancel-event modal
│               ├── edit/page.tsx       Loads event+timeline, <EventWizard mode="edit">
│               └── _components/        overview-/attendees-/live-/communication-tab, registration-trend-chart, status-maps.ts
│
├── (auth)/                    Route group — guest-only
│   ├── layout.tsx               GoogleOAuthProvider + <GuestShell>
│   ├── sign-in/page.tsx           Form inside a <Modal> (also the intercepted modal target)
│   ├── sign-up/page.tsx            <SignUpFlow> in Suspense (multi-step)
│   ├── forgot-password/page.tsx     Calls requestPasswordReset
│   ├── reset-password/page.tsx       <ResetPasswordForm> in Suspense
│   └── _components/                    auth-card, google-button, otp-input, sign-in-form, sign-up-flow,
│                                          step-account-details, step-select-stakeholder, step-verify-otp, reset-password-form
│
├── (public)/                  Route group — public
│   ├── page.tsx                 "/" → server-side redirect("/events")
│   └── events/
│       ├── layout.tsx             Wraps <EventsShell>, session optional
│       ├── page.tsx                 Listing: hero, featured carousel, filters/search, upcoming/past grids
│       └── [id]/
│           ├── layout.tsx             generateMetadata() — SERVER fetch getEvent(id) for OG/Twitter tags
│           ├── page.tsx                 Event detail: booking card, agenda, eligibility/terms, share card
│           ├── additional-info/page.tsx  Post-registration audio submission (PARTICIPANT category, 24h deadline)
│           ├── register/page.tsx          Guest/session registration, Cashfree checkout (Razorpay legacy), OTP email verification
│           ├── registered/page.tsx         Confirmation: QR ticket, booking reference
│           ├── rate/page.tsx                Live rating (Casual reactions / Competitive 0-10) via SSE
│           ├── scoreboard/page.tsx           Public scoreboard via SSE + floating emoji animation
│           └── _components/                   event-hero, event-details-card, event-overview-card, event-agenda-card,
│                                                 event-links-card, eligibility-terms-card, organizer-card, share-event-card,
│                                                 registration-card, detail-item, event-detail-skeleton, format.ts, +
│                                                 register/_components, registered/_components
│
├── @modal/                     Parallel route slot — intercepting-route modal layer
│   ├── default.tsx               Fallback (null)
│   ├── page.tsx                    Slot's own "/" (null)
│   ├── [...catchAll]/page.tsx       Catch-all (null)
│   ├── (.)sign-in/page.tsx           Intercepts /sign-in as overlay
│   ├── (.)sign-up/page.tsx            Intercepts /sign-up as overlay
│   └── (.)forgot-password/page.tsx     Intercepts /forgot-password as overlay
│
└── api/                         Route Handlers — see table below
```

## API routes (`route.ts`)

All under `src/app/api/`, all `params: Promise<{ id: string }>` typed manually.

| Endpoint | Method | File | Purpose |
|---|---|---|---|
| `/api/participants/[id]/audio-submission` | POST | `api/participants/[id]/audio-submission/route.ts` | Direct small-file audio upload → OCI Object Storage → `submitParticipantAudio` |
| `/api/participants/[id]/audio-submission/multipart/start` | POST | `.../multipart/start/route.ts` | Begins OCI multipart upload, returns `uploadId` |
| `/api/participants/[id]/audio-submission/multipart/part` | POST | `.../multipart/part/route.ts` | Uploads one part (`x-upload-id`/`x-part-number` headers), returns `etag` |
| `/api/participants/[id]/audio-submission/multipart/complete` | POST | `.../multipart/complete/route.ts` | Commits multipart upload, then `submitParticipantAudio` |
| `/api/participants/[id]/audio-submission/multipart/abort` | POST | `.../multipart/abort/route.ts` | Best-effort abort/cleanup of in-progress multipart upload |
| `/api/server-time` | GET | `api/server-time/route.ts` | Server clock ISO timestamp — trusted "has event ended" check instead of browser clock |
| `/api/events/[id]/live-performer/stream` | GET | `api/events/[id]/live-performer/stream/route.ts` | SSE — polls ORDS every 2s, pushes on state change + 15s heartbeat |
| `/api/events/[id]/reactions/stream` | GET | `api/events/[id]/reactions/stream/route.ts` | SSE — polls every 700ms for new (append-only) reactions + simulated bot reactions |

Both SSE routes are hand-rolled `ReadableStream` + `text/event-stream` responses — no WebSocket infrastructure in the repo. `live-performer/stream` backs `rate/page.tsx` and `scoreboard/page.tsx`; `reactions/stream` backs the same via `EventSource` on the client.

## Data-fetching summary

- **No server actions**, **no DB/ORM** — everything domain-related goes through `src/lib/api/client.ts` (`apiRequest<T>()`) to an Oracle ORDS endpoint (`API_BASE_URL`, overridable via `NEXT_PUBLIC_API_BASE_URL`).
- **One true server-side fetch**: `generateMetadata()` in `(public)/events/[id]/layout.tsx`.
- **Route Handlers as backend-for-frontend**: the audio-submission routes exist specifically so OCI credentials never reach the client (`src/lib/oci/object-storage.ts` is server-only, explicitly commented as such).
- **Payments**: Cashfree order creation/verification goes through `apiRequest` (`src/lib/api/payments.ts`), Cashfree checkout SDK loaded client-side (`src/lib/payments/cashfree.ts`); the gateway is chosen by `src/lib/payments/provider.ts` (Cashfree default, Razorpay legacy path in `razorpay.ts`).
