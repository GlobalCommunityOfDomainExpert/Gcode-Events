# Components & Design System Reference

`src/components/` is the shared GCODE design-system component library (atoms → molecules → layout), imported via barrel files (`index.ts` in each folder). Route-local, non-shared UI lives instead under each route's `_components/` folder (see [Routing & API](/routing-reference)). Design tokens and per-component spec docs live in `.claude/skills/gcode-design-system/` and map 1:1 to the component names below.

## Atoms (`src/components/atoms/`)

25 lowest-level primitives: avatar, badge, blurred, booking-ref, **button**, button-link, **card**, checkbox, divider, icon, input, label, link, **password-input**, progress, qr-placeholder, radio, **remove-icon-button**, section-label, select, skeleton, spinner, switch, textarea, tooltip.

- `button.tsx` defines `ButtonVariant` (primary/secondary/outline/ghost/danger/danger-ghost/success/warning/accent) and `ButtonSize` (xs–xl) via a shared `buttonClasses()` helper.
- `card.tsx` is a minimal surface primitive (`padding`: sm/md/lg, `isDark` prop).
- **No Storybook story**: `card.tsx`, `password-input.tsx`, `remove-icon-button.tsx`. All other 22 atoms have one.

## Molecules (`src/components/molecules/`)

43 composite components: accordion, add-item-button, **audio-recorder**, avatar-group, banner, breadcrumb, bulk-action-bar, carousel, certification-card, checklist-item, checkout-summary, chip, chip-list-field, dropdown, empty-state, **event-badge-row**, event-card, expert-card, external-link-row, form-field, form-section-heading, media-upload-fields, modal, **not-found-state**, notification-item, pagination, **password-strength-meter**, problem-card, **profile-menu**, profile-header, profile-section-card, quote-block, role-cta, search-bar, selectable-card, stat-card, static-info-card, step-indicator, table, tabbed-form-shell, tabs, timeline, toggle-group.

- `role-cta.tsx` is the role-based-variant CTA — takes `title/description/actionLabel/onAction`, composed by role-specific callers rather than branching internally.
- **No Storybook story**: `audio-recorder.tsx`, `event-badge-row.tsx`, `not-found-state.tsx`, `password-strength-meter.tsx`, `profile-menu.tsx`. The remaining 38 have one.

## Layout (`src/components/layout/`)

8 shell/chrome components: app-shell, ask-ai-button, **authed-shell**, **events-shell**, **footer**, **guest-shell**, navbar, sidebar.

- **No Storybook story**: `authed-shell`, `events-shell`, `footer`, `guest-shell`. Only `app-shell`, `ask-ai-button`, `navbar`, `sidebar` have one.

> Bolded names above have no `.stories.tsx` under `.storybook/stories/`. Since Storybook interaction tests are this project's only test layer (see [Tooling & Config](/tooling-reference)), these components currently have **zero automated coverage**.

## Role/variant composition pattern

The codebase's role vocabulary is `expert | fresher | startup | institution` (event-platform stakeholder roles) — reused consistently, never duplicated per-role at the layout level:

- **Profile views**: `src/app/(app)/profile/_components/{expert,fresher,institution,startup}-profile-view.tsx` — each is a thin composition of shared molecules (`ProfileHeader`, `ProfileSectionCard`, `Timeline`, `ExternalLinkRow`, `QuoteBlock`, `Badge`), only role-specific *data* varies. Resolved once in `src/app/(app)/profile/page.tsx` via `session.roleName` against `STAKEHOLDER_ROLES`.
- **Sign-up role picker**: `src/app/(auth)/_components/step-select-stakeholder.tsx` defines the same 4-role `StakeholderRole` type, renders one shared `SelectableCard` molecule per role.
- **Event wizard**: `my-organized-events/_components/step-*.tsx` (event-type, details, schedule-mode, registration, timeline-links, terms, review) — separate step files driven by one shared wizard shell + Zustand store (`src/lib/store/wizard-store.ts`) + Zod schema (`src/lib/zod/event.ts`), not one monolithic form.
- **Auth flow**: `sign-up-flow.tsx` orchestrates `step-account-details`, `step-select-stakeholder`, `step-verify-otp` behind one shared `auth-card.tsx` shell — same step-composition pattern as the event wizard.
- **Event dashboard tabs**: `my-organized-events/[id]/_components/{overview,attendees,live,communication}-tab.tsx` share one page shell, swap content per tab.

Attendee-level role typing is separate and slightly different: `AttendeeRole` in `src/lib/attendees.ts` is `"Fresher" | "Startup Founder" | "Domain Expert" | "Institution" | "Guest"`.

## Styling: Tailwind v4 token pipeline

No `tailwind.config.js/ts` exists — config is CSS-first via `postcss.config.mjs` (`@tailwindcss/postcss` plugin) and `src/app/globals.css`:

1. `@import "tailwindcss";` — Tailwind v4 entry point.
2. `:root` block — raw GCODE design tokens as CSS custom properties: `--g-color-*` (primary/secondary/success/warning/danger + light/hover/bg/surface/text/border variants), `--g-radius-*` (sm/md/lg/full), `--g-shadow-*` (inner/sm/md/lg), `--g-space-*` (xs–xl). Comments cross-reference `.claude/skills/gcode-design-system/tokens/*.md`.
3. `@theme inline` block — maps raw tokens into Tailwind's theme namespace (`--color-primary`, `--radius-md`, `--shadow-lg`, `--text-heading`, etc.), making utilities like `bg-primary`/`rounded-md`/`shadow-lg` resolve to GCODE tokens instead of Tailwind defaults. Includes a typography scale (`--text-small` … `--text-display`) whose rem values are noted in-code as inferred, not sourced from `foundations/typography.md`.
4. One hand-written `@keyframes float-emoji-rise` + `.float-emoji` class — powers the live scoreboard's floating emoji reactions.

No CSS Modules anywhere in `src/` — styling is entirely Tailwind utilities + this token layer.

**Known gap**: `--g-color-warning` / `--g-color-danger` are flagged in-code as "undocumented in tokens/colors.md — placeholder pending design confirmation."

## Hooks (`src/hooks/`)

| Hook | Purpose |
|---|---|
| `use-attendees.ts` | Participant list for one event (`listParticipants`/`adaptParticipant`) |
| `use-click-outside.ts` | Generic outside-click detector |
| `use-controllable-state.ts` | Controlled/uncontrolled value helper for form-ish molecules |
| `use-event.ts` | One event + lookups (types/modes/statuses), adapted to UI shape |
| `use-events.ts` | Event list + lookups, adapted to UI shape |
| `use-lookup.ts` | Generic cached-lookup-fetcher wrapper |
| `use-mounted.ts` | SSR-safe hydration flag (`useSyncExternalStore`) |
| `use-my-tickets.ts` | Current user's registrations from `/participants/mine` |
| `use-server-now.ts` | Clock synced to server-time offset |
| `use-session.ts` | Auth session from localStorage, SSR-safe (`useSyncExternalStore`) |

## Lib helpers (`src/lib/`)

| Area | Files | Purpose |
|---|---|---|
| Domain types | `attendees.ts`, `communications.ts`, `event.ts` | `Attendee`/`AttendeeRole`, `CommunicationLog`, `Event`/`EventType` + tone-mapping |
| Utilities | `csv.ts`, `download.ts`, `event-color.ts` | CSV export, blob-download trigger, deterministic color-from-string hashing |
| Time | `server-time.ts` | Fetches `/api/server-time`, computes clock offset for `useServerNow` |
| API | `api/client.ts`, `api/adapters.ts`, `api/{auth,events,lookups,participants,payments,ratings}.ts`, `api/types.ts` | REST client, DTO→UI adapters, per-resource fetchers, raw DTO types |
| Auth | `auth/format.ts`, `auth/hash-password.ts`, `auth/password-strength.ts`, `auth/session.ts`, `auth/use-google-id-token.tsx` | Avatar initials, client-side SHA-256 hashing, password rules, session/JWT, Google OAuth bridge |
| Storage | `oci/object-storage.ts` | Server-only OCI Object Storage client (explicit "never import from client components" warning) |
| Payments | `payments/cashfree.ts` | Cashfree checkout loader + wrapper (default gateway) |
| Payments | `payments/razorpay.ts` | Razorpay checkout request/response types + wrapper (legacy, selectable via env) |
| Payments | `payments/provider.ts` | Build-time gateway switch, Cashfree default |
| Live | `reactions/bot-simulator.ts` | Simulated scoreboard reactions, rate scaled by `sqrt(registeredCount)` |
| Forms | `store/wizard-store.ts`, `zod/event.ts` | Zustand event-wizard state (devtools middleware), Zod schema backing it |
