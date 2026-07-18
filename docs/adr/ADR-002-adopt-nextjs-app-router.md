# ADR-002: Adopt Next.js App Router

- Status: `Accepted`
- Date: `2026-07-18`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap frontend architecture baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` needs a primary application framework for the main web product surface. The platform must deliver multilingual knowledge content in a way that performs well on low-end devices, unstable networks, and shared-device environments common across South Asia.

The already accepted `ADR-001` establishes that the product should start as a modular monolith. The frontend framework therefore needs to work well with:

- a shared application codebase
- server-first rendering
- progressive enhancement
- lean client bundles
- a strong TypeScript-first workflow

The team must choose a default framework that supports:

- fast delivery in bootstrap mode
- good SEO and shareability for content discovery
- strong rendering flexibility
- maintainable routing and layout patterns
- a practical path to edge-aware delivery later

## Decision

Adopt `Next.js` with the `App Router` as the default application framework for the primary web experience.

This means:

- route and layout structure will follow App Router conventions
- server components are the default unless client interactivity is required
- server-side rendering, static generation, and route-level loading/error boundaries are available by design
- the framework becomes the baseline for future TypeScript and frontend scaffolding

This decision applies to the main web application.

This decision does not prohibit:

- targeted client components where needed
- edge logic in Cloudflare Workers
- native or mobile-specific clients in the future if justified

## Decision Drivers

- performance as accessibility
- server-first rendering support
- strong fit with TypeScript
- faster bootstrap delivery
- routing and layout conventions out of the box
- easier content discovery and SEO posture
- compatibility with future edge-aware delivery patterns
- better fit for the current team and repo maturity than more fragmented setups

## Options Considered

### Option A

- Description: Adopt Next.js App Router as the primary application framework
- Pros:
  - strong built-in routing and layout model
  - supports server components and server-first rendering
  - good fit for content-heavy, discoverable web surfaces
  - strong TypeScript ecosystem support
  - practical default for a modular monolith web app
- Cons:
  - introduces framework conventions the team must follow consistently
  - some features require discipline to avoid overusing client-side code

### Option B

- Description: Adopt Remix as the primary application framework
- Pros:
  - strong web fundamentals
  - good data-loading model
  - progressive enhancement mindset
- Cons:
  - weaker alignment with the current team direction already documented in the handbook
  - less direct alignment with the planned Okkhor stack baseline
  - adds avoidable decision churn at bootstrap stage

### Option C

- Description: Build a custom React setup without a full framework baseline
- Pros:
  - high control
  - minimal framework lock-in
- Cons:
  - slower bootstrap velocity
  - more manual setup for routing, rendering, build behavior, and conventions
  - weaker consistency for an early-stage team

## Why This Decision Was Chosen

Next.js App Router provides the best balance of delivery speed, rendering flexibility, and long-term maintainability for the current stage of the project.

It is preferred over Remix because the handbook and project direction already assume a Next.js-centered stack, and changing that now would create unnecessary uncertainty without a compelling technical gain. It is preferred over a custom React setup because the team needs sensible defaults and faster execution, not more bootstrap burden.

This decision also supports the South Asian operating reality. Server-first rendering and lean client boundaries help reduce the load placed on weak devices and unstable networks, which aligns directly with the principle that performance is accessibility.

## Consequences

### Positive

- faster repository scaffolding for the web app
- clearer routing and layout conventions
- better support for SEO and content discovery
- easier alignment with TypeScript-first standards
- stronger default path for performance-sensitive rendering decisions

### Negative

- the team must understand App Router conventions well
- poor discipline could still lead to bloated client bundles
- some future integration patterns may require framework-specific tradeoffs

## Operational Impact

Expected operational effects:

- frontend scaffolding can standardize around one framework
- CI/CD can validate one primary build path
- architecture docs can define routing, rendering, and component rules more clearly
- onboarding becomes easier because the team shares one frontend mental model

## Security and Compliance Impact

- server-side data access boundaries must still be designed carefully
- auth and entitlement checks must not rely only on client behavior
- localization and shared-device safeguards remain application responsibilities
- framework adoption does not remove the need for explicit data validation and access control

## Rollout Plan

1. Accept Next.js App Router as the default framework for the main web application
2. Add supporting ADRs for:
   - PostgreSQL
   - Redis
   - Qdrant
3. Scaffold repository files for:
   - TypeScript configuration
   - linting and formatting
   - app directory structure
4. Document server vs client component usage in `docs/architecture`
5. Validate bundle and rendering decisions as the app grows

## Validation and Success Metrics

This decision is considered successful if:

- the web app scaffolding aligns with App Router conventions
- initial routes remain simple to build and maintain
- client bundle growth stays controlled
- server-first rendering is used appropriately
- onboarding and contribution friction stay low for new developers

## Rollback or Exit Strategy

If Next.js App Router proves to be a poor fit, the exit path is a controlled migration to another framework rather than ad hoc divergence inside the same repository.

Migration should only be considered if:

- framework constraints repeatedly block product needs
- performance goals cannot be met with reasonable discipline
- team productivity is materially harmed over time

Until such evidence exists, the framework should remain the default baseline.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent`
  - `ENGINEERING_HANDBOOK.md` section `5.4 React and Next.js Standards`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
- Related PRs:
- External references:
