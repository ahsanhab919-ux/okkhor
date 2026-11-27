# ADR-006: Adopt Qdrant for Semantic Discovery

- Status: `Accepted`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap semantic discovery baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is an AI-powered knowledge platform whose stated purpose is comprehension, not just translation: it must make global research, innovation, and best practices discoverable in the learner's native language. Discovery is therefore a core product surface rather than an add-on, and handbook section `3.2 Core Domains` names `Search`, `Recommendations`, and `Localization` as first-class modules.

Keyword and metadata matching alone cannot deliver that surface. A Bangla-first learner who describes a concept in everyday language needs results matched on meaning, not on exact token overlap with an English research title. Semantic discovery is the capability that closes that gap, and it requires a vector store.

The already accepted ADRs constrain this decision:

- `ADR-001` establishes a modular monolith in which each domain owns its data and reaches it through a narrow boundary, so vector access must sit behind a domain-owned module rather than being reached ad hoc
- `ADR-004` establishes `PostgreSQL` as the primary source of truth for durable state and explicitly assigns vector embeddings and semantic indexes to `Qdrant` per this ADR
- `ADR-005` establishes `Redis` for cache and ephemeral state, which may cache recommendation results but never holds the vector index itself

The handbook is explicit that this decision is expected, and equally explicit about its limits:

- `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles` lists `Comprehension, not just translation` and `Gracefully degrade instead of fail`
- `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent` lists `Qdrant` for semantic discovery and recommendations
- `ENGINEERING_HANDBOOK.md` section `3.2 Core Domains` names `Search`, `Recommendations`, and `Localization` as module boundaries
- `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram` connects the application to `Qdrant`
- `ENGINEERING_HANDBOOK.md` section `4.1 Local Tooling Baseline` lists local `Qdrant` as optional tooling
- `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards` states that `Qdrant` must always have a fallback path when vector lookup fails
- `ENGINEERING_HANDBOOK.md` section `8.2 Performance Tests` requires performance testing before releasing changes that affect recommendation and feed generation
- `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy` requires falling back to trending or editorial content if recommendations degrade
- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` lists `ADR-006: Adopt Qdrant for semantic discovery`

The current repository state matters to this decision:

- there is no `Search` or `Recommendations` module yet, and no semantic discovery workload in the running product
- `Qdrant` is not a dependency, not in `package.json`, and not a service in `infrastructure/docker-compose.yml`
- content metadata currently has no home outside `PostgreSQL`, and no embedding pipeline exists

That makes the key decision a boundary and fallback question rather than a provisioning question: which system holds vectors, what relationship it has to the primary source of truth, and what the product does when it is unavailable.

## Decision

Adopt `Qdrant` as the designated vector store for semantic discovery, similarity search, and recommendation candidate generation, and only for those.

This means:

- `Qdrant` holds vector embeddings, similarity indexes, and the minimal payload needed to filter and rank candidates
- `Qdrant` data is derived. Every vector and payload must be reconstructible from `PostgreSQL` records plus the embedding pipeline, so the index can be rebuilt from scratch at any time
- `Qdrant` is never the source of truth for content, identity, or any durable business state
- every vector lookup must have a fallback path, per handbook section `5.5`: when `Qdrant` is unavailable, times out, or returns nothing, the request falls back to `PostgreSQL` keyword and metadata search, and then to trending or editorial content per handbook section `13.3`
- vector search is reached through a boundary owned by the `Search` or `Recommendations` domain, never through ad hoc access spread across the app
- filtering and authorization are enforced against `PostgreSQL` records, so a vector search can never widen access to content a user is not entitled to see
- the application must run with and without `Qdrant`, so local development and CI are not blocked on it

This decision applies to these workloads, and only these:

- semantic search over research and content metadata, serving Bangla and other target languages
- recommendation candidate generation for feeds and discovery surfaces
- similar-item and related-content lookups
- future retrieval-augmented features that need semantic recall over indexed content

This decision does not apply to:

- durable content, identity, and entitlement records, which belong to `PostgreSQL` per `ADR-004`
- binary media, which belongs to `Cloudflare R2` per `ADR-003`
- cache and ephemeral state, including cached recommendation payloads, which belong to `Redis` per `ADR-005`
- exact-match or purely relational queries, which stay in `PostgreSQL`

Adoption is deliberate and incremental. `Qdrant` is not added to the running application until a concrete semantic discovery workload exists. The first qualifying workload is multilingual semantic search over indexed content.

## Decision Drivers

- comprehension over literal translation, which requires meaning-based retrieval
- Bangla-first and multilingual discovery quality
- a dedicated ANN index rather than full scans over a relational store
- protecting `PostgreSQL` from a heavy, specialized read pattern, consistent with `ADR-005`'s reasoning
- the handbook's mandatory fallback path when vector lookup fails
- graceful degradation over hard failure when the vector store is unavailable
- mobile-first, high-latency reality where degraded results must still be fast and useful
- cost sensitivity: a self-hostable, open-source store rather than a per-request managed service
- alignment with the modular monolith boundary model in `ADR-001`
- local and CI simplicity: the application must not require `Qdrant` to build, test, or run

## Options Considered

### Option A

- Description: Adopt `Qdrant` as the vector store for semantic discovery, reached through a domain-owned boundary with a keyword and trending fallback when it is unavailable
- Pros:
  - purpose-built approximate nearest-neighbour indexing with payload filtering, which semantic discovery needs
  - separates a specialized, read-heavy workload from the primary database
  - open source and self-hostable, which fits cost sensitivity and regional hosting needs
  - supports the multilingual embedding models a Bangla-first product requires
  - a fallback path keeps local development and CI working without it
  - matches the documented handbook direction directly
- Cons:
  - introduces a third runtime dependency to provision, monitor, and secure
  - the embedding pipeline and index versioning become ongoing obligations
  - index drift is possible if reindexing is not disciplined
  - a fallback path means two code paths to test, including the degraded one

### Option B

- Description: Use `PostgreSQL` with a vector extension such as `pgvector` instead of a dedicated vector store
- Pros:
  - keeps one data system to operate, back up, and reason about
  - transactional consistency between content records and their embeddings
  - no new dependency, secret, or compose service
  - viable at small index sizes with modest recall requirements
- Cons:
  - vector search competes with the transactional workload that `ADR-004` exists to protect
  - approximate index tuning, filtering performance, and recall at scale are less mature than a dedicated store
  - index maintenance and rebuilds become operational work on the primary database
  - contradicts handbook sections `2.4` and `5.5`, which name `Qdrant`
  - makes the fallback path harder to reason about, because there is no independent second system to fall back to
- Note: this remains the practical short-term substitute if semantic discovery is needed before `Qdrant` is provisioned, since it reuses infrastructure already in place

### Option C

- Description: Use a proprietary managed vector service, or defer semantic discovery and rely on keyword search only
- Pros:
  - a managed service removes operational ownership of the vector store
  - keyword-only search has zero added cost and ships immediately
- Cons:
  - a managed per-request service adds recurring cost and an external dependency that is hard to justify at bootstrap
  - vendor lock-in complicates a later move to self-hosted or regionally hosted infrastructure
  - keyword-only search cannot deliver comprehension-based discovery, which is the product's core promise
  - deferring indefinitely pushes the hardest product problem to a point of higher risk
  - diverges from the documented handbook direction without a recorded reason

## Why This Decision Was Chosen

`Qdrant` is the correct vector store for Okkhor because semantic discovery is a defining product capability, not an optimization. Matching on meaning across languages is exactly the workload a dedicated nearest-neighbour store is built for, and it is the workload a relational database serves least well.

It is preferred over `pgvector` because the two systems have different jobs. `PostgreSQL` holds the durable records that must never be at risk, while semantic search is a specialized, read-heavy pattern. Separating them keeps `ADR-004`'s guarantee meaningful and gives the fallback requirement something real to fall back to. `pgvector` is recorded as the practical short-term substitute, not as the long-term target.

It is preferred over a managed vector service or keyword-only search because cost sensitivity and data-residency reality favour a self-hostable store, and because keyword-only search cannot satisfy the product's central promise of comprehension in the learner's own language.

This decision also stays consistent with the modular monolith. `Qdrant` is a specialized index behind the `Search` and `Recommendations` boundaries, not a new domain; content remains owned by `PostgreSQL`, and the vector store is always a rebuildable derivative of it.

## Consequences

### Positive

- meaningful, multilingual discovery becomes possible on top of indexed content
- a specialized read-heavy workload is kept off the primary database
- the index is rebuildable at any time from `PostgreSQL`, which keeps recovery simple
- the mandatory fallback path is defined before any dependency on `Qdrant` exists
- recommendation and search quality can be measured and tuned independently of the transactional store

### Negative

- a third runtime dependency must be provisioned, monitored, secured, and backed up
- the embedding pipeline, model versioning, and reindexing become ongoing obligations
- index drift between `PostgreSQL` and `Qdrant` is a new failure mode to detect and repair
- a fallback path means two behaviours to test, including the degraded one
- ranking quality depends on embedding choices that are hard to change cheaply once indexed

## Operational Impact

Expected operational effects:

- CI must remain green without requiring a live `Qdrant`, exactly as it does for `PostgreSQL` and `Redis`
- local development must remain runnable without `Qdrant`, either through the fallback path or an optional compose service
- `Qdrant` should be added to `infrastructure/docker-compose.yml` and documented only when the first workload lands, not speculatively
- observability should cover lookup latency, empty-result rate, fallback activation rate, collection size, and indexing lag
- a runbook is required for `Qdrant` unavailability, describing the fallback behaviour the application is expected to fall into
- a documented reindex procedure must exist, since the index is derived data
- changes affecting recommendation and feed generation require performance testing, per handbook section `8.2`
- readiness checks before peak-demand events should confirm the index is populated and current

## Security and Compliance Impact

- vector search must never bypass authorization: entitlement and visibility are checked against `PostgreSQL` records, then applied as filters
- payloads stored in `Qdrant` must be minimized and must not contain sensitive personal data that belongs in the primary store
- personal identifiers must not be embedded in collection names, payload fields, or logs
- collections that include user-derived vectors require a retention and deletion path aligned with the primary store's policy
- credentials and connection strings live in environment configuration and are never committed
- `Qdrant` must not be exposed to the public internet and should require authentication in any shared environment
- recommendation output must respect the same privacy boundaries as the underlying content, especially on shared-device surfaces

## Rollout Plan

1. Accept `Qdrant` as the vector store for semantic discovery and recommendations, and only for that
2. Do not add `Qdrant` to the running application until a concrete workload requires it; the first qualifying workload is multilingual semantic search over indexed content
3. When the first workload lands, introduce `Qdrant` behind a domain-owned boundary in `Search` or `Recommendations`, with a `PostgreSQL` keyword and metadata fallback and a trending or editorial fallback beyond that
4. Add an optional `Qdrant` service to `infrastructure/docker-compose.yml`, and document every new environment variable in `.env.example` and `docs/configuration.md`
5. Define collection naming, the embedding model and version to record with each collection, and a reindex procedure before first use
6. Add integration tests covering the fallback path when a vector lookup fails or `Qdrant` is unavailable
7. Proceed to the next ADR in the backlog only after this one is validated

## Validation and Success Metrics

This decision is considered successful if:

- the application builds, tests, and runs with and without `Qdrant`
- CI stays green without requiring a live `Qdrant`
- a test proves the fallback path when a vector lookup fails or `Qdrant` is unavailable
- a full reindex from `PostgreSQL` alone reproduces the search index
- no durable or non-reconstructible state exists only in `Qdrant`
- semantic search measurably outperforms keyword-only search on a defined relevance set, including Bangla queries
- lookup latency stays within the budget set for mobile-first usage

## Rollback or Exit Strategy

Because `Qdrant` holds only derived data, exit is low-risk by design.

The exit path is:

1. disable `Qdrant` through configuration, exercising the same fallback path that local development already uses
2. confirm the application continues to serve search and recommendations from `PostgreSQL` and editorial content with degraded but correct behaviour
3. remove the dependency and its environment variables in the same change that removes their usage, per handbook section `4.3`
4. decommission the `Qdrant` instance

Migration to a different vector store, including `pgvector`, should be considered only if `Qdrant` proves unreliable, operationally expensive, or non-compliant for the deployment region. Any replacement must preserve the same guarantee: derived data only, with a fallback path when vector lookup fails.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles`
  - `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent`
  - `ENGINEERING_HANDBOOK.md` section `3.2 Core Domains`
  - `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram`
  - `ENGINEERING_HANDBOOK.md` section `4.1 Local Tooling Baseline`
  - `ENGINEERING_HANDBOOK.md` section `4.3 Dependency Management Rules`
  - `ENGINEERING_HANDBOOK.md` section `5.5 Data Layer Standards`
  - `ENGINEERING_HANDBOOK.md` section `8.2 Performance Tests`
  - `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
  - `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
  - `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
  - `docs/configuration.md`
- Related PRs:
  - `docs/adr-006-qdrant` introduces this decision
- External references:
