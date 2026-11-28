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
                  auth-navigation.ts, auth-schemas.ts, auth-types.ts, phone-auth.ts
  application/    auth-service.ts, auth-rate-limit.ts
  infrastructure/ auth-repository.ts  (driver selector)
                  auth-store.ts       (in-memory repository)
                  postgres-auth-repository.ts
  api/            auth-http.ts        (cookie + error helpers)
  client/         session-client.ts   ("use client" session fetch helpers)
  ui/             auth-page-shell.tsx, phone-auth-flow.tsx,
                  credential-auth-panel.tsx, protected-workspace-shell.tsx
```

`identity` is the reference example for the layering. New modules should follow it.

### 5.2 `platform` — implemented, partially layered

```
src/modules/platform/
  domain/         runtime-status.ts
  infrastructure/ ephemeral-store.ts    (memory/Redis selector)
                  postgres-config.ts     (shared pool config)
```

`platform` holds cross-cutting concerns that are not owned by a single product domain. It
currently has no `application`, `api`, or `ui` layer; add those only when a use case needs
them.

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
                  community-schemas.ts, community-pagination.ts
  application/    community-service.ts      (list/create/read/reply use cases, cursor codec)
  infrastructure/ community-repository.ts   (driver selector)
                  community-store.ts         (in-memory repository)
                  postgres-community-repository.ts
  api/            community-http.ts         (response + error shaping)
  ui/             thread-form.tsx           (create island)
                  reply-form.tsx             (reply island)
```

`community` owns member-authored discussion: threads and their flat, chronological replies. It
depends on `platform` for the shared Postgres pool config and imports identity **types only**
(`UserRole`); the acting member is resolved in the composition root (`app/**`) and passed in as
`{ id, roles }`. It does not import `content` or `verification`.

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

## 6. Cross-Module Rules

Current dependency edges (verified in code):

- `app/**` (routes, pages) depends on `identity`, `platform`, `experience`, `content`,
  `verification`, `community`, and `search`.
- `identity` depends on `platform` for the ephemeral store (`auth-rate-limit.ts` imports
  `getEphemeralStore`).
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
