# Phase 5 ADR Execution Log

Version: `1.0`  
Phase: `ADR-004 Bootstrap`  
Execution Mode: `Strictly Sequential`  
Status: `Completed`

## 1. Phase Objective

This phase creates the fourth concrete architecture decision record required by the engineering handbook.

Current phase deliverable:

- `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`

This phase must not start the next ADR until:

1. the current ADR is created
2. the current ADR is validated
3. the results are documented
4. approval is requested for the current phase deliverable

## 2. Pre-Flight Checks

### Inputs Reviewed

- `ENGINEERING_HANDBOOK.md`
- `docs/adr/ADR_TEMPLATE.md`
- `docs/adr/ADR-001-adopt-modular-monolith.md`
- `docs/adr/ADR-002-adopt-nextjs-app-router.md`
- `docs/adr/ADR-003-adopt-cloudflare-r2-for-assets.md`
- `docs/architecture/authentication-backend-slice.md`
- current repository structure

### Validation Results

- handbook explicitly lists `ADR-004: Adopt PostgreSQL as primary source of truth`
- handbook section `5.5` already states PostgreSQL is the primary source of truth
- the ADR template remains reusable and valid
- `ADR-001`, `ADR-002`, and `ADR-003` are already completed and approved
- the phase that produced `ADR-003` was approved before this phase began
- no conflicting `ADR-004` file exists
- the identity slice already implements this decision, so the ADR records existing reality rather than proposing new work

### Current Task Standard

The current ADR must:

- use the repository ADR template structure
- align with the modular monolith boundary model already accepted
- align with the handbook data layer standards already documented
- explain why PostgreSQL is the primary source of truth now
- explain why an in-memory store and a document database are not the current default
- state the conditions under which the memory driver is acceptable
- include rollout, success criteria, and rollback/exit strategy

### Completion Criteria

The current phase deliverable is complete only when:

- the ADR file exists
- the ADR content is project-specific and non-placeholder
- the ADR passes diagnostics
- the outcome is documented in this phase log
- approval is requested before the next ADR or phase begins

## 3. Execution Log

### Step 1: Pre-flight

- Status: `Passed`
- Findings:
  - `ADR-004` is the next logical decision after `ADR-003` because it defines where durable application state lives
  - the identity slice has already shipped a migration, pool configuration, and a verification script against PostgreSQL
  - the code defaults to an `auto` driver that silently falls back to memory when `DATABASE_URL` is absent
  - recording this decision now converts an implicit implementation choice into an approved standard

### Step 2: ADR-004 implementation

- Status: `Passed`
- Artifact created:
  - `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
- Findings:
  - the ADR is specific to Okkhor rather than generic database advice
  - it names the concrete artifacts already in the repository rather than describing hypothetical future work
  - it defines PostgreSQL as the source of truth for durable state while explicitly excluding assets, cache, and vectors
  - it states that the memory driver is acceptable only for local development and tests
- Resolved issues:
  - removed ambiguity about whether the in-memory store could serve real environments
  - made migration-first schema discipline an explicit standard instead of an implied preference
  - documented the silent fallback to memory as a known risk with a rollout item to make it a hard failure

### Step 3: ADR-004 validation

- Status: `Passed`
- Validation results:
  - file exists in `docs/adr/`
  - content follows the ADR template structure
  - content aligns with handbook sections `2.4`, `3.3`, `4.2`, `5.5`, and `16`
  - diagnostics check returned no issues
- Outcome:
  - current phase deliverable satisfies the defined execution standard and completion criteria

### Step 4: Approval request

- Status: `Approved` (2026-11-27)
- Approval required before:
  - creating `ADR-005`
  - provisioning and verifying PostgreSQL for the identity slice based on this ADR

### Step 5: Local PostgreSQL provisioning

- Status: `Passed`
- Artifact created:
  - `infrastructure/docker-compose.yml`
- Findings:
  - provisions `postgres:17-alpine` on `localhost:5432` with database `okkhor`, a named volume, and a healthcheck
  - the container reaches `healthy` and `pg_isready` accepts connections
  - `docs/configuration.md` documents the start, stop, and data-reset commands

### Step 6: Identity migration on a live instance

- Status: `Passed`
- Findings:
  - `npm run db:migrate` applies `20260718222000_create_auth_identity_tables` against the live instance
  - two silent failures in the migration tooling were fixed: the config file used camelCase keys that `node-pg-migrate` v9 ignores, and `--envPath` depends on an uninstalled `dotenv`, so migrations were recorded in the default `pgmigrations` table instead of `schema_migrations`
  - the corrected config and a `node --env-file=.env.local` invocation record versions in `schema_migrations` as intended

### Step 7: PostgreSQL full-link verification

- Status: `Passed`
- Findings:
  - `npm run db:verify:postgres` passes against the live instance
  - it verifies connectivity, the four required tables, table privileges, CRUD, transactional rollback, and connection-pool reuse

### Step 8: Durable driver default and configuration

- Status: `Passed`
- Findings:
  - `getAuthRepository()` no longer falls back to the in-memory store outside tests; a missing `DATABASE_URL` is now a hard failure
  - the example environment defaults `AUTH_STORAGE_DRIVER` to `postgres`
  - `README.md`, `docs/configuration.md`, and `docs/architecture/authentication-backend-slice.md` document the new default
  - a runtime smoke test registered and logged in a user through the app against PostgreSQL, with the identity row and sessions persisted
- Outcome:
  - `ADR-004` rollout items 2 through 6 are satisfied against a local instance
