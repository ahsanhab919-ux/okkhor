# Module Boundaries

- Status: `Active`
- Related ADR: `ADR-001` (Adopt Modular Monolith)
- Owner: `Engineering Lead`

## 1. Purpose

`ADR-001` chooses a modular monolith: one deployable, many internal modules with explicit
boundaries. That decision only holds if the boundaries are actually maintained. This
document defines the module layout, the allowed dependency direction, and the review checks
that keep the monolith modular instead of slowly decaying into a ball of mud.

Because the decision is enforced by discipline rather than by the network, this file is the
authority contributors and reviewers cite when a boundary is questioned.

## 2. The Rule

Code is organized **by domain module**, not by technical layer across the whole repository.

- Every domain lives under `src/modules/<module>/`.
- Each module owns its own layers; there is no shared `src/services`, `src/utils`, or
  global controller/model layer.
- Cross-module access happens through a module's **public surface** (its exported
  functions and types). Reaching into another module's internals is a boundary violation.

This is the difference between ADR-001's Option A and Option C: the structure is imposed
up front so that later extraction, if ever needed, is a refactor rather than a rescue.

## 3. Layers and Dependency Direction

Each module is layered internally. Dependencies point **inward and downward**:

```
        ui  ──┐
             ├──► application ──► domain
        api ─┘         │
                      ▼
              infrastructure ──► domain
```

Reading that as rules:

1. `domain` depends on **nothing** in the module except other `domain` files. It holds
   types, config constants, pure helpers, schemas, and errors. No I/O, no framework imports,
   no database clients.
2. `application` depends on `domain`. It orchestrates use cases and is the place business
   rules live. It may call `infrastructure` **only** through the interfaces declared in
   `domain`.
3. `infrastructure` depends on `domain` (to implement the interfaces) and on external
   libraries (database drivers, Redis, etc.). It never depends on `application`, `api`, or
   `ui`.
4. `api` and `ui` are the outer edges. They depend on `application` / `domain` and adapt
   them to HTTP or to React. They contain no business rules.
5. `client` (only where present) is browser-only code, marked `"use client"`. It depends on
   `domain` types only; it talks to the server through HTTP, never by importing server-only
   code.

## 4. Layer Responsibilities

| Layer | Contains | Must not contain |
| --- | --- | --- |
| `domain` | Types, config constants, pure validators/schemas, error classes, JWT/phone helpers | I/O, `process.env` reads that change behaviour per deployment except through documented config helpers, framework imports |
| `application` | Use cases (`registerUser`, `loginUser`, rate-limit enforcement), orchestration, repository selection | HTTP types (`NextRequest`), React, direct SQL |
| `infrastructure` | Driver implementations (PostgreSQL, memory, Redis), connection config | Business rules, HTTP shaping |
| `api` | Route-level HTTP adapters, request parsing helpers, cookie/error shaping | Domain logic, direct database calls |
| `ui` | React components and page shells | Direct data-layer access from the server, business rules |
| `client` | `"use client"` browser helpers (fetch wrappers, interactive widgets) | Server-only imports (`node:*`, repository modules) |

## 5. Module Inventory

### 5.1 `identity` — implemented, fully layered

```
src/modules/identity/
  domain/         auth-config.ts, auth-errors.ts, auth-jwt.ts,
                  auth-navigation.ts, auth-schemas.ts, auth-types.ts, phone-auth.ts,
                  auth-codes.ts         (6-digit reset-code generation + length constant)
  application/    auth-service.ts, auth-rate-limit.ts
  infrastructure/ auth-repository.ts  (driver selector)
                  auth-store.ts       (in-memory repository)
                  postgres-auth-repository.ts
  api/            auth-http.ts        (cookie + error helpers)
  client/         session-client.ts   ("use client" session fetch helpers)
  ui/             auth-page-shell.tsx, phone-auth-flow.tsx,
                  credential-auth-panel.tsx, protected-workspace-shell.tsx,
                  profile-card.tsx      (server-safe member header)
                  email-settings-form.tsx (owner-only account-email island on /profile)
```

`identity` is the reference example for the layering. New modules should follow it.

### 5.2 `platform` — implemented, partially layered

```
src/modules/platform/
  domain/         runtime-status.ts
                  notification-types.ts    (NotificationDestination/Message/Channel port)
  infrastructure/ ephemeral-store.ts       (memory/Redis selector)
                  postgres-config.ts       (shared pool config)
                  notification-channel.ts  (channel driver selector + fan-out)
                  log-notification-channel.ts    (dev/test channel + recorded test double)
                  sms-notification-channel.ts    (HTTPS gateway channel)
                  email-notification-channel.ts  (HTTPS gateway channel; skips without an email)
```

`platform` holds cross-cutting concerns that are not owned by a single product domain. It
currently has no `application`, `api`, or `ui` layer; add those only when a use case needs
them.

The **password-reset-delivery slice** adds the notification port here (not a new module): a
channel is cross-cutting infrastructure, exactly like the ephemeral store, so it lives in
`platform` and `identity` consumes it ([password-reset-delivery-slice.md](password-reset-delivery-slice.md)
§8). The port types are identity-agnostic — they carry only contact points and text — so
`platform` still imports no domain module.

### 5.3 `experience` — implemented, not yet layered

```
src/modules/experience/
  site-content.ts   (static content model)
  ui.tsx            (shared presentational components)
```

`experience` holds the public marketing/presentation content and shared UI building blocks.
It is currently flat. When it grows real behaviour (data fetching, personalization), it must
be split into the standard layers; until then a flat module is acceptable because it has no
application or infrastructure logic to separate.

### 5.4 `content` — implemented, fully layered

```
src/modules/content/
  domain/         content-types.ts, content-errors.ts, content-pagination.ts
  application/    content-service.ts      (list/get use cases, cursor codec)
  infrastructure/ content-repository.ts   (driver selector)
                  content-store.ts        (in-memory repository)
                  postgres-content-repository.ts
  api/            content-http.ts         (response + error shaping)
  ui/             content-views.tsx       (server-safe presentational components)
```

`content` owns the research-comprehension read path. It depends on `platform` for the shared
Postgres pool config and on nothing else at module level; it does not import `identity`. It
is the second fully-layered module after `identity` and should be read alongside it when
adding a new domain.

The **topic-browse slice** widens `content`'s read surface with two public reads — the
distinct-published-tag rollup and the published-by-tag list — both owned by the module and
exercised at the composition root (`app/topics`, `app/tags/[tag]`). No new module or edge is
added.

### 5.5 `verification` — implemented, fully layered

```
src/modules/verification/
  domain/         verification-types.ts, verification-errors.ts,
                  verification-schemas.ts, verification-authorization.ts,
                  verification-state.ts
  application/    verification-service.ts   (save/submit/decide use cases)
  infrastructure/ verification-repository.ts (driver selector)
                  verification-store.ts        (in-memory repository)
                  postgres-verification-repository.ts
  api/            verification-http.ts       (response + error shaping)
  ui/             verification-form.tsx       (applicant island)
                  verification-review.tsx     (admin decision island)
```

`verification` owns the scholar-verification application and its review state machine. Like
`content`, it depends on `platform` for the shared Postgres pool config and does not import
`identity`; the role *grant* on approval is performed by the composition root (`app/**`)
calling identity's `grantUserRole` public surface.

### 5.6 `community` — implemented, fully layered

```
src/modules/community/
  domain/         community-types.ts, community-errors.ts,
                  community-schemas.ts, community-pagination.ts,
                  community-authorization.ts  (canModerate — admin-only moderator gate)
  application/    community-service.ts      (list/create/read/reply + moderation use cases, cursor codec)
  infrastructure/ community-repository.ts   (driver selector)
                  community-store.ts         (in-memory repository)
                  postgres-community-repository.ts
  api/            community-http.ts         (response + error shaping)
  ui/             thread-form.tsx           (create island)
                  reply-form.tsx             (reply island)
                  thread-list.tsx            (shared server-safe discussion list)
                  moderation-controls.tsx    (admin hide/restore + lock/unlock island)
                  report-controls.tsx        (member report island)
                  report-triage-controls.tsx (admin resolve/dismiss island)
```

`community` owns member-authored discussion: threads and their flat, chronological replies. It
depends on `platform` for the shared Postgres pool config and imports identity **types only**
(`UserRole`); the acting member is resolved in the composition root (`app/**`) and passed in as
`{ id, roles }`. It does not import `content` or `verification`.

The **community-moderation slice** extends the same module with no new module, entity, or
infrastructure: `community-authorization.ts` mirrors verification's `verification-authorization.ts`
(the admin-only `canModerate`, the precedent for `canReview`), the moderation state lives on the
existing `CommunityThread`/`CommunityReply` types, and `moderation-controls.tsx` is a second `ui`
island alongside the create/reply forms. The moderator surfaces are composed in `app/admin/community/**`
and the actor is resolved by `app/community-session.ts` — the same composition-root pattern as the
rest of `community`.

The **topic-browse slice** likewise stays internal to `community`: it adds two visible-only
repository reads (the distinct-category rollup and the threads-by-category list) and no new
module, entity, or edge. The category pages are composed in `app/categories/**` and reuse the
existing `ThreadList` presentational component.

The **member-reporting slice** also stays internal to `community` and adds **no new module and
no cross-module edge**: the report entity lives in the existing `community-types.ts`, the two
error codes in `community-errors.ts`, the `createReportSchema`/`resolveReportSchema` in
`community-schemas.ts`, the use cases in `community-service.ts`, the repository methods in
`community-store.ts`/`postgres-community-repository.ts`, and two new `ui` islands
(`report-controls.tsx` for the member, `report-triage-controls.tsx` for the admin). The member
write path is composed at `app/community/[id]/page.tsx`, the admin queue at
`app/admin/community/reports/page.tsx`, and the actor is still resolved by
`app/community-session.ts`; reports reuse the moderation slice's hide/restore use cases for the
inline action rather than introducing a new visibility mechanism.

### 5.7 `search` — implemented, fully layered

```
src/modules/search/
  domain/         search-types.ts, search-errors.ts,
                  search-schemas.ts         (query schema + tokenizer)
  application/    search-service.ts         (scoring, merge, sort, pagination)
  infrastructure/ search-repository.ts      (driver selector)
                  search-store.ts            (in-memory repository)
                  postgres-search-repository.ts
  api/            search-http.ts            (response + error shaping)
  ui/             search-form.tsx           (query island)
                  search-results.tsx         (results view)
```

`search` owns the discovery read model: it projects published research and community threads
into a flat `SearchDocument` list, scores them per query token, and returns ranked hits. It
depends on `platform` for the shared Postgres pool config and imports content/community
**types only** (`ResearchItem`, `CommunityThread`). The in-memory repository composes their
memory repositories (`getMemoryContentRepository`, `getMemoryCommunityRepository`) to build
the read model; the PostgreSQL repository queries `content_items` and `community_threads`
directly. It is strictly read-only and owns no writes.

### 5.8 `summarization` — implemented, fully layered

```
src/modules/summarization/
  domain/         summarization-types.ts    (SummarizeInput, SummaryResult, SummaryProvider)
                  summarization-errors.ts   (AI_* codes)
                  summarization-schemas.ts  (input + provider-output schemas)
  application/    summarization-service.ts  (validate -> provider -> validate output)
  infrastructure/ summary-provider.ts       (AI_SUMMARY_DRIVER selector)
                  fake-summary-provider.ts
                  gemini-summary-provider.ts
  api/            summarization-http.ts     (response + error shaping)
```

`summarization` is a leaf module: it produces an English + Bangla summary from a plain
`{ title, abstract, sourceLanguage }` input via its configured provider. It imports **no other
module** — not `content` (it is handed plain data) — and reads the provider credential only in
`infrastructure`. The `content` module does not import `summarization` either; the two are joined
only in the composition root (`app/api/content/items/**`), where a small helper
(`summarize-on-publish.ts`) owns the generate → inject → write ordering. See
[ai-summarization-slice.md](ai-summarization-slice.md).

### 5.9 `library` — implemented, fully layered

```
src/modules/library/
  domain/         library-types.ts, library-errors.ts,
                  library-schemas.ts          (save schema)
  application/    library-service.ts          (save/list/remove/isSaved use cases)
  infrastructure/ library-repository.ts       (driver selector)
                  library-store.ts             (in-memory repository)
                  postgres-library-repository.ts
  api/            library-http.ts             (response + error shaping)
  ui/             save-item-button.tsx         (Save/Saved toggle + Remove island)
                  library-list.tsx             (server presentational list)
```

`library` owns per-member saved research items ("My Library"): it writes only to its one
`saved_items` table and stores no item content. It depends on `platform` for the shared Postgres
pool config and imports identity **types only** (`UserRole`) and content **types only**
(`ResearchItem`) where it must name them; the acting member, the saved-list hydration, and the
published-target check are all composition-root concerns resolved in `app/**` (via content's
`getPublishedItemsByIds` public surface). It does not import `content`, `search`, or
`verification` behaviour.

### 5.10 `notifications` — implemented, fully layered

```
src/modules/notifications/
  domain/         notification-types.ts, notification-errors.ts,
                  notification-schemas.ts       (limit parsing)
  application/    notification-service.ts       (create + delivery, list/mark use cases)
  infrastructure/ notification-repository.ts    (driver selector)
                  notification-store.ts          (in-memory repository)
                  postgres-notification-repository.ts
  api/            notification-http.ts          (response + error shaping)
  ui/             notification-list.tsx          (server presentational list)
                  notification-actions.tsx       (mark-read / mark-all-read island)
```

`notifications` owns the member inbox: it writes only to its one `notifications` table and stores
no contact points and no copies of moderated content. It depends on `platform` for the shared
Postgres pool config and the notification port (`notification-service.ts` imports
`getNotificationChannels`), and it imports **no other domain module**. The producers are joined to
it at the composition root: `app/api/community/notify-producers.ts` and
`app/api/verification/notify-producers.ts` resolve the recipient's contact points through identity's
`getNotificationDestinationById` and call `createNotification` after a write commits — a moderation
outcome, a new reply (deriving its recipients from the thread through community's public `getThread`),
or a scholar verification decision (notifying the applicant) — so neither `community`, `verification`,
nor `notifications` imports another of them.

## 6. Cross-Module Rules

Current dependency edges (verified in code):

- `app/**` (routes, pages) depends on `identity`, `platform`, `experience`, `content`,
  `verification`, `community`, `search`, `summarization`, `library`, and `notifications`.
- `identity` depends on `platform` for the ephemeral store (`auth-rate-limit.ts` imports
  `getEphemeralStore`) and for the notification port (the password-reset use case imports
  `getNotificationChannels`). Both are the same existing `identity → platform` edge; the slice
  adds no new module edge.
- `content` depends on `platform` for the shared Postgres pool config
  (`postgres-content-repository.ts` imports `getPostgresPoolConfig`).
- `verification` depends on `platform` for the shared Postgres pool config
  (`postgres-verification-repository.ts` imports `getPostgresPoolConfig`).
- `community` depends on `platform` for the shared Postgres pool config
  (`postgres-community-repository.ts` imports `getPostgresPoolConfig`).
- `experience` imports `identity` **types only** (`UserProfile`) for presentational props.
- `community` imports `identity` **types only** (`UserRole`) for its actor type.
- `search` depends on `platform` for the shared Postgres pool config
  (`postgres-search-repository.ts` imports `getPostgresPoolConfig`).
- `search` imports `content` and `community` **types only** (`ResearchItem`, `CommunityThread`)
  for the read model, and its in-memory repository composes their memory repositories
  (`getMemoryContentRepository`, `getMemoryCommunityRepository`) to build the read model. This
  read-only composition edge is accepted in [discovery-slice.md](discovery-slice.md) because
  `search` never writes and never exposes member-only data beyond its gated surface.
- `library` depends on `platform` for the shared Postgres pool config
  (`postgres-library-repository.ts` imports `getPostgresPoolConfig`).
- `library` imports identity **types only** (`UserRole`) and content **types only**
  (`ResearchItem`) where it must name them. The acting member is resolved in the composition
  root (`app/api/library/library-actor.ts`), and the saved-list hydration and published-target
  check go through content's `getPublishedItemsByIds` public surface in `app/**`; the module
  itself never reads `content_items`.
- The **member-profile slice** adds no new module and no new cross-module edge. It widens
  existing public surfaces — identity `getPublicProfile`, content
  `listPublishedItemsByAuthor`, community `listThreadsByAuthor`, and library
  `countSavedItems` — all resolved by the composition root (`app/profile/**`, `app/u/**`) and
  joined there. The identity join (display name, roles, member-since) happens in `app/**`, so
  no module ever resolves a member's name, and the profile pages read the same
  modules-import-types-only rule as the rest of the app.
- The **community-moderation slice** adds no new module and no new cross-module edge. It is
  entirely internal to `community` (a new domain authorization helper, new use cases, new
  repository methods, and one `ui` island); the moderator routes and pages are composed in
  `app/admin/community/**`, and the acting administrator is resolved by the shared
  `app/community-session.ts` composition-root helper.
- The **topic-browse slice** adds no new module and no new cross-module edge. The browse reads
  live in the modules that already own the data — content `listDistinctPublishedTags` /
  `listPublishedItemsByTag`, community `listDistinctCategories` / `listThreadsByCategory` — and
  the composition root (`app/topics/**`, `app/tags/**`, `app/categories/**`) joins them. The
  community reads stay visible-only at the repository, so the browse surfaces never widen what
  a member can see beyond the existing discussion list.
- The **password-reset-delivery slice** adds no new module and no new cross-module edge. It
  adds the notification port + channels to `platform` (the established leaf dependency) and
  consumes them from `identity`'s existing `platform` edge; the identity-side additions (the
  `email` field on `UserProfile`, the 6-digit code generator, the `setEmail` use case, the
  confirm rate-limit scope, and the `email-settings-form.tsx` island) all stay internal to
  `identity`. The one new endpoint (`PATCH /api/auth/profile`) is composed in
  `app/api/auth/profile/route.ts`, the sole composition root for the email edit.
- `notifications` depends on `platform` for the shared Postgres pool config
  (`postgres-notification-repository.ts` imports `getPostgresPoolConfig`) and for the
  notification port (`notification-service.ts` imports `getNotificationChannels` — the same
  `platform` edge password reset uses). It imports **no other domain module**.
- The **notifications slice** adds one new module (`notifications`, §5.10) and no edge between
  `community` and `notifications`. The producers are joined at the composition root:
  `app/api/community/notify-producers.ts` (renamed from `notify-moderation.ts` by the
  [reply-notifications slice](reply-notifications-slice.md), which added a reply producer) turns a
  community outcome — a thread hide, a reply hide, a report resolve/dismiss, or a new reply — into a
  `createNotification` call, resolving the recipient's contact points through identity's
  `getNotificationDestinationById` — a new identity public function that stays within identity's
  existing `platform` edge. The three producer routes (`app/api/community/moderation/**`) and the
  reply route (`app/api/community/threads/[id]/replies/route.ts`) invoke the helper after their
  already-authorized use case commits; the inbox routes (`app/api/notifications/**`) and the
  `/notifications` page are composed in `app/**`, so no module reaches into another.
- The **verification-notifications slice** adds no module and no edge. Its producer is a second
  composition-root helper, `app/api/verification/notify-producers.ts` (mirroring the community one),
  which turns a scholar decision into a `createNotification` call for the applicant, resolving their
  contact points through identity's `getNotificationDestinationById`. The decision route
  (`app/api/verification/applications/[id]/route.ts`) invokes it after `decideApplication` (and the
  approval grant) commits, so neither `verification` nor `notifications` imports the other.

Rules that follow:

1. **No cycles.** A module must not import from a module that imports it. If two modules
   need each other, extract the shared contract into a lower-level module (or `platform`).
2. **Types may be shared; behaviour may not be reached into.** Importing an exported domain
   *type* from another module is allowed. Importing another module's internal implementation
   file is not.
3. **`platform` is a leaf dependency.** Cross-cutting utilities live there so domain modules
   do not depend on each other for infrastructure concerns.
4. **The app layer is the only composition root.** Wiring modules together for a route or
   page happens in `app/**`, not inside a module.

## 7. Public Surface

A module's public surface is its exported functions and types. Practically:

- Other modules may import: exported types (`auth-types.ts`), and documented entry points
  such as `getEphemeralStore`, `getRuntimeStatus`, `enforceAuthRateLimit`.
- Other modules must **not** import: repository implementations, driver selectors' internals,
  `ui` components of another module (unless the component is explicitly exported for reuse),
  or `client` helpers.

When a module needs a new capability exposed, add it to the module's public surface
deliberately rather than importing a deeper file.

## 8. Boundary Review Checklist

Use this when reviewing a change that touches more than one module, or that adds a new
module:

- [ ] The new code sits in the correct module and the correct layer.
- [ ] Dependencies still point inward/downward (no `domain` importing `infrastructure`, etc.).
- [ ] No new cross-module import reaches past a public surface.
- [ ] No import cycle was introduced.
- [ ] `domain` stays free of I/O and framework imports.
- [ ] Business rules are in `application`, not in `api`/`ui`.
- [ ] Any new infrastructure driver follows the selector pattern in §5.1 / §5.2.

## 9. Validation and Success Metrics

`ADR-001` defines the success conditions; this document operationalizes them:

- the repository is scaffolded by clear module boundaries (see §5)
- new features can be added without cross-module sprawl (§6, §8)
- local development stays simple (one app, one test command)
- deployment and rollback stay low-friction (single deployable)
- architecture reviews show low hidden coupling (the checklist in §8)

## 10. Applied Example

A new "community feed" feature would:

1. add `src/modules/community/` with `domain` (post types), `application` (list/create use
   cases), `infrastructure` (repository + driver selector), and `api` (if it exposes HTTP);
2. import `identity` **types** for author identity, and `platform` for any cross-cutting
   concern;
3. be composed into `app/community/**` — the existing protected route — which is the only
   place the modules are wired together.

It would **not** import the identity repository, reach into another module's `ui`, or add a
shared `src/lib` catch-all.

## 11. Escape Hatch

If a module must be extracted into its own service, the trigger and process are defined in
`ADR-001` §"Rollback or Exit Strategy": extract on **measured pain** (independent scale,
repeatedly risky deploys, or a distinct ownership cadence), one domain at a time, keeping
the same layer structure so the move is mechanical rather than architectural.
