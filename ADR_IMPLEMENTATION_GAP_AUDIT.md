# ADR Implementation Gap Audit

Project: `Journal Club Asia / Okkhor`
Date: `2026-11-28`
Scope: `ADR-001` through `ADR-009`
Status: `Completed`

## 1. Purpose

All nine ADRs in the initial backlog are `Accepted`, but an accepted decision is not
the same as a shipped one. This audit establishes, per ADR, what is implemented, what is
partially implemented, and what is deliberately deferred, so the next work item can be
chosen from evidence rather than assumption.

## 2. Method

- Read each ADR in `docs/adr/` and extracted its decision, rollout plan, and validation criteria.
- Inspected the repository for concrete evidence: module tree (`src/modules/**`), routes (`app/**`),
  migrations, infrastructure, configuration, tests, and docs.
- Each status below is backed by a file path. Where no evidence exists the item is recorded as
  `not started`; nothing is assumed to be complete without a path.

## 3. Summary

| ADR | Decision | Implementation status | Actionable now? |
|---|---|---|---|
| 001 | Adopt modular monolith | `Implemented` — documentation gap only | Yes (docs) |
| 002 | Adopt Next.js App Router | `Implemented` — documentation gap only | Yes (docs) |
| 003 | Adopt Cloudflare R2 for assets | `Not started` — deferred by design | No |
| 004 | Adopt PostgreSQL as source of truth | `Implemented` | n/a |
| 005 | Adopt Redis for cache and ephemeral state | `Implemented` | n/a |
| 006 | Adopt Qdrant for semantic discovery | `Not started` — deferred by design | No |
| 007 | Adopt offline-first where client context requires it | `Not started` — deferred by design | No |
| 008 | Adopt calendar-aware predictive operations | `Not started` — first step is actionable | Yes |
| 009 | Adopt phone-first identity and icon-driven NBU UX | `Implemented` | n/a |

No ADR is blocked by an unbuilt prerequisite. The only gaps that can be closed today are
documentation (ADR-001, ADR-002) and the first recorded step of ADR-008.

## 4. Findings per ADR

### ADR-001 — Modular monolith

- Status: `Implemented`, with a documentation gap.
- Evidence: domain-oriented modules exist as separate directories rather than a flat
  technical-layer tree — `src/modules/identity/` (`api`, `application`, `client`, `domain`,
  `infrastructure`, `ui`), `src/modules/platform/` (`domain`, `infrastructure`), and
  `src/modules/experience/`. A single Next.js deployable is defined in `package.json`.
- Gap: `docs/architecture/README.md` lists `system-overview.md`, `module-boundaries.md`,
  `api-contracts.md`, and `data-models.md` under "Expected Future Additions"; none exist yet.

### ADR-002 — Next.js App Router

- Status: `Implemented`, with a documentation gap.
- Evidence: App Router structure is in place — `app/layout.tsx`, `app/page.tsx`,
  `app/auth/page.tsx`, `app/community/page.tsx`, `app/scholar-verify/page.tsx`, and
  `app/api/**/route.ts`. Pages are server components; the four interactive components carry a
  `"use client"` directive (`src/modules/identity/ui/auth-page-shell.tsx`,
  `protected-workspace-shell.tsx`, `phone-auth-flow.tsx`, `credential-auth-panel.tsx`).
- Gap: there is no document stating the server-vs-client component usage rules.

### ADR-003 — Cloudflare R2 for assets

- Status: `Not started` — deliberately deferred (no asset workload exists).
- Evidence of absence: no storage/assets/r2/object-storage module under `src/modules/`;
  no S3-compatible client in `package.json` dependencies; no `R2_*`/`BUCKET_*` variables in
  `.env.example`; no upload/download/presign routes (the only routes are the auth routes and
  `app/api/health/route.ts`); no asset documentation in `docs/architecture/` or
  `docs/configuration.md` (no R2/bucket/asset references).
- Note: this matches the ADR's incremental rule. Nothing should be built until a concrete
  media/asset workload is named.

### ADR-004 — PostgreSQL as primary source of truth

- Status: `Implemented`.
- Evidence: `migrations/20260718222000_create_auth_identity_tables.cjs` creates
  `auth_users`, `auth_sessions`, and `auth_password_resets`; `node-pg-migrate.config.cjs` sets
  `"single-transaction": true`; `scripts/verify-postgres-auth.ts` backs the
  `db:verify:postgres` script; `src/modules/identity/infrastructure/postgres-config.ts`
  configures the pool; `infrastructure/docker-compose.yml` provides the local instance with the
  `okkhor-postgres-data` volume; a missing `DATABASE_URL` outside tests is a hard failure in
  `src/modules/identity/infrastructure/auth-repository.ts`; variables are documented in
  `.env.example` and `docs/configuration.md`.

### ADR-005 — Redis for cache and ephemeral state

- Status: `Implemented`.
- Evidence: boundary at `src/modules/platform/infrastructure/ephemeral-store.ts`; first workload
  at `src/modules/identity/application/auth-rate-limit.ts`; enforcement wired into
  `app/api/auth/login/route.ts`, `app/api/auth/register/route.ts`, and
  `app/api/auth/password-reset/request/route.ts`; redis service with persistence disabled in
  `infrastructure/docker-compose.yml`; `EPHEMERAL_STORAGE_DRIVER` and `REDIS_URL` documented in
  `.env.example` and `docs/configuration.md` (which also records key namespacing and TTL rules);
  tests in `tests/unit/ephemeral-store.test.ts`, `tests/unit/auth-rate-limit.test.ts`, and
  `tests/integration/auth-routes.test.ts`.

### ADR-006 — Qdrant for semantic discovery

- Status: `Not started` — deliberately deferred.
- Evidence of absence: no search or recommendation module under `src/modules/`; no Qdrant or
  pgvector dependency in `package.json`; no qdrant service in `infrastructure/docker-compose.yml`;
  no qdrant references anywhere in `src/` or `app/`.

### ADR-007 — Selective offline-first

- Status: `Not started` — deliberately deferred.
- Evidence of absence: no service worker, `manifest.json`, PWA dependency, IndexedDB, or local
  write queue in `src/`, `app/`, or `next.config.ts`.

### ADR-008 — Calendar-aware predictive operations

- Status: `Not started`; the ADR's own first step is actionable now.
- Evidence of absence: no calendar, readiness, timezone, or recurrence code in `src/`; no
  calendar-related migration; no readiness runbook in `docs/runbooks/` (which currently holds only
  `INCIDENT_POSTMORTEM_TEMPLATE.md` and `README.md`).
- Partial: `.github/ISSUE_TEMPLATE/operational_task.yml` exists, but the calendar model and the
  readiness checklist that the ADR's first rollout step requires are not recorded in durable,
  reviewable form.

### ADR-009 — Phone-first identity and icon-driven NBU UX

- Status: `Implemented`.
- Evidence: phone-first schemas in `src/modules/identity/domain/auth-schemas.ts`
  (`phoneNumber` required; `locale` defaults to `bn-BD`); phone utilities in
  `src/modules/identity/domain/phone-auth.ts`; OTP flow UI in
  `src/modules/identity/ui/phone-auth-flow.tsx`; default sign-in surface at `app/auth/page.tsx`;
  the migration stores `phone_number` as `notNull` + `unique` and `locale` as `notNull`;
  icon-driven navigation with a persistent quick logout in `src/modules/experience/ui.tsx`
  (`Icon`, `AppSidebar`); implementation guide at
  `docs/architecture/nbu-ux-and-phone-first-identity.md`; rate limiting protects the phone auth
  routes; tests in `tests/unit/phone-auth.test.ts` and `tests/integration/auth-page.test.tsx`.

## 5. Gaps that can be closed now

1. **Architecture documentation (ADR-001, ADR-002).** Write `docs/architecture/module-boundaries.md`
   (and, as the index already promises, `system-overview.md`, `api-contracts.md`, `data-models.md`),
   plus a short server-vs-client component rules document. These are already declared as expected
   additions in `docs/architecture/README.md` and unblock contributor onboarding.
   - **Closed.** Written as `docs/architecture/system-overview.md`, `module-boundaries.md`,
     `api-contracts.md`, `data-models.md`, and `server-vs-client-components.md`; the index in
     `docs/architecture/README.md` was updated to list them.
2. **ADR-008 first recorded step.** Record the calendar model (window, region, recurrence,
   confidence, impact, default timezone) and the readiness checklist in durable, reviewable form,
   and add readiness-runbook structure to `docs/runbooks/`. This is the ADR's own first step and is
   not blocked by anything.

## 6. Deferred by design — do not start yet

These are correct as `Not started`. Each ADR explicitly requires a concrete workload or named
journey before any implementation, so building them now would violate the decisions:

- **ADR-003 (R2)** — until a media/asset workload exists.
- **ADR-006 (Qdrant)** — until a semantic discovery workload exists.
- **ADR-007 (offline-first)** — until a specific journey is named and justified in a design document.

## 7. Recommended next work

Based on the evidence above, the lowest-risk, unblocked next item is **architecture documentation
for ADR-001 and ADR-002** (Section 5.1): it is already promised by the docs index, requires no
infrastructure, and improves contributor onboarding. **ADR-008's first recorded step** (Section 5.2)
is the natural follow-on. The ADR-003/006/007 items should stay deferred until their trigger
workloads appear.
