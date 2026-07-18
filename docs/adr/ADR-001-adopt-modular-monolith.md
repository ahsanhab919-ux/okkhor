# ADR-001: Adopt Modular Monolith

- Status: `Accepted`
- Date: `2026-07-18`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap architecture baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is being built as a multilingual, AI-powered knowledge platform for South Asian users. The product must operate well on low-end Android devices, unstable 3G/4G networks, and cost-sensitive mobile usage patterns.

At the current stage, the repository and platform are in bootstrap mode. The team needs:

- fast iteration
- low operational overhead
- clear internal domain boundaries
- simpler testing and debugging
- predictable deployment and rollback

The platform already anticipates multiple domains, including:

- Identity
- Content
- Video Processing
- Video Delivery
- Search
- Recommendations
- Rules Engine
- Localization
- Analytics
- Operational Intelligence

The key architectural choice is whether to begin with:

- a modular monolith
- or a microservices-first distributed system

## Decision

Adopt a `modular monolith` as the default application architecture for the current project stage.

This means:

- one primary deployable application
- explicit internal module boundaries
- shared runtime and deployment path
- controlled in-process communication between modules
- later extraction of services only when justified by scale, ownership, or operational risk

This decision applies to the core application in the current startup and early growth phases.

This decision does not prohibit:

- async job workers
- edge functions
- external managed infrastructure such as PostgreSQL, Redis, Qdrant, or Cloudflare

## Decision Drivers

- delivery speed
- operational simplicity
- reduced distributed-system complexity
- easier local development
- lower DevOps burden
- faster iteration for a small team
- better fit for current repository maturity
- South Asian infrastructure reality, where reliability and simplicity matter more than premature service fragmentation

## Options Considered

### Option A

- Description: Start with a modular monolith and strong internal module boundaries
- Pros:
  - fastest path to a usable product
  - easier debugging and local development
  - fewer network and coordination failure modes
  - simpler release, rollback, and testing flow
  - aligns with current team and repo maturity
- Cons:
  - requires discipline to maintain clean module boundaries
  - a single deployable can create future blast-radius concerns if left unchecked

### Option B

- Description: Start with microservices for each major domain
- Pros:
  - strong operational isolation per domain
  - independent scaling and release paths
  - clear ownership boundaries at larger team scale
- Cons:
  - much higher complexity now
  - more CI/CD, observability, and networking overhead
  - more cross-service failure modes
  - slower startup delivery for the current stage

### Option C

- Description: Start with a loosely structured monolith without formal domain boundaries
- Pros:
  - simplest short-term coding model
  - lowest initial ceremony
- Cons:
  - architecture degrades quickly
  - encourages coupling and code sprawl
  - makes later extraction and governance much harder

## Why This Decision Was Chosen

The modular monolith gives the project the best balance between speed and discipline.

It is better than microservices at this stage because the team does not yet benefit enough from distributed independence to justify the operational cost. It is better than an unstructured monolith because it preserves domain boundaries from day one and reduces the risk of chaotic code growth.

This decision also aligns with the product's regional operating reality. The platform must spend complexity budget on user-facing resilience, performance, multilingual delivery, and low-end device support, not on premature internal service sprawl.

## Consequences

### Positive

- faster implementation and onboarding
- simpler local setup and test execution
- easier end-to-end debugging
- lower infrastructure coordination burden
- cleaner path to initial product-market fit

### Negative

- stricter code review discipline is required to protect module boundaries
- some future domains may need extraction once scale increases
- poor internal design would make later evolution harder if governance is weak

## Operational Impact

Expected operational effects:

- simpler CI/CD pipeline in the near term
- simpler staging and rollback procedures
- easier observability setup in early phases
- easier incident triage because major logic remains in one deployable context
- stronger need for internal architecture reviews to prevent coupling

## Security and Compliance Impact

- authorization rules still must be enforced at server boundaries inside the monolith
- shared-device and privacy safeguards remain mandatory at the product layer
- compliance-sensitive logic should still be isolated through rules engines and explicit module design
- fewer inter-service communication paths reduces some accidental exposure risk in early phases

## Rollout Plan

1. Use the modular monolith as the baseline architecture for repository scaffolding
2. Organize code by domain modules, not by technical layer alone
3. Create supporting ADRs for:
   - Next.js App Router
   - PostgreSQL
   - Redis
   - Qdrant
4. Add module boundary documentation in `docs/architecture`
5. Re-evaluate service extraction only when:
   - team size increases significantly
   - domains need independent deployment
   - scaling profiles diverge materially

## Validation and Success Metrics

This decision is considered successful if:

- the repository is scaffolded by clear module boundaries
- new features can be added without cross-module sprawl
- local development remains simple
- deployment and rollback remain low-friction
- architecture reviews show low hidden coupling

## Rollback or Exit Strategy

If the modular monolith becomes an operational bottleneck, the exit path is selective extraction, not a full rewrite.

Candidate extraction triggers include:

- one domain requiring independent scale
- one domain creating repeated deployment risk
- one domain needing separate ownership and release cadence

The first extraction should be based on measured pain, not architectural fashion.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `3.1 Architecture Style`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
- Related PRs:
- External references:
