# ADR-007: Adopt Offline-First Support Where Client Context Requires It

- Status: `Proposed`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap offline resilience baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is built for a specific client context, not a generic one. Its users are expected to be on:

- mobile-first devices, many with `2-4 GB RAM`
- unstable and high-latency 3G/4G paths
- shared household devices
- metered or expensive data plans

In that context, a dropped connection is not an edge case. It is a routine condition that occurs mid-session: while reading a research summary, while moving through a guided onboarding step, or while recording progress. How the product behaves during those moments is a product-quality question, not a networking detail.

The handbook defines this as a product obligation rather than a technical preference:

- `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles` lists `Performance is accessibility`, `Gracefully degrade instead of fail`, and `Build for South Asian infrastructure reality, not Western assumptions`
- `ENGINEERING_HANDBOOK.md` section `2.3 User and Market Reality` names unstable and high-latency 3G/4G paths as a design constraint
- `ENGINEERING_HANDBOOK.md` section `3.5 NBU Experience and Trust Architecture` requires context-aware low-bandwidth states and allows device and context signals to trigger degraded UI states during poor connectivity
- `ENGINEERING_HANDBOOK.md` section `5.4 React and Next.js Standards` requires server components by default, small client bundles, and lazy-loaded non-critical modules
- `ENGINEERING_HANDBOOK.md` section `5.6 Performance Rules` requires lean mobile payloads, no heavy scripts in the initial render path, and optimisation for low-end Android first
- `ENGINEERING_HANDBOOK.md` section `9.1 Security Rules` requires server-side authorization and forbids logging credentials, OTPs, and tokens
- `ENGINEERING_HANDBOOK.md` section `9.2 Shared Device Protection` requires quick logout, device-aware session handling, and clear active-user state transitions
- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` lists `ADR-007: Adopt offline-first support where client context requires it`

The already accepted ADRs constrain this decision:

- `ADR-002` establishes a server-first Next.js App Router surface, which is the right default and must not be abandoned wholesale
- `ADR-004` establishes `PostgreSQL` as the primary source of truth, which means no client-side store may become authoritative for durable state
- `ADR-005` establishes `Redis` for cache and ephemeral state server-side, and introduces idempotency keys for operations that may be retried
- `ADR-006` establishes that derived indexes are rebuildable and must degrade gracefully
- `ADR-009` establishes phone-first identity and trust-building UX rules, including showing immediate proof of action after important events

The current repository state matters to this decision:

- there is no service worker, no web app manifest, no local persistence layer, and no sync or queue mechanism
- identity pages are server-rendered or statically generated, and auth is enforced in middleware
- the product is server-first today, with no offline behaviour at all

The handbook's wording is deliberately conditional: offline-first support is adopted *where client context requires it*. That leaves the key decision as a scoping question — which journeys qualify, and what guarantees must hold when one does.

## Decision

Adopt offline-first support selectively, scoped per journey, and only where a named client context demonstrably requires it.

This means:

- offline-first is not a blanket requirement for the application; server-first remains the default per `ADR-002`
- a journey qualifies only when it is explicitly named and justified in a design document, with the client context that requires it stated
- where a journey qualifies, the server remains the source of truth and the local store is a cache plus a queue, never an authority
- queued offline writes must be reconciled to the server, and the server's persisted result is the accepted outcome
- queued writes must be idempotent so a retry cannot duplicate a mutation, consistent with the idempotency keys established in `ADR-005`
- cached reads may be shown when the network fails, but must be marked as potentially stale and must expose a last-updated indication
- offline and pending-sync states must be explicit in the UI, consistent with the trust-building rules in `ADR-009` and handbook section `3.5`
- offline code is added only for the named journey, bundled and lazy-loaded, per handbook sections `5.4` and `5.6`
- the application must retain full functionality online, so offline support can be disabled without breaking the journey

This decision applies to these journey classes, and only these:

- reading and reviewing already-fetched research or content summaries
- continuing a guided onboarding or learning step that has already been fetched
- recording lightweight progress that can be reconciled later

This decision does not apply to:

- authentication, session establishment, and OTP entry, which require a live server exchange
- payment and subscription mutations, which must be server-confirmed before they are treated as successful
- scholar verification and any admin or moderation action, which require live authorization
- durable state ownership, which remains with `PostgreSQL` per `ADR-004`
- server-side cache and ephemeral state, which remains with `Redis` per `ADR-005`

Adoption is deliberate and incremental. No service worker or local persistence layer is added until a specific journey is named, justified, and designed.

## Decision Drivers

- unstable, high-latency connectivity as a routine condition for the target user
- the product principle `Gracefully degrade instead of fail`
- the product principle `Build for South Asian infrastructure reality, not Western assumptions`
- data cost sensitivity, where redundant refetching is a real user cost
- low-end Android performance, which forbids blanket client-side complexity
- preserving the source-of-truth guarantee established by `ADR-004`
- shared-device privacy, which constrains any local caching of personal data
- bundle-size and initial-render discipline, per handbook sections `5.4` and `5.6`
- delivery speed: selective offline support is far cheaper than global offline-first
- predictability for a small team, which favours explicit scope over ambient complexity

## Options Considered

### Option A

- Description: Adopt offline-first selectively, per named journey, with the server as the source of truth, idempotent queued writes, explicit stale and offline states, and clear local-cache rules for shared devices
- Pros:
  - keeps the server-first architecture from `ADR-002` intact for everything that does not need offline support
  - delivers continuity exactly where connectivity actually breaks the experience
  - preserves `ADR-004`'s guarantee, because the local store is never authoritative
  - scopes bundle and complexity cost to a small number of journeys
  - makes degraded and pending states explicit, which builds trust rather than hiding failure
  - matches the handbook's conditional wording directly
- Cons:
  - introduces sync, conflict, and retry handling as new correctness concerns
  - requires per-journey design review to decide scope, which adds process
  - local caches of personal data raise shared-device privacy obligations
  - two behaviour paths to test, online and offline, for each qualifying journey

### Option B

- Description: Stay fully online, relying on server-side caching, retries, and graceful degradation with no local persistence
- Pros:
  - the simplest possible architecture, with no sync, queue, or conflict concerns
  - no local storage of personal data, which sidesteps shared-device leakage entirely
  - no new client bundle cost and no service-worker lifecycle to manage
  - aligns trivially with `ADR-002`'s server-first stance
- Cons:
  - a dropped connection mid-journey still stops the user, which is the exact failure the target context produces routinely
  - does not satisfy the handbook's expectation of context-aware low-bandwidth states in section `3.5`
  - discards user effort, such as recorded progress, when connectivity fails at the wrong moment
  - treats a routine condition as an edge case, contradicting the `Build for South Asian infrastructure reality` principle

### Option C

- Description: Adopt full offline-first across the application, with an app shell, background sync, and local-first data for all surfaces
- Pros:
  - the strongest possible resilience, since most of the product works without a network
  - a uniform model, with one offline strategy rather than per-journey decisions
  - enables installable, app-like behaviour on low-end Android
- Cons:
  - substantially increases client bundle size and complexity, which conflicts with handbook sections `5.4` and `5.6`
  - maximises the risk of treating local state as authoritative, which weakens `ADR-004`'s guarantee
  - multiplies shared-device privacy exposure by caching personal data broadly
  - authentication, payments, and authorization cannot be made offline-safe regardless, so the uniformity is partly illusory
  - imposes the highest delivery and testing cost at the earliest stage of the product

## Why This Decision Was Chosen

Selective offline-first is correct because the problem is specific, not general. Connectivity fails a small number of high-value moments — reading fetched content, continuing a fetched guided step, and recording lightweight progress — and those moments are worth protecting. Making the entire application offline-capable to protect them would pay a very large complexity, bundle, and privacy cost for behaviour that only a subset of journeys needs.

It is preferred over staying fully online because a dropped connection in the target context is routine rather than exceptional. Losing a user's in-progress step or silently discarding recorded progress is exactly the kind of fragility the handbook's principles exist to prevent.

It is preferred over full offline-first because the guarantees that matter most cannot be made offline anyway. Authentication, authorization, and payment confirmation require a live server, so a uniform offline model would create false confidence precisely where correctness is most important. Scoping offline support to journeys that are genuinely offline-safe keeps the model honest.

This decision also protects the architecture already approved. `ADR-002`'s server-first surface remains the default, and `ADR-004`'s source of truth is never contested, because the local store is defined from the outset as a cache and a queue with an idempotent reconciliation path.

## Consequences

### Positive

- named journeys continue to work through connectivity dropouts
- user effort, such as recorded progress, is not lost when the network fails mid-action
- offline and pending states become explicit and auditable, which supports trust rather than hiding failure
- server-first architecture remains the default, so bundle and complexity stay controlled
- idempotent reconciliation prevents duplicate writes when a queued mutation is retried
- the scope is reviewable, because each qualifying journey must be named and justified

### Negative

- sync, conflict, and retry handling become new correctness obligations
- local storage of any personal data creates shared-device privacy obligations that must be enforced and tested
- each qualifying journey has two behaviour paths to build and verify
- cache invalidation and staleness display need deliberate design
- local storage quotas on low-end devices can evict cached content, which must be handled predictably
- the boundary between offline-safe and online-only journeys must be enforced in review, or scope will drift

## Operational Impact

Expected operational effects:

- CI must remain green without any offline-specific hardware or emulation, as it does for `PostgreSQL`, `Redis`, and `Qdrant`
- offline behaviour requires explicit integration tests for offline reads, queued writes, retry, conflict, and cache clearing on logout
- manual verification on a low-end Android device or equivalent throttled profile is required for a qualifying journey before release
- observability should cover sync success, sync failure, conflict rate, queue depth, and stale-cache rate
- a runbook is required for stuck or failing sync queues, including safe handling of unsynced mutations
- deployment must account for service-worker versioning when one is introduced, so stale clients update predictably
- changes affecting caching or feed generation require performance testing, per handbook section `8.2`

## Security and Compliance Impact

- authentication, session establishment, and OTP entry must never be satisfied from local storage alone
- server-side authorization is re-applied on sync; a queued mutation is re-validated rather than trusted
- tokens, OTPs, and credentials must not be persisted in insecure local storage beyond what session handling strictly requires
- locally cached personal data must be cleared on logout and on profile switch, per handbook section `9.2`
- on shared devices, cached personal state must not be readable across profiles, and the active profile must be unambiguous
- data deletion and retention obligations extend to local caches, not just server records
- error reporting and logs must not capture cached personal payloads or tokens

## Rollout Plan

1. Accept selective offline-first, scoped to journeys that client context demonstrably requires
2. Do not add a service worker or local persistence layer until a specific journey is named and justified in a design document
3. When a journey qualifies, define before implementation: the journey boundary, the cache scope, the queue and idempotency contract, the conflict resolution rule, and the offline, pending, and stale-state UX
4. Keep server components the default, and add offline code only for the named journey, bundled and lazy-loaded
5. Add integration tests covering offline read, queued write, retry, conflict, and cache clearing on logout
6. Document local storage behaviour, any service-worker versioning, and any new environment or configuration values in `docs/configuration.md`
7. Proceed to the next ADR in the backlog only after this one is validated

## Validation and Success Metrics

This decision is considered successful if:

- each qualifying journey continues to work through a simulated network dropout
- no queued mutation produces a duplicate when retried
- the server remains authoritative, and reconciliation results are reflected in the UI
- cache clearing on logout and profile switch is verified by test
- offline or stale indicators never appear outside the named qualifying journeys
- client bundle size for a qualifying journey stays within the budget set for mobile-first usage
- sync failure and conflict rates stay within defined thresholds in production

## Rollback or Exit Strategy

Because the server remains the source of truth, offline support can be removed per journey without risking committed data.

The exit path is:

1. disable offline support for the journey through configuration or a feature flag
2. surface and resolve any pending unsynced mutations explicitly, rather than discarding them silently
3. unregister the service worker if one was introduced, and confirm stale clients recover
4. remove the dependency and its configuration in the same change that removes their usage, per handbook section `4.3`
5. confirm the journey still functions fully online

A move toward broader offline support should happen only through a new or superseding ADR, and only after the selective model has proven itself on the journeys that qualified first.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles`
  - `ENGINEERING_HANDBOOK.md` section `2.3 User and Market Reality`
  - `ENGINEERING_HANDBOOK.md` section `3.5 NBU Experience and Trust Architecture`
  - `ENGINEERING_HANDBOOK.md` section `4.3 Dependency Management Rules`
  - `ENGINEERING_HANDBOOK.md` section `5.4 React and Next.js Standards`
  - `ENGINEERING_HANDBOOK.md` section `5.6 Performance Rules`
  - `ENGINEERING_HANDBOOK.md` section `8.2 Performance Tests`
  - `ENGINEERING_HANDBOOK.md` section `9.1 Security Rules`
  - `ENGINEERING_HANDBOOK.md` section `9.2 Shared Device Protection`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
  - `docs/adr/ADR-002-adopt-nextjs-app-router.md`
  - `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
  - `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
  - `docs/adr/ADR-009-adopt-phone-first-identity-and-icon-driven-nbu-ux.md`
  - `docs/architecture/nbu-ux-and-phone-first-identity.md`
  - `docs/configuration.md`
- Related PRs:
  - `docs/adr-007-offline-first` introduces this decision
- External references:
