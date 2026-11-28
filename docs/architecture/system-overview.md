# System Overview

- Status: `Active`
- Related ADRs: `ADR-001`, `ADR-002`
- Owner: `Engineering Lead`

## 1. Purpose

Describe the shape of the `Journal Club Asia / Okkhor` system: what is deployed, how a
request flows through it, which modules exist, and which supporting decisions govern the
whole. This is the entry point for new contributors and the map that the other architecture
documents expand on.

## 2. What the System Is

`Okkhor` is a multilingual, AI-assisted research comprehension platform aimed at South Asian
users on low-end Android devices and unstable networks. The web product is built as a single
Next.js application that renders a Bangla-first public experience, a phone-first identity
surface, and (later) authenticated learner and scholar workspaces.

At the current stage the deployed product is intentionally narrow:

- a public landing experience (`/`)
- a phone-first authentication surface (`/auth`)
- two protected placeholders (`/community`, `/scholar-verify`)
- a public research-comprehension read path (`/content`, `/content/[id]`)
- a per-member "My Library" (`/library`) over saved research items
- a per-member notifications inbox (`/notifications`) over moderation, report, reply, and
  verification-decision outcomes
- member profile pages — the owner's `/profile` and a public footprint at `/u/[id]`
- an administrator moderation console (`/admin/community`) over the discussion surface
- a member report path over threads and replies, with an administrator triage queue
  (`/admin/community/reports`)
- an administrator console overview (`/admin`) that indexes the moderation, report, and
  verification queues with figures counted from the records
- an administrator scholar roster (`/admin/scholars`) over the verification record — the verified
  scholars and the applications still awaiting a decision, each counted from its own credentials
- an administrator analytics canvas (`/admin/analytics`) charting the real distributions — research
  by topic, visible threads by category, and applications by status
- an administrator member roster (`/admin/users`) over the identity record — every member, the roles
  they hold, and when they last signed in, projected without contact points or credentials
- an administrator system configuration surface (`/admin/settings`) that reports the configuration
  the process resolves — the runtime status, the session and reset-code lifetimes, and the auth
  attempt budgets — and edits nothing, because the platform persists no settings
- an administrator AI summarization surface (`/admin/ai`) that reports the summarization provider
  the process resolves — the driver, the resolved provider, the model, the request timeout, and
  whether the API key is set — together with how much of the archive carries a Bangla summary, and
  runs no pipeline
- an administrator content register (`/admin/content`) listing every research item in the archive
  with its classification, status, and summary state, filterable by status, read-only
- an administrator communications surface (`/admin/communications`) reporting the delivery channels
  a member notification resolves to — the driver, the resolved channels, and whether each gateway is
  configured — and the outcomes the platform sends, read-only
- browse surfaces — a public topics index (`/topics`) with research-by-tag (`/tags/[tag]`)
  and members-only threads-by-category (`/categories/[category]`)
- JSON APIs for identity and content, and a health probe

Deeper domains named in `ADR-001` (Video Processing, Video Delivery, Search,
Recommendations, Rules Engine, Localization, Analytics, Operational Intelligence) are
**not yet implemented**. They are planned and will be added as modules under the same
architecture, not as separate deployments.

## 3. Architecture Style

The system is a **modular monolith** (`ADR-001`): one primary deployable application with
explicit internal module boundaries and in-process communication. Extracting a service is a
future option justified only by measured pain (independent scale, deployment risk, or
ownership cadence), never by architectural fashion.

The practical consequences that are visible in the code:

- code is organized **by domain module** under `src/modules/**`, not by technical layer alone
- each module layers itself as `domain` → `application` → `infrastructure` → `api` → `ui`
- cross-module access goes through a module's public functions, not into its internals
- one Next.js build produces the whole web app + API surface

See [module-boundaries.md](module-boundaries.md) for the layering rules and dependency
direction, and `docs/adr/ADR-001-adopt-modular-monolith.md` for the decision record.

## 4. Technology Baseline

| Concern | Choice | Reference |
| --- | --- | --- |
| Application framework | Next.js (App Router), TypeScript | `ADR-002` |
| Rendering model | Server components by default | `ADR-002`, [server-vs-client-components.md](server-vs-client-components.md) |
| Primary datastore | PostgreSQL | `ADR-004` |
| Cache / ephemeral state | Redis (optional, degrades to in-memory) | `ADR-005` |
| Runtime entry | Next.js route handlers (`runtime = "nodejs"`) + middleware | this repo |
| Asset storage | Cloudflare R2 (planned, not yet adopted in code) | `ADR-003` |
| Semantic discovery | Qdrant (planned, not yet adopted in code) | `ADR-006` |
| Offline behaviour | Offline-first where client context requires it (planned) | `ADR-007` |
| Identity model | Phone-first identity, icon-driven NB-UX | `ADR-009` |
| Runtime config | `next.config.ts` → `reactStrictMode: true` | this repo |

## 5. Runtime Topology

```
                    ┌─────────────────────────────────────────────┐
   Browser  ──────► │  Next.js application (modular monolith)      │
   (low-end         │  ┌────────────┐   ┌──────────────────────┐   │
    Android)        │  │ middleware │──►│ app/ routes & pages  │   │
                    │  └────────────┘   └──────────┬───────────┘   │
                    │                              │               │
                    │                   ┌──────────▼───────────┐   │
                    │                   │ src/modules/**       │   │
                    │                   │  identity            │   │
                    │                   │  platform            │   │
                    │                   │  experience          │   │
                    │                   │  content             │   │
                    │                   │  library             │   │
                    │                   └──────┬───────┬───────┘   │
                    └──────────────────────────┼───────┼───────────┘
                                               │       │
                        ┌──────────────────────▼─┐   ┌─▼───────────────────┐
                        │ PostgreSQL (primary)   │   │ Redis (optional)    │
                        │ auth_users,            │   │ rate-limit counters │
                        │ auth_sessions,         │   │ (degrades to memory)│
                        │ auth_password_resets,  │   └─────────────────────┘
                        │ content_items,         │
                        │ saved_items            │
                        └────────────────────────┘
```

Both backing stores are **optional at boot**:

- **PostgreSQL** is selected when `DATABASE_URL` is present (`AUTH_STORAGE_DRIVER=auto`).
  Without it, and outside tests, the app fails fast with a misconfiguration error.
- **Redis** is selected when `REDIS_URL` is present (`EPHEMERAL_STORAGE_DRIVER=auto`).
  Without it the app still runs, using an in-process counter store.

The driver-selection pattern is shared across both boundaries (see
[data-models.md](data-models.md) §5).

The password-reset flow adds one **outbound** dependency beyond the diagram: the `platform`
notification channels POST to the configured SMS/email gateways. Delivery is optional — `auto`
degrades to the dev/test `log` channel (see [data-models.md](data-models.md) §5.11,
[password-reset-delivery-slice.md](password-reset-delivery-slice.md) §9). The `notifications`
slice reuses that same outbound path: a moderation outcome (a hidden thread/reply, or a closed
report), a new reply, or a scholar verification decision, is persisted to the recipient's inbox and
delivered through the same channels, again best-effort ([notifications-slice.md](notifications-slice.md)
§8, §9.2; [reply-notifications-slice.md](reply-notifications-slice.md) §8, §9;
[verification-notifications-slice.md](verification-notifications-slice.md) §7, §8).

The **unread-badge slice** adds a small **read surface** on top of that inbox: the shared workspace
shell (`identity` `ProtectedWorkspaceShell`) fetches the caller's unread count from
`GET /api/notifications/unread-count` and passes it to `experience`'s `AppSidebar`, which renders a
count badge on the `Notifications` entry — visible on every protected page. The count is read once
on load and re-read after a mark-read (a `okkhor:inbox-changed` window event); it is never polled,
adds no table or migration, and is best-effort chrome that degrades to "no badge"
([unread-badge-slice.md](unread-badge-slice.md) §3, §8).

## 6. Request Lifecycle

1. **Edge middleware** (`middleware.ts`) runs for the protected matchers
   (`/community/:path*`, `/categories/:path*`, `/scholar-verify/:path*`, `/admin/:path*`,
   `/library/:path*`, `/notifications/:path*`, `/profile/:path*`). It
   verifies the access-token cookie at the edge and redirects to `/auth?next=…` when the token
   is missing or invalid.
2. **Route handler** (`app/api/**/route.ts`) or **server component** (`app/**/page.tsx`)
   runs on the Node.js runtime.
3. The handler/page calls into a **module's public surface** (for example
   `src/modules/identity/application/auth-service.ts`).
4. The module resolves its **infrastructure driver** (PostgreSQL or in-memory) lazily and
   returns plain domain data.
5. The route handler shapes the HTTP response; cookies are set via
   `src/modules/identity/api/auth-http.ts`.
6. The password-reset request additionally performs an **outbound delivery** step: the identity
   use case mints a 6-digit code and hands a `NotificationMessage` to the resolved `platform`
   notification channels (SMS always, email too when the account has one). The send is
   server-side only, so the neutral HTTP response is unchanged and the code never reaches the
   browser ([password-reset-delivery-slice.md](password-reset-delivery-slice.md) §7, §9).
7. A moderation outcome, a new reply, or a scholar verification decision additionally performs a
   **persist-then-deliver** step: the `notifications` slice writes a record to the recipient's inbox
   and hands a `NotificationMessage` to the same `platform` channels. The write happens first and the
   send is best-effort, so a failed gateway never changes the producer's response
   ([notifications-slice.md](notifications-slice.md) §7, §8;
   [reply-notifications-slice.md](reply-notifications-slice.md) §6, §7;
   [verification-notifications-slice.md](verification-notifications-slice.md) §7, §8).

Middleware is intentionally thin: it only gates routes. Authorization that depends on
business state is enforced inside the application layer (`ADR-001`: authorization rules must
be enforced at server boundaries inside the monolith). The administrator consoles follow the
same rule: the `/admin/community` layout resolves the viewer in the composition root
(`app/community-session.ts`) and renders the restricted screen unless `canModerate` passes,
and the moderation routes re-check the same admin-only gate server-side. The member report
path adds a member write surface on the thread page and an administrator triage queue at
`/admin/community/reports` behind the same gate; a filed report never changes a target's
visibility — only an explicit hide/restore action does
([member-reporting-slice.md](member-reporting-slice.md) §7).

## 7. Module Map

| Module | Location | Responsibility | Status |
| --- | --- | --- | --- |
| `identity` | `src/modules/identity/**` | Registration, login, sessions, password reset, route protection | Implemented |
| `platform` | `src/modules/platform/**` | Runtime status/highlights, the cross-cutting ephemeral store, and the notification channels (SMS/email/log) | Implemented |
| `experience` | `src/modules/experience/**` | Public site content and presentational/UI building blocks | Implemented |
| `content` | `src/modules/content/**` | Research-item comprehension: published list/detail read path | Implemented (read path) |
| `library` | `src/modules/library/**` | Per-member saved research items ("My Library") | Implemented |
| `notifications` | `src/modules/notifications/**` | Per-member inbox: persistence + best-effort delivery of moderation/report/reply/verification-decision outcomes | Implemented |

Planned domains (Search, Recommendations, Localization, Analytics, Video, Rules
Engine, Operational Intelligence) do not exist yet and must not be simulated ahead of a
triggering workload. See `ADR_IMPLEMENTATION_GAP_AUDIT.md` for the current per-ADR status.

## 8. Documentation Map

- [module-boundaries.md](module-boundaries.md) — layering, dependency rules, module contracts
- [api-contracts.md](api-contracts.md) — the HTTP surface, payloads, error envelope, cookies
- [data-models.md](data-models.md) — domain types and the PostgreSQL/memory persistence model
- [server-vs-client-components.md](server-vs-client-components.md) — rendering boundary rules
- [authentication-backend-slice.md](authentication-backend-slice.md) — identity deep dive
- [content-comprehension-slice.md](content-comprehension-slice.md) — the content read-path slice
- [nbu-ux-and-phone-first-identity.md](nbu-ux-and-phone-first-identity.md) — NB-UX and identity UX
- `docs/adr/` — the decision records this overview summarizes

## 9. Current Constraints and Non-Goals

- **Not a microservices system.** No inter-service network calls, message brokers, or
  service mesh are part of the design at this stage.
- **Not offline-first yet.** `ADR-007` is deferred until a client context that requires it
  exists.
- **Not a multi-region deployment.** Regional delivery concerns are noted in the ADRs but
  not implemented.
- **No asset pipeline yet.** `ADR-003` (R2) is deferred until the first real asset workload.

## 10. Recommended Next Step

The next architectural work should follow the triggers recorded per ADR rather than
speculation: adopt `ADR-008`'s first recorded step (calendar model + readiness checklist) as
the next planning artifact, and keep `ADR-003` / `ADR-006` / `ADR-007` deferred until their
workloads appear.
