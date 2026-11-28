# Community Slice

- Status: `Proposed` (Definition of Ready draft — decisions recorded in §13; not yet implemented)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (read path and
  keyset pagination), [content-authoring-slice.md](content-authoring-slice.md) (write path),
  [scholar-verification-slice.md](scholar-verification-slice.md) (pattern to mirror)

## 1. Purpose

`/community` has shipped since the platform scaffold as a **static placeholder**: a thread list,
a comments rail, and a metrics rail that read hard-coded mocks (`communityThreads`,
`recentComments`, `archivePulse` in `src/modules/experience/site-content.ts`). Nothing is
persisted, nothing is authored by a member, and the page cannot tell a signed-in learner from a
visitor.

This document is the design/architecture note and Definition of Ready for the **fourth product
slice — community** — which turns that placeholder into a real discussion surface: a signed-in
member creates a text thread, browses the newest threads, opens one, and replies. It is the
second member-authored write path after content authoring, but the first that any role (not just
`scholar`/`admin`) can exercise.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A signed-in member starts a discussion and replies to others, in the product, with the content persisted and listed (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the identity slice's session/roles (already built); the read/write path patterns from the content slices (already built); no new infrastructure (§10) |
| Risk level understood | **Low–Medium** — a new fully-layered module and tables, but no new infrastructure, no new role, and no privilege boundary (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Make the community real. A signed-in member opens `/community`, sees the newest
threads that actually exist, starts a thread (title, body, category), and opens any thread to
read and add replies. Discourse is persisted, attributed to its author, and listed in recency
order — replacing the mock cards.

Acceptance criteria:

- [ ] `/community` lists **persisted** threads, newest first (no hard-coded cards).
- [ ] A signed-in member can create a thread at `/community/new` and is taken to it on success.
- [ ] A thread page `/community/[id]` shows the thread and its replies in order, with a reply
      form.
- [ ] A signed-in member can reply to a thread; the reply appears in the thread.
- [ ] Unauthenticated requests to the community endpoints return `401`.
- [ ] Invalid payloads return `400` with the standard error envelope; unknown thread ids return
      `404`.
- [ ] `community_threads` and `community_replies` tables store the data via a migration with a
      working `down`.
- [ ] Each thread and reply records its author; the author id is taken from the session, never
      from the request body.
- [ ] Unit tests cover the schemas and the service; integration tests cover the routes and the
      migration.

## 4. Scope

**In scope:**

- a new `community` module with the standard layers
- two tables (`community_threads`, `community_replies`) and their migration
- endpoints to list threads, create a thread, read a thread with its replies, and reply
- a keyset-paginated, newest-first thread list (mirroring the content read path)
- wiring `/community` to real data, plus `/community/new` and `/community/[id]`

**Explicitly out of scope (deferred):**

- voting / upvotes, saves/bookmarks, and therefore the Trending/Top **ranking** sorts
- image galleries or other attachments (needs `ADR-003` / R2)
- nested (parent–child) replies — replies are a flat, chronological list
- editing or deleting threads/replies, and any moderation/flagging tools
- the Recent Comments / Archive Pulse rails (aggregates) — deferred to the ranking slice
- per-member rate limiting on posting (no new ephemeral state in this slice)
- notifications on reply

Keeping the slice to text, a flat reply list, and recency ordering keeps it on `ADR-004` only
and triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/community/domain/community-types.ts`:

| Type | Fields |
| --- | --- |
| `CommunityThread` | `id`, `authorId`, `title`, `body`, `category`, `createdAt`, `updatedAt` |
| `CommunityReply` | `id`, `threadId`, `authorId`, `body`, `createdAt` |
| `CommunityThreadSummary` | `CommunityThread & { replyCount: number }` (derived on the list read) |
| `CommunityThreadDetail` | `{ thread: CommunityThread; replies: CommunityReply[] }` |
| `CreateThreadInput` | `title`, `body`, `category?` |
| `CreateReplyInput` | `body` |
| `CommunityActor` | `{ id: string; roles: UserRole[] }` (identity types only) |
| `CommunityCursor` | `{ createdAt: string; id: string }` (keyset sort key) |
| `CommunityRepository` | `listThreads`, `getThreadById`, `createThread`, `listRepliesByThreadId`, `createReply` |

Notes:

- `category` is a **free-text** label (trimmed, 2–60 chars, defaulting to `"General"`) rather
  than a fixed taxonomy, so topics can emerge without a schema change.
- `replyCount` is **derived**, not stored: the list read computes it (a subquery in PostgreSQL, a
  scan over the replies map in memory) so there is no denormalized counter to keep in sync.
- `authorId` always comes from the session resolved in `app/**`; the body never supplies it.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the
standard error envelope). All require an authenticated session; none require a role.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/community/threads` | List threads, newest first (`?limit=&cursor=`) | authenticated |
| `POST` | `/api/community/threads` | Create a thread | authenticated |
| `GET` | `/api/community/threads/[id]` | Read a thread with its replies | authenticated |
| `POST` | `/api/community/threads/[id]/replies` | Add a reply | authenticated |

### 6.1 `GET /api/community/threads`

- **Query:** `limit` (default `20`, clamped to `[1, 50]`), `cursor` (opaque keyset cursor
  returned as `nextCursor` by a previous page).
- **Success** `200`: `{ "threads": [ { "…CommunityThreadSummary…" } ], "nextCursor": "…" }`.
  `nextCursor` is present only when a further page exists.
- **Errors:** `COMMUNITY_INVALID_CURSOR` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_UNKNOWN` (500).

### 6.2 `POST /api/community/threads`

- **Request:** `{ "title": "…", "body": "…", "category": "…" }`. `title` and `body` are required
  and non-empty; `category` is optional and defaults to `General`.
- **Success** `201`: `{ "thread": { "…CommunityThread…" } }`. `authorId` is stamped from the
  session.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_UNKNOWN` (500).

### 6.3 `GET /api/community/threads/[id]`

- **Success** `200`: `{ "thread": { "…CommunityThread…" }, "replies": [ { "…CommunityReply…" } ] }`.
- **Errors:** `COMMUNITY_THREAD_NOT_FOUND` (404), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_UNKNOWN` (500).

### 6.4 `POST /api/community/threads/[id]/replies`

- **Request:** `{ "body": "…" }` (required, non-empty).
- **Success** `201`: `{ "reply": { "…CommunityReply…" } }`. `authorId` is stamped from the
  session; the parent thread must exist.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_THREAD_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 6.5 Error codes

New codes, whose executable source of truth is
`src/modules/community/domain/community-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `COMMUNITY_VALIDATION_FAILED` | 400 | Request body failed schema validation |
| `COMMUNITY_INVALID_CURSOR` | 400 | `cursor` query parameter is malformed |
| `COMMUNITY_THREAD_NOT_FOUND` | 404 | Thread id is unknown |
| `COMMUNITY_UNKNOWN` | 500 | Unhandled failure (fallback) |

## 7. Authorization Model

- **Members only.** Every community endpoint requires an authenticated session; there is no
  role requirement (learners, scholars, and admins all participate). Enforced in the application
  layer, not only in the UI (`ADR-001`).
- **Ownership is implicit.** The author of a thread or reply is the session user; the client
  cannot assert an author. There is no id in the create path to spoof.
- **Edge gate.** `/community/:path*` is already in the middleware matcher, so `/community`,
  `/community/new`, and `/community/[id]` are all gated at the edge; the endpoints re-check the
  session defensively.
- **Composition root.** The acting user is resolved in `app/**` (as in the content and
  verification slices) and passed in as `{ id, roles }`; the community module imports identity
  **types only**.

## 8. Module Placement and Dependencies

```
src/modules/community/
  domain/         community-types.ts      (entities, inputs, repository type)
                  community-errors.ts     (COMMUNITY_* codes)
                  community-schemas.ts    (Zod create schemas)
                  community-pagination.ts (keyset cursor codec)
  application/    community-service.ts    (listThreads, createThread, getThread, createReply)
  infrastructure/ community-repository.ts (driver selector)
                  community-store.ts      (in-memory repository)
                  postgres-community-repository.ts
  api/            community-http.ts       (response/error shaping)
  ui/             thread-form.tsx          (new: "use client" create island)
                  reply-form.tsx           (new: "use client" reply island)
```

- `community` depends on `platform` (shared Postgres pool config) and imports identity
  **types only**; it does not import `content` or `verification`.
- `app/community/**` and `app/api/community/**` compose the module.
- `/community` is rewritten to load threads server-side and render the list plus a
  "Start a Thread" link; the mock exports (`communityThreads`, `recentComments`, `archivePulse`
  and their types) are removed from `site-content.ts`, which the community page is their only
  consumer of.

## 9. Persistence and Migration

New migration `migrations/20261128120000_create_community_tables.cjs` (kebab-case config,
`single-transaction: true`, with a working `down` that drops replies before threads):

### 9.1 `community_threads`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `author_id` | `text` | not null |
| `title` | `text` | not null |
| `body` | `text` | not null |
| `category` | `text` | not null, default `General` |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |

Index: `community_threads_created_at_id_idx` on `(created_at, id)` to support the keyset list
(`ORDER BY created_at DESC, id DESC`).

### 9.2 `community_replies`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `thread_id` | `text` | not null |
| `author_id` | `text` | not null |
| `body` | `text` | not null |
| `created_at` | `text` | not null |

Index: `community_replies_thread_id_created_at_idx` on `(thread_id, created_at)` to support the
per-thread reply read.

`thread_id` / `author_id` store ids as bare `text` without a cross-module foreign key (matching
the authorship and `applicant_id` columns). Driver selection mirrors the established pattern:
`COMMUNITY_STORAGE_DRIVER=auto|memory|postgres`.

**List read.** `listThreads` is a keyset query —
`WHERE (created_at, id) < ($cursorAt, $cursorId) ORDER BY created_at DESC, id DESC LIMIT $n` —
with `replyCount` via a correlated subquery. The cursor is the same `"<createdAt>|<id>"` codec
used by the content read path.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no attachments; content is text.
- **`ADR-005` (Redis)** — no new ephemeral state; posting is not rate-limited in this slice.
- **`ADR-006` (Qdrant)** — no semantic search or discovery.
- **`ADR-007` (offline)** — the community is online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL), already implemented.

## 11. Testing Plan (`§7.3`)

- **Unit:** Zod schemas (required title/body, `category` default, length bounds); the cursor
  codec (round-trip, malformed input); the service — createThread stamps the author and
  timestamps, createReply rejects an unknown thread with `404`, listThreads returns newest-first
  with `replyCount` and a `nextCursor`; the memory repository (list ordering, keyset paging,
  reply lookup).
- **Integration:** the routes (`401` unauthenticated; create → list → detail; `400` validation;
  `404` reply to an unknown thread; `400` bad cursor); the migration `up`/`down` against
  PostgreSQL.
- **Component:** `/community` renders persisted threads and links to a thread; the thread page
  renders replies and a reply form; the create form surfaces a server validation error.
- **Manual:** register a member, post a thread, open it, reply, confirm both persist across a
  reload and are visible newest-first on the list.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Spam / abusive posting without moderation | Medium | Authentication is required; no rate limiting or moderation ships here — called out in §4 and deferred, not silently accepted |
| Unbounded table growth (threads + replies) | Low | Retention/pruning is future work, consistent with the other tables; documented rather than hidden |
| Listing cost as replies grow | Low | `replyCount` is a correlated subquery, not a full scan per row; the list is keyset-paginated and limited |
| Dead interactive controls left on the page | Low | The non-functional Trending/Top tabs and the mock rails are removed from `/community` (§8), not left as buttons that do nothing |
| New module drifts from the layering rules | Medium | Copy the `content`/`verification` structure; keep identity imports to types; wire actors in `app/**` (§8) |

## 13. Resolved Decisions

1. **Module — a new `community` module.** Discussion is a distinct bounded context; the module
   imports identity types only, and actors are resolved in `app/**`.
2. **Content — text threads with flat replies.** No attachments and no nesting in this slice, so
   `ADR-003` (R2) stays deferred and the reply read stays a single ordered query.
3. **Signals — replies only.** No upvotes or saves, so lists are ordered by recency and the
   Trending/Top ranking sorts are deferred to the discovery slice.
4. **UI — browse, create, and reply.** `/community` lists real threads; `/community/new` creates
   one; `/community/[id]` reads it and accepts replies.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) and
[data-models.md](data-models.md) are updated for the new surface; the new error codes are
registered; and rollout/rollback (migration `up`/`down`) is documented.

## 15. Recommended Implementation Order

On acceptance: migration → domain (types, schemas, errors, pagination codec) → application
(list/create/read/reply use cases) → infrastructure (memory, then PostgreSQL keyset list) →
routes → applicant `/community` list wiring → `/community/new` and `/community/[id]` surfaces →
tests → docs update. Follow the order used by the authoring and verification slices
([content-authoring-slice.md](content-authoring-slice.md) §15).
