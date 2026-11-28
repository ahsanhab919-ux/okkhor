# Architecture Docs

Store system design, module contracts, failure handling, and architecture-specific implementation guides here.

## Current Documents

- `system-overview.md` - the system shape, runtime topology, request lifecycle, and module map (`ADR-001`, `ADR-002`)
- `module-boundaries.md` - module layering, dependency direction, and boundary review rules (`ADR-001`)
- `api-contracts.md` - the HTTP surface, request/response shapes, error envelope, and cookies
- `data-models.md` - domain types, PostgreSQL schema, in-memory store, and driver selection
- `server-vs-client-components.md` - server-first rendering rules and the client-island inventory (`ADR-002`)
- `operational-calendar.md` - calendar model and readiness checklist for regional demand events (`ADR-008`)
- `authentication-backend-slice.md` - auth domain flow, persistence behavior, migration workflow, and validation notes
- `content-comprehension-slice.md` - first product slice: research-item read path (status: Implemented; read path only)
- `content-authoring-slice.md` - second product slice: create/edit/publish research items (status: Implemented)
- `scholar-verification-slice.md` - third product slice: credentials application and admin review granting the `scholar` role (status: Implemented)
- `community-slice.md` - fourth product slice: member-authored discussion threads and replies (status: Implemented)
- `discovery-slice.md` - fifth product slice: keyword/metadata search over research and community, the `ADR-006` fallback baseline (status: Implemented)
- `ai-summarization-slice.md` - sixth product slice: AI-generated English + Bangla summaries on publish (status: Implemented)
- `library-slice.md` - seventh product slice: per-member saved research items ("My Library") (status: Implemented)
- `member-profile-slice.md` - eighth product slice: member profile pages (`/profile` and `/u/[id]`) (status: Proposed)
- `nbu-ux-and-phone-first-identity.md` - NBU UX rules and phone-first identity implementation guidance

## Expected Future Additions

- (none scheduled)

