# ADR-004: Adopt PostgreSQL as Primary Source of Truth

- Status: `Accepted`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap data persistence baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` must persist durable, relational, business-critical state. Even at the current stage, the product already has data that must survive a deploy and must be queryable across requests:

- user identities keyed by phone number
- sessions and refresh-token state
- password reset requests
- roles and locale preferences per user
- progress and enrolment state as content domains arrive

The already accepted ADRs constrain this decision:

- `ADR-001` establishes a modular monolith in which each domain owns its data and reaches it through a narrow repository boundary
- `ADR-002` establishes a server-first Next.js surface, so most reads and writes originate in server components and route handlers, not in the browser
- `ADR-003` keeps binaries out of the application, which means the application database should hold structured records only

The handbook is explicit that this decision is expected:

- `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent` lists `PostgreSQL` as primary source of truth
- `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram` connects the application to `PostgreSQL`
- `ENGINEERING_HANDBOOK.md` section `4.2 Local Setup Rules` requires database migrations to run before app startup
- `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards` states PostgreSQL is the primary source of truth and that there are no manual production schema changes outside migrations
- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` lists `ADR-004: Adopt PostgreSQL as primary source of truth`

The identity slice has already been implemented against this decision, which makes recording it now a correctness requirement rather than a forward-looking plan:

- `src/modules/identity/infrastructure/postgres-config.ts` reads `DATABASE_URL` and pool tuning variables
- `node-pg-migrate.config.cjs` defines a `schema_migrations` table, ordered checks, a single migration transaction, and fail-fast advisory locking
- `migrations/20260718222000_create_auth_identity_tables.cjs` creates `auth_users`, `auth_sessions`, and `auth_password_resets` with foreign keys and a supporting index
- `scripts/verify-postgres-auth.ts` verifies connectivity, schema presence, privileges, connection reuse, and CRUD within a transaction

One existing behaviour requires an explicit decision rather than an implicit default: `getAuthRepository()` resolves the storage driver to `auto`, and when `DATABASE_URL` is absent it silently falls back to the in-memory store. That fallback keeps local and test workflows frictionless, but in a real environment it would silently discard user data.

The key decision is what the primary source of truth is, and under what conditions the application is allowed to run without it.

## Decision

Adopt `PostgreSQL` as the primary source of truth for all durable application state.

This means:

- structured application records are written to PostgreSQL and read back from PostgreSQL
- each domain accesses its data through a repository boundary owned by that domain, not through ad hoc queries spread across the app
- all schema change happens through versioned `node-pg-migrate` migrations committed to the repository
- migrations run before the application serves traffic, per handbook section `4.2`
- connections are pooled and configured through environment variables, not hard-coded
- derived and non-critical stores may cache or index PostgreSQL data but never replace it

This decision applies to all durable, relational product state, including identity, content metadata, progress, and future domain records.

This decision does not apply to:

- binary assets, which belong to `Cloudflare R2` per `ADR-003`
- cache and ephemeral session state, which belongs to `Redis` per `ADR-005`
- vector embeddings and semantic indexes, which belong to `Qdrant` per `ADR-006`

Within the identity slice, this decision also means:

- the `memory` driver remains valid for local development and test execution
- the `postgres` driver is the only driver acceptable for a deployed environment
- running with no `DATABASE_URL` in a non-test environment is a misconfiguration, not a supported mode

## Decision Drivers

- durability of user and business data
- relational integrity for identities, sessions, and entitlements
- transactional correctness for multi-row writes
- alignment with the already accepted modular monolith boundaries
- a mature, well-understood operational model for a small team
- migration-first schema discipline
- predictable cost and footprint for a cost-sensitive product
- avoidance of premature multi-store complexity at bootstrap stage
- South Asian infrastructure reality: data integrity must not depend on a single long-lived process

## Options Considered

### Option A

- Description: Adopt PostgreSQL as the primary source of truth, with per-domain repositories, pooled connections, and migration-managed schema
- Pros:
  - strong relational integrity for identities, sessions, and future entitlements
  - real transactions, which the identity slice already exercises
  - mature migration tooling that is already wired into the repository
  - single well-understood operational model for a small team
  - supports indexes justified by query patterns, as the handbook requires
  - fits the modular monolith boundary model without added systems
- Cons:
  - requires schema and migration discipline for every change
  - connection pooling and migration ordering become operational concerns
  - a single primary requires an explicit backup and recovery story
  - some domain shapes may feel awkward in a relational model and need deliberate modelling

### Option B

- Description: Keep an in-memory or process-local store as the default and defer a durable database
- Pros:
  - zero operational overhead
  - fastest possible local and test iteration
  - no migration or schema management burden
- Cons:
  - all user data is lost on restart or redeploy, which is unacceptable for identity
  - no cross-request durability means sessions and resets cannot be trusted
  - guarantees a disruptive migration later, at a point of higher product risk
  - directly contradicts handbook section `5.5`
  - makes the shipped identity slice non-functional in any real environment

### Option C

- Description: Adopt a document database, such as MongoDB, instead of a relational store
- Pros:
  - flexible schema for evolving content shapes
  - natural fit for nested document payloads
  - horizontal scaling model built in
- Cons:
  - weaker fit for the strongly relational identity, session, and entitlement data already modelled
  - transactional guarantees and constraint enforcement are less natural for the current workload
  - introduces a second data paradigm alongside the planned relational and vector stores
  - adds avoidable decision churn and contradicts the documented handbook direction
  - no existing repository, migration, or verification tooling supports it

## Why This Decision Was Chosen

PostgreSQL is the correct primary source of truth for the current stage because the platform's most critical state is relational and transactional, and the repository is already built around it.

It is preferred over keeping a process-local store because identity data is the clearest possible case where durability is non-negotiable. Sessions, refresh tokens, and password resets cannot be trusted in a store that empties on restart, and the current silent fallback to memory would turn a missing environment variable into invisible data loss.

It is preferred over a document database because the existing model — users with sessions and reset requests, enforced by foreign keys and cascade rules — is exactly the shape a relational store handles best. Introducing a second data paradigm would add operational and cognitive cost without solving a problem the team currently has.

This decision also keeps the modular monolith honest. Each domain owns its repository boundary, migrations are versioned in the same repository as the code they serve, and the schema history is reviewable in pull requests like any other change.

## Consequences

### Positive

- identity, session, and reset data become durable and correct across deploys
- multi-row writes are transactional, which the verification script already proves
- schema evolution is reviewable, ordered, and reversible through migrations
- per-domain repositories keep data access boundaries explicit
- the decision to use a relational store is now recorded rather than implied
- pool configuration is visible and tunable through environment variables

### Negative

- every schema change now carries migration, ordering, and rollback discipline
- the team must own backup, restore, and recovery for the primary store
- connection pool limits and long-running transactions become failure modes to monitor
- local development depends on a running PostgreSQL for full-fidelity work
- the silent memory fallback remains a footgun until it is made explicit in deployed environments

## Operational Impact

Expected operational effects:

- migrations run as a required step before application startup, not on request
- deployments must fail loudly on an unreachable or unmigrated database rather than degrade to memory
- CI should keep validating lint, types, tests, and build without requiring a live database
- a database-backed verification run must exist as a separate, explicitly invoked check
- observability should cover connection acquisition failures, migration failures, and slow queries
- incident response needs a runbook for restore and for failed migrations
- environment configuration must be documented per environment rather than inferred

## Security and Compliance Impact

- every query must use parameter binding; string-concatenated SQL is prohibited
- the application connects with a least-privilege role rather than a superuser
- `schema_migrations` is read-only to the application role, as the verification script already assumes
- credentials live in environment configuration and are never committed
- personal data such as phone numbers requires an explicit retention and deletion policy
- password material is stored only as a hash, and reset tokens only as hashes
- backups and any replica copies inherit the same access and retention obligations
- data handling must respect regional privacy expectations for personal identifiers

## Rollout Plan

1. Accept PostgreSQL as the primary source of truth for durable application state
2. Provide local provisioning so contributors can run the database without manual setup
3. Run the existing migration against a live instance and confirm the schema is created
4. Execute `scripts/verify-postgres-auth.ts` against that instance to prove the full link
5. Document environment configuration, including the fact that a deployed environment must not use the memory driver
6. Make a missing `DATABASE_URL` in a deployed environment a hard failure rather than a silent fallback
7. Require a migration in the same pull request as any schema-affecting change
8. Proceed to the next ADR in the backlog only after this one is validated

## Validation and Success Metrics

This decision is considered successful if:

- the identity migration applies cleanly on a fresh database in one transaction
- `scripts/verify-postgres-auth.ts` passes end to end against a live instance
- schema presence, privileges, connection reuse, and transactional rollback are all verified
- identity records survive an application restart
- no repository leaks raw SQL outside its domain boundary
- schema changes always arrive with a matching migration
- CI remains green without requiring a live database

## Rollback or Exit Strategy

If PostgreSQL proves to be a poor fit, the exit path is a deliberate migration to another store rather than ad hoc divergence.

Migration should only be considered if:

- sustained operational cost or reliability problems cannot be resolved by tuning
- a domain's access pattern is demonstrably ill-suited to a relational model at real scale
- a compliance requirement forces a different data location or engine

Because all access flows through per-domain repositories, the exit path is:

1. confirm each domain reads and writes through its repository boundary
2. introduce the replacement store behind that boundary
3. backfill and verify data parity
4. switch reads, then writes
5. decommission the previous store

The memory driver must never be treated as the exit path for a deployed environment; it exists only for local development and tests.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent`
  - `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram`
  - `ENGINEERING_HANDBOOK.md` section `4.2 Local Setup Rules`
  - `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
  - `docs/architecture/authentication-backend-slice.md`
  - `docs/configuration.md`
- Related PRs:
  - `feature/auth-phone-identity` introduced the migration, pool configuration, and verification script
- External references:
