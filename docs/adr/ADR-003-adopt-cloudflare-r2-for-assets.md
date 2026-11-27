# ADR-003: Adopt Cloudflare R2 for Assets

- Status: `Accepted`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap asset storage and media delivery baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is a multilingual, media-heavy knowledge platform. Beyond structured content, the product will ship binary assets such as:

- short-form learning videos and clips
- audio tracks and podcast-style recordings
- thumbnail images and posters
- generated transcripts, caption tracks, and derived renditions
- user or editorial uploads that must be stored before processing

These assets must be delivered to:

- low-end Android devices with `2-4 GB RAM`
- unstable, high-latency 3G/4G connections across South Asia
- shared-device household environments with limited data budgets

The already accepted ADRs constrain the shape of this decision:

- `ADR-001` establishes a modular monolith with explicit internal boundaries, including `Video Processing` and `Video Delivery` domains
- `ADR-002` establishes a server-first Next.js App Router web surface, so asset URLs are typically embedded in server-rendered responses and cached at the edge

The handbook lists this decision explicitly:

- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` → `ADR-003: Adopt Cloudflare R2 for assets`
- `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram` shows `Video Processing` and `Video Delivery` both writing to `R2`

The platform therefore needs an object storage layer that is:

- cost-predictable under video-heavy egress
- reliably fast for South Asian mobile networks
- simple enough to operate without a dedicated storage team
- decoupled from the application runtime so the monolith stays stateless
- compatible with a `FFmpeg`-based media processing pipeline

The key decision is where binary assets live and how they are delivered. The application database (`PostgreSQL`, subject to `ADR-004`) must not become an asset store, and the application servers must not serve binary media directly.

## Decision

Adopt `Cloudflare R2` as the default object storage layer for product assets, delivered through `Cloudflare CDN`, with `Cloudflare Workers` used for edge authorization and URL signing where needed.

This means:

- R2 is the canonical origin for uploaded and generated binary assets
- the application writes assets to R2 through its `S3-compatible` API
- clients upload and download through `presigned URLs` rather than proxying bytes through the Next.js application
- R2 public or signed delivery is fronted by the Cloudflare CDN so media is cached close to users
- Workers may authorize or sign access at the edge without a round trip to the application server
- derived assets, such as transcoded renditions and caption tracks, are written back to R2 by the media processing pipeline

This decision applies to all product binary assets:

- video and audio masters
- transcoded renditions and thumbnails
- caption and transcript files
- editorial and user uploads
- static media served as part of the web product

This decision does not apply to:

- structured application data, which remains in `PostgreSQL`
- cache and ephemeral session state, which remains in `Redis`
- vector embeddings, which remain in `Qdrant`
- build artifacts and repository content, which stay in version control and the CI pipeline

This decision does not prohibit storing small, fully inlined UI assets in the repository when they are genuinely tiny and part of the design system.

## Decision Drivers

- cost predictability for video-heavy egress traffic
- delivery latency and throughput on South Asian mobile networks
- simplicity of operation for an early-stage team
- stateless application servers within the modular monolith
- compatibility with a `FFmpeg`-based media processing pipeline
- `S3-compatible` API for tooling and library reuse
- separation of asset storage from application data
- safe, scoped access to media through presigned and signed URLs
- alignment with the already documented `Cloudflare R2 + CDN + Workers` direction
- South Asian infrastructure reality: unbounded egress pricing is a direct product risk

## Options Considered

### Option A

- Description: Adopt Cloudflare R2 as the asset origin, delivered through Cloudflare CDN, with Workers for edge signing and authorization
- Pros:
  - `S3-compatible` API, so existing object storage tooling and libraries apply
  - no separate egress charge for asset delivery, which directly protects unit economics for video
  - CDN delivery aligned with serving media to South Asian mobile users
  - Workers allow edge-level signing and access control
  - keeps the modular monolith stateless with respect to binaries
  - fits the already documented stack direction in the handbook
- Cons:
  - introduces Cloudflare as a structural dependency for media delivery
  - team must learn R2, Workers, and presigned URL patterns
  - some advanced S3 features are not available and must be designed around

### Option B

- Description: Adopt AWS `S3` as the asset origin with `CloudFront` as the CDN
- Pros:
  - mature, feature-complete object storage
  - extensive ecosystem, tooling, and documentation
  - granular IAM and lifecycle controls
- Cons:
  - per-gigabyte egress pricing is a structural cost risk for video-heavy products
  - more operational surface than the current team needs at bootstrap stage
  - latency to South Asian users depends on region choice and CDN configuration
  - does not match the `Cloudflare R2 + CDN + Workers` direction already documented

### Option C

- Description: Self-hosted object storage such as `MinIO` on owned or rented infrastructure, or serving media directly from application servers
- Pros:
  - full control over data location and configuration
  - no third-party storage vendor dependency
  - potentially lowest marginal cost at very large, steady volume
- Cons:
  - significant operational burden for backups, replication, and durability
  - no built-in global CDN, so mobile delivery quality suffers without extra work
  - scaling storage and delivery becomes a direct engineering responsibility
  - high risk for an early-stage team focused on product velocity
  - conflicts with the principle that performance is accessibility on weak networks

## Why This Decision Was Chosen

`Cloudflare R2` with Cloudflare CDN and Workers is the best fit for the current stage of the project because it removes the single largest cost risk in a media product — egress — while keeping delivery fast for South Asian mobile users.

It is preferred over `S3 + CloudFront` because the product is video-heavy by design. Predicting cost under per-gigabyte egress pricing is difficult at bootstrap stage, and avoiding that risk is worth more than the additional S3 feature surface the team does not yet need. The `S3-compatible` API means this choice stays low-regret: migration paths remain open if the platform ever requires a different origin.

It is preferred over self-hosted object storage because the team's scarce resource is engineering time, not storage control. Running durable, replicated, CDN-backed media infrastructure is a specialized operational burden that does not advance the product's core value.

This decision also reinforces the modular monolith. Assets live outside the application, the application stays stateless, and `Video Processing` and `Video Delivery` interact with storage through a narrow, well-defined boundary. That keeps the option of extracting those domains later open without a data migration.

## Consequences

### Positive

- asset delivery cost becomes predictable even as video volume grows
- media is cached at the edge, improving experience on weak and unstable networks
- application servers stay stateless and do not carry binary traffic
- the `S3-compatible` API keeps tooling, libraries, and migration options open
- `Video Processing` and `Video Delivery` share one clear storage boundary
- presigned URLs reduce the need to proxy uploads and downloads through the app

### Negative

- Cloudflare becomes a structural dependency for media delivery
- the team must adopt presigned URL, signed URL, and edge-authorization patterns
- some S3-specific features and semantics are not available and must be worked around
- local development and testing require an R2-compatible strategy rather than a true remote bucket
- asset lifecycle, retention, and access rules must be explicitly designed rather than assumed

## Operational Impact

Expected operational effects:

- CI/CD does not need to manage media; it only validates application code and configuration
- environment configuration must include R2 bucket bindings or credentials per environment
- observability should cover upload failures, processing failures, and delivery errors
- incident response must account for storage access failures and degraded asset delivery
- runbooks are required for media ingestion, reprocessing, and recovery scenarios
- team workflows must treat asset storage as shared infrastructure with clear ownership

## Security and Compliance Impact

- all buckets are private by default; public access is granted only through explicit CDN or signed URL configuration
- access uses scoped credentials and presigned URLs with short expiries
- user-uploaded content must be validated for type and size before storage
- edge authorization through Workers must not be the only line of defense for sensitive assets
- data handling must respect regional privacy expectations for user-generated media
- shared-device considerations require that signed URLs expire and are not reused across users
- deletion and retention policies must be defined for user content and derived assets

## Rollout Plan

1. Accept Cloudflare R2 as the default asset storage layer for the product
2. Add a storage module boundary under the application for R2 access through the `S3-compatible` API
3. Define environment-specific buckets and scoped credentials
4. Introduce presigned upload and download flows for user and editorial assets
5. Wire the media processing pipeline to read from and write to R2
6. Configure CDN delivery and, where needed, Workers-based edge signing
7. Add a local and test strategy for object storage so development does not depend on production buckets
8. Document asset naming, lifecycle, retention, and access rules in `docs/architecture`
9. Proceed to the next ADR in the backlog only after this one is validated

## Validation and Success Metrics

This decision is considered successful if:

- asset upload and download flows work through presigned URLs without proxying through the app
- CDN cache hit ratios for media are high enough to reduce origin load
- media delivery latency on target mobile networks stays within acceptable product bounds
- storage and delivery costs remain predictable as media volume grows
- reprocessing and derivative generation work reliably against R2
- no application server serves binary media directly

## Rollback or Exit Strategy

If R2 proves to be a poor fit, the exit path is a controlled migration to another `S3-compatible` origin rather than ad hoc divergence.

Migration should only be considered if:

- delivery performance or reliability repeatedly fails product needs
- operational constraints make Cloudflare unworkable for the team
- cost or compliance requirements materially change

Because R2 uses an `S3-compatible` API and assets are referenced indirectly through application-managed keys and URLs, the exit path is:

1. introduce a storage abstraction boundary if one does not already exist
2. dual-write or copy assets to the replacement origin
3. switch CDN and signing configuration
4. verify delivery and reprocessing
5. decommission the previous origin

Until such evidence exists, R2 remains the default asset storage layer.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.4 High-Level System Intent`
  - `ENGINEERING_HANDBOOK.md` section `3.2 Core Domains`
  - `ENGINEERING_HANDBOOK.md` section `3.3 System Context Diagram`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
- Related PRs:
- External references:
