# ADR-005: Adopt Redis for Cache and Ephemeral State

- Status: `Accepted`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap cache and ephemeral state baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is designed for mobile-first usage on low-end Android devices over unstable, high-latency 3G/4G paths. Two product principles follow directly from that reality:

- `Cache before compute`
- `Gracefully degrade instead of fail`

Neither principle can be satisfied by `PostgreSQL` alone. PostgreSQL is the correct primary source of truth — `ADR-004` settled that — but it is the wrong place to hold state that is short-lived, safely reconstructible, or written at very high frequency. The already accepted ADRs constrain this decision:

- `ADR-004` states that PostgreSQL is the source of truth for durable state and explicitly assigns "cache and ephemeral session state" to `Redis` per this ADR
- `ADR-009` makes phone number the default identity and `OTP` the default first-login and routine sign-in method, which implies short-lived verification challenges and abuse controls
- `ADR-001` keeps the system a modular monolith in which each domain owns its boundary, so any cache must sit behind a domain-owned boundary rather than being reached ad hoc

The handbook is explicit that this decision is expected:

- `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles` lists `Cache before compute` and `Gracefully degrade instead of fail`
- `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent` lists `Redis` for cache and ephemeral state
- `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram` connects the application to `Redis`
- `ENGINEERING_HANDBOOK.md` section `4.1 Local Tooling Baseline` lists `Redis` among the required local tools
- `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards` states that `Redis` is never the source of truth for critical data
- `ENGINEERING_HANDBOOK.md` section `9.1 Security Rules` requires rotating and revoking sessions safely and never logging OTPs or tokens
- `ENGINEERING_HANDBOOK.md` section `13.2 24-Hour Readiness Rule` requires warming caches and validating cache hit targets before peak demand
- `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy` requires degraded continuity rather than hard failure
- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` lists `ADR-005: Adopt Redis for cache and ephemeral state`

The current repository state matters to this decision:

- the identity slice is implemented entirely against PostgreSQL, with `auth_users`, `auth_sessions`, and `auth_password_resets` as durable, migration-managed tables
- `Redis` is not yet a dependency, not in `package.json`, and not a service in `infrastructure/docker-compose.yml`
- there is therefore no cache layer today, and every read hits PostgreSQL directly

That leaves the key decision as a boundary question rather than an implementation question: which state is allowed to live outside the primary source of truth, and what rules keep it from becoming a place where data quietly disappears.

## Decision

Adopt `Redis` as the designated store for cache and ephemeral state, and only for those.

This means:

- `Redis` holds state that is short-lived, safely reconstructible from a durable source, or intrinsically transient
- `Redis` is never the source of truth for critical data, per handbook section `5.5`
- every key class must be reconstructible from `PostgreSQL` or another durable source, or be safe to drop entirely
- losing the `Redis` keyspace must degrade behaviour, never lose committed data
- `Redis` is reached through a narrow boundary owned by the consuming domain or by shared infrastructure, never through ad hoc access spread across the app
- the application must run with and without `Redis`, so local development and CI are not blocked on it

This decision applies to these key classes, and only these:

- rate-limit counters for abuse-prone endpoints, including auth routes
- short-lived verification and OTP challenge state carrying an explicit TTL
- short-lived idempotency keys for future payment and subscription operations
- hot read caches for content manifests, recommendations, and other read-heavy surfaces
- readiness cache warming before expected peak demand, per handbook section `13.2`

This decision does not apply to:

- durable identity state, including users, sessions, refresh tokens, and password resets, which belong to `PostgreSQL` per `ADR-004`
- binary assets, which belong to `Cloudflare R2` per `ADR-003`
- vector embeddings and semantic indexes, which belong to `Qdrant` per `ADR-006`
- any value that cannot be recomputed or safely expired

Adoption is deliberate and incremental. `Redis` is not added to the running application until a concrete workload requires it. The first qualifying workloads are OTP challenge state, auth rate limiting, and hot read caching.

## Decision Drivers

- performance as accessibility, with reads served faster than a cold PostgreSQL round trip
- the product principle `Cache before compute`
- the product principle `Gracefully degrade instead of fail`
- mobile-first reality: high-latency paths and low-end devices where recomputation is cheaper than failure
- abuse resistance for a phone-first authentication surface
- protection of the primary database from high-frequency, low-value write churn
- automatic expiry of transient state without a cleanup job
- a small, well-understood operational footprint for a small team
- alignment with the modular monolith boundary model in `ADR-001`
- local and CI simplicity: the application must not require `Redis` to build, test, or run
- cost sensitivity: a single small instance at bootstrap, not a cluster

## Options Considered

### Option A

- Description: Adopt `Redis` for cache and ephemeral state, accessed through a per-domain or shared boundary, with an in-memory or no-op fallback when `Redis` is absent
- Pros:
  - purpose-built support for TTL expiry, atomic counters, and high-frequency reads and writes
  - protects the primary database from cache churn and rate-limit contention
  - enables cache warming and hit-rate targets required by handbook section `13.2`
  - a fallback path keeps local development and CI working without `Redis`
  - keeps ephemeral state out of the durable schema, so migrations stay about real data
  - matches the documented handbook direction directly
- Cons:
  - introduces a second runtime dependency to provision, monitor, and secure
  - cache invalidation and key naming become correctness concerns
  - a fallback path means two code paths to test
  - a naive usage pattern could tempt the team to treat `Redis` as durable

### Option B

- Description: Keep everything in `PostgreSQL`, using it for caches, rate-limit counters, and short-lived state
- Pros:
  - one data system to operate, back up, and reason about
  - transactional consistency with the durable records it serves
  - no new dependency, secret, or compose service
- Cons:
  - TTL and expiry semantics are awkward and require cleanup jobs instead of native expiry
  - rate-limit counters create hot-row contention against the primary database
  - cache churn competes with the write path that must stay correct for identity data
  - cannot satisfy the cache-warming and hit-target expectations in handbook section `13.2`
  - contradicts handbook sections `2.4` and `5.5`
  - scales the wrong resource: read amplification lands on the store that must not fail

### Option C

- Description: Use a process-local in-memory cache, such as a module-level map or framework request cache, instead of `Redis`
- Pros:
  - zero infrastructure, zero cost, zero new secrets
  - no network hop for cached reads
  - trivially available in tests
- Cons:
  - not shared across instances, so behaviour diverges as soon as more than one instance runs
  - emptied on every deploy and restart, which defeats rate limiting and challenge state
  - no central place to warm caches or observe hit targets before peak demand
  - cross-request ephemeral state becomes silently inconsistent rather than merely slower
  - fails the `Gracefully degrade instead of fail` principle by producing incorrect behaviour instead of degraded behaviour

## Why This Decision Was Chosen

`Redis` is the correct store for Okkhor's ephemeral state because the workloads that need it share the same shape: short-lived, high-frequency, and safely reconstructible. TTL expiry, atomic counters, and in-memory-speed reads are exactly the primitives these workloads need, and they are the primitives a relational database provides least naturally.

It is preferred over keeping everything in `PostgreSQL` because the costs of that approach land on the wrong system. Rate-limit counters and cache churn are high-frequency and low-value, while `PostgreSQL` holds the identity data that must never be at risk of contention or accidental loss. Separating ephemeral traffic from durable traffic is what keeps `ADR-004`'s guarantee meaningful.

It is preferred over a process-local cache because ephemeral correctness must survive more than one process. A rate limit that resets on deploy, or a verification challenge that only exists on one instance, is not a degraded experience but an incorrect one, and the handbook's degradation policy explicitly prefers continuity over hard failure.

This decision also stays consistent with the modular monolith. `Redis` is a shared capability, not a new domain; each domain still owns its data boundary, and cache access remains behind a narrow, testable seam with a fallback for environments where `Redis` is absent.

## Consequences

### Positive

- hot reads can be served at memory speed instead of a cold database round trip
- rate limiting and abuse controls become possible on a phone-first authentication surface
- transient state expires automatically without cleanup jobs or schema changes
- the primary database is protected from high-frequency, low-value traffic
- cache warming and hit-rate validation before peak events become possible
- a fallback path keeps the application runnable without `Redis` in local and CI environments

### Negative

- a new runtime dependency must be provisioned, monitored, secured, and backed up
- cache invalidation and key naming become correctness obligations rather than conveniences
- a fallback path means two behaviours to test, including the degraded one
- the boundary between ephemeral and durable state must be enforced in review, or `Redis` will drift into holding data that should be durable
- sensitive ephemeral values, such as OTP challenges, require explicit TTL and hashing discipline

## Operational Impact

Expected operational effects:

- CI must remain green without requiring a live `Redis`, exactly as it does for `PostgreSQL` today
- local development must remain runnable without `Redis`, either through the fallback path or an optional compose service
- `Redis` should be added to `infrastructure/docker-compose.yml` and documented only when the first workload lands, not speculatively
- observability should cover cache hit and miss rates, evictions, memory usage, command latency, and connection errors
- a runbook is required for `Redis` unavailability, describing the degraded behaviour the application is expected to fall into
- incident response should treat `Redis` loss as a degradation event, not a data-loss event, because nothing durable lives there
- readiness checks before peak-demand events should warm caches and confirm hit targets, per handbook section `13.2`

## Security and Compliance Impact

- `Redis` must never hold plaintext passwords, OTP codes, or raw session tokens; such values are stored hashed or are never stored at all
- every sensitive ephemeral value must carry a short, explicit TTL so it cannot outlive its purpose
- credentials and connection strings live in environment configuration and are never committed
- `Redis` must not be exposed to the public internet and should require authentication in any shared environment
- cached payloads must be minimized, and cache keys must not embed personal identifiers such as raw phone numbers in a form that reaches logs
- cached responses must respect the same authorization checks as the underlying reads, so a cache can never widen data access
- the shared-device reality in South Asia means cached personal state must never be readable across profiles on a shared device surface

## Rollout Plan

1. Accept `Redis` as the store for cache and ephemeral state, and only for that
2. Do not add `Redis` to the running application until a concrete workload requires it; the first qualifying workloads are OTP challenge state, auth rate limiting, and hot read caching
3. When the first workload lands, introduce `Redis` behind a narrow, domain-owned or shared boundary with an in-memory or no-op fallback so tests and local development stay `Redis`-free
4. Add a `Redis` service to `infrastructure/docker-compose.yml`, and document every new environment variable in `.env.example` and `docs/configuration.md`
5. Define key namespacing, TTL defaults, and invalidation rules per key class before first use
6. Add integration tests covering cache behaviour, including the fallback path when `Redis` is absent
7. Proceed to the next ADR in the backlog only after this one is validated

## Validation and Success Metrics

This decision is considered successful if:

- the application builds, tests, and runs with and without `Redis`
- CI stays green without requiring a live `Redis`
- a test proves the fallback path when `Redis` is unavailable
- cache hit targets are validated before expected peak-demand events, per handbook section `13.2`
- no durable or non-reconstructible state is ever stored only in `Redis`
- evictions and memory usage stay within configured expectations under load
- read load on `PostgreSQL` for hot surfaces is measurably reduced

## Rollback or Exit Strategy

Because nothing durable is allowed to live in `Redis`, exit is low-risk by design.

The exit path is:

1. disable `Redis` through configuration, exercising the same fallback path that local development already uses
2. confirm the application continues to serve reads and writes from `PostgreSQL` with degraded but correct behaviour
3. remove the dependency and its environment variables in the same change that removes their usage, per handbook section `4.3`
4. decommission the `Redis` instance

Migration to a different cache or ephemeral store should only be considered if `Redis` proves unreliable, operationally expensive, or non-compliant for the deployment region. Any replacement must preserve the same guarantee: ephemeral only, never the source of truth for critical data.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles`
  - `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent`
  - `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram`
  - `ENGINEERING_HANDBOOK.md` section `4.1 Local Tooling Baseline`
  - `ENGINEERING_HANDBOOK.md` section `4.3 Dependency Management Rules`
  - `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards`
  - `ENGINEERING_HANDBOOK.md` section `9.1 Security Rules`
  - `ENGINEERING_HANDBOOK.md` section `13.2 24-Hour Readiness Rule`
  - `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
  - `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
  - `docs/configuration.md`
  - `docs/architecture/authentication-backend-slice.md`
- Related PRs:
  - `docs/adr-005-redis` introduces this decision
- External references:
