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
- member profile pages — the owner's `/profile` and a public footprint at `/u/[id]`
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

## 6. Request Lifecycle

1. **Edge middleware** (`middleware.ts`) runs for the protected matchers
   (`/community/:path*`, `/scholar-verify/:path*`, `/library/:path*`, `/profile/:path*`). It
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

Middleware is intentionally thin: it only gates routes. Authorization that depends on
business state is enforced inside the application layer (`ADR-001`: authorization rules must
be enforced at server boundaries inside the monolith).

## 7. Module Map

| Module | Location | Responsibility | Status |
| --- | --- | --- | --- |
| `identity` | `src/modules/identity/**` | Registration, login, sessions, password reset, route protection | Implemented |
| `platform` | `src/modules/platform/**` | Runtime status/highlights and the cross-cutting ephemeral store | Implemented |
| `experience` | `src/modules/experience/**` | Public site content and presentational/UI building blocks | Implemented |
| `content` | `src/modules/content/**` | Research-item comprehension: published list/detail read path | Implemented (read path) |
| `library` | `src/modules/library/**` | Per-member saved research items ("My Library") | Implemented |

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
