# Phase 6 ADR Execution Log

Version: `1.0`  
Phase: `ADR-005 Bootstrap`  
Execution Mode: `Strictly Sequential`  
Status: `In Progress`

## 1. Phase Objective

This phase creates the fifth concrete architecture decision record required by the engineering handbook.

Current phase deliverable:

- `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`

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
- `docs/adr/ADR-003-adopt-cloudflare-r2-for-assets.md`
- `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
- `docs/adr/ADR-009-adopt-phone-first-identity-and-icon-driven-nbu-ux.md`
- `docs/configuration.md`
- `infrastructure/docker-compose.yml`
- current repository structure

### Validation Results

- handbook explicitly lists `ADR-005: Adopt Redis for cache and ephemeral state`
- handbook section `5.5` already states `Redis` is never the source of truth for critical data
- the ADR template remains reusable and valid
- `ADR-001` through `ADR-004` are already completed and approved
- the phase that produced `ADR-004` was approved before this phase began
- `ADR-004` explicitly assigns cache and ephemeral session state to `Redis` per this ADR, so this ADR resolves an already-recorded forward reference
- no conflicting `ADR-005` file exists
- `Redis` is not yet a repository dependency, which makes this ADR a boundary decision rather than a record of shipped code

### Current Task Standard

The current ADR must:

- use the repository ADR template structure
- align with the modular monolith boundary model already accepted
- align with the handbook data layer standards already documented
- explain why `Redis` is adopted for cache and ephemeral state now
- explain why `PostgreSQL` and a process-local cache are not the right fit for that state
- state the guarantee that `Redis` is never the source of truth for critical data
- state the conditions under which the application must run without `Redis`
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
  - `ADR-005` is the next logical decision after `ADR-004` because `ADR-004` defines durable state and defers cache and ephemeral state to this ADR
  - the handbook lists `Redis` for cache and ephemeral state and forbids it as a source of truth for critical data
  - the product principles `Cache before compute` and `Gracefully degrade instead of fail` cannot be satisfied by `PostgreSQL` alone
  - no `Redis` dependency, compose service, or cache layer exists in the repository yet
  - recording the boundary now prevents both premature provisioning and later drift into storing durable data in a cache

### Step 2: ADR-005 implementation

- Status: `Passed`
- Artifact created:
  - `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
- Findings:
  - the ADR is specific to Okkhor rather than generic cache advice
  - it enumerates the concrete key classes this decision permits: rate-limit counters, OTP challenge state, idempotency keys, hot read caches, and readiness cache warming
  - it explicitly excludes durable identity state, binary assets, and vector indexes, referencing `ADR-004`, `ADR-003`, and `ADR-006`
  - it requires the application to run with and without `Redis`, mirroring the existing driver-selection pattern in the identity slice
  - it states that adoption is incremental and that `Redis` is not added until a concrete workload requires it
- Resolved issues:
  - removed ambiguity about whether `Redis` may hold durable state
  - made the degraded fallback path an explicit requirement rather than an implementation detail
  - documented that cache warming and hit targets are obligations, not optional optimizations

### Step 3: ADR-005 validation

- Status: `Passed`
- Validation results:
  - file exists in `docs/adr/`
  - content follows the ADR template structure
  - content aligns with handbook sections `2.2`, `2.4`, `3.3`, `4.1`, `4.3`, `5.5`, `9.1`, `13.2`, `13.3`, and `16`
  - `docs/adr/README.md` index updated to include the new file
  - diagnostics check returned no issues
- Outcome:
  - current phase deliverable satisfies the defined execution standard and completion criteria

### Step 4: Approval request

- Status: `Pending`
- Approval required before:
  - promoting `ADR-005` from `Proposed` to `Accepted`
  - adding `Redis` to `infrastructure/docker-compose.yml`
  - introducing the first cache or ephemeral workload behind a boundary with a fallback
  - creating `ADR-006`
