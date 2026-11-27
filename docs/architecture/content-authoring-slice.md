# Content Authoring Slice

- Status: `Implemented` (authoring/write path; Definition of Ready accepted in §2, decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessor: [content-comprehension-slice.md](content-comprehension-slice.md) (the shipped read path)

## 1. Purpose

The read path shipped in the content comprehension slice, but slice 1 deliberately deferred
authoring: items can only be created by the seed script (`scripts/seed-content.ts`). This
document is the design/architecture note and Definition of Ready for the **second content
slice — authoring/write** — which lets authorised users create, edit, and publish research
items through the product itself.

The slice is now **implemented**: the Definition of Ready in §2 was accepted, the open
questions are resolved in §13, and the acceptance criteria in §3 are met. §4 records what
stays explicitly out of scope.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A scholar can publish a research item (title, abstract, Bangla summary) without a developer or a seed script (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the identity slice's session/roles (already built); the content read slice (already built); no new infrastructure (§10) |
| Risk level understood | **Medium-High** — first write path, first authorization rule outside auth, first schema change to an existing table, and the first client islands outside `identity` (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted. (It has been accepted; see §13.)

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Close the product loop: content is no longer seeded by hand. An authorised user
(a `scholar` or `admin`) can author a research item and publish it, and the item then appears
on the public `/content` read path built in slice 1.

Acceptance criteria (all met):

- [x] Authorised users (`scholar`, `admin`) can create a research item as a `draft` via the API.
- [x] Authorised users can edit an existing item, including transitioning `draft` → `published`.
- [x] Publishing sets `publishedAt` automatically; the item then appears on `/content`.
- [x] Unauthenticated writes return `401`; authenticated non-authors (`learner`) return `403`.
- [x] Invalid payloads return `400` with the standard error envelope.
- [x] A stale write (concurrent edit) returns `409` and does not overwrite the newer version.
- [x] An authoring UI exists at `/studio`, gated to `scholar`/`admin`, that lists drafts and
      published items and lets an author create and edit one.
- [x] `content_items` records authorship (`author_id`, `updated_by`) via a migration with a
      working `down`.
- [x] Unit tests cover the input schemas and the service (role denial, publish transition,
      optimistic conflict); integration tests cover the write routes and the migration.

## 4. Scope

**In scope:**

- write endpoints: `POST /api/content/items`, `PATCH /api/content/items/[id]`
- an authorization rule: `scholar` and `admin` may author; `learner` and anonymous may not
- a `draft → published` transition that stamps `publishedAt`
- optimistic-concurrency protection on update
- authorship columns (`author_id`, `updated_by`) and their migration
- an authoring UI under `/studio` (server shells + client form islands)
- input validation with Zod, mirroring `identity`'s schema style

**Explicitly out of scope (deferred):**

- scheduling/publishing at a future time (only immediate publish is supported)
- full revision history / audit log (only last-writer columns are recorded)
- DELETE / archive (items are unpublished instead; see §13)
- an editorial review/approval workflow (a scholar or admin publishes directly)
- rich media, attachments, or cover images (`ADR-003` stays deferred)
- granular per-item permissions (all authors may edit all items; role is the only gate)
- import from an external editorial source (authors type/paste content)

Keeping this slice to create/edit/publish keeps it on `ADR-004` only and triggers none of the
deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

Current types live in `src/modules/content/domain/content-types.ts` (see
[data-models.md](data-models.md) §2.6). This slice adds:

| Change | Detail |
| --- | --- |
| `ResearchItem` fields | add `authorId?: string` and `updatedBy?: string` |
| `CreateItemInput` | `title`, `abstract`, `summaryBn`, `sourceLanguage?`, `tags?`, `sourceUrl?`, `status?` |
| `UpdateItemInput` | the same fields, all optional, plus `updatedAt` (the concurrency token) |
| `ContentRepository` | add `getItemById(id): Promise<ResearchItem \| undefined>` (any status, for authors) |
| `content-schemas.ts` (new) | Zod `createItemSchema` / `updateItemSchema` in `content/domain/` |

Notes:

- The read methods (`listPublishedItems`, `getPublishedItemById`) are unchanged and stay
  published-only; the new `getItemById` is the authoring path and returns drafts too.
- `status` is a normal field on the create/update payloads; there is no separate publish
  action (§13). Transitioning to `published` stamps `publishedAt` if it is not already set.
- Title, abstract, and `summaryBn` are required and non-empty; `tags` defaults to `[]`;
  `sourceLanguage` defaults to `en`; `status` defaults to `draft`.

## 6. API Contracts

Write endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON,
the standard error envelope). Both require an authenticated session **and** an author role.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/content/items` | Create a draft item | `scholar` \| `admin` |
| `PATCH` | `/api/content/items/[id]` | Edit an item / publish it | `scholar` \| `admin` |

### 6.1 `POST /api/content/items`

- **Request:** `{ "title": "…", "abstract": "…", "summaryBn": "…", "tags": ["…"], "sourceUrl": "…", "status": "draft" }`
- **Success** `201`: `{ "item": { "…ResearchItem…" } }`
- **Errors:** `CONTENT_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `CONTENT_FORBIDDEN` (403).

### 6.2 `PATCH /api/content/items/[id]`

- **Request:** any subset of the create fields, plus `updatedAt` (the value the client last
  read) for the concurrency check.
- **Success** `200`: `{ "item": { "…ResearchItem…" } }`
- **Errors:** `CONTENT_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `CONTENT_FORBIDDEN` (403), `CONTENT_ITEM_NOT_FOUND` (404),
  `CONTENT_CONFLICT` (409 — `updatedAt` did not match the stored version).

The read endpoints (`GET /api/content/items`, `GET /api/content/items/[id]`) are unchanged and
stay public.

## 7. Authorization Model

- **Roles.** `scholar` and `admin` may author; `learner` may not; anonymous requests are
  rejected. The role vocabulary is identity's `UserRole` (`src/modules/identity/domain/auth-types.ts`).
- **Where it is enforced.** Authorization is enforced at the **server boundary**, never only in
  the UI (`ADR-001`). The composition root — the route handler in `app/api/content/**` — resolves
  the session through the identity module's public surface and passes the acting user
  (`{ id, roles }`) into the content use case. The content application layer applies the role
  rule and throws `CONTENT_FORBIDDEN` (403) when it fails. Purely client-side hiding of the
  `/studio` controls is a convenience, not the control.
- **Boundary note.** The content module treats the actor as plain data (`{ id, roles: UserRole[] }`)
  and imports identity **types only**; it does not import the identity repository or service.
  Wiring the two modules happens exclusively in `app/**` (see [module-boundaries.md](module-boundaries.md) §6).

## 8. Module Placement and Dependencies

```
src/modules/content/
  domain/         content-types.ts        (+ CreateItemInput, UpdateItemInput, author fields)
                  content-errors.ts       (+ CONTENT_FORBIDDEN, CONTENT_VALIDATION_FAILED, CONTENT_CONFLICT)
                  content-schemas.ts      (new: Zod create/update schemas)
                  content-authorization.ts (new: canAuthor(roles))
  application/    content-service.ts      (+ createContentItem, updateContentItem)
  infrastructure/ content-repository.ts   (+ driver unchanged)
                  content-store.ts        (+ getItemById)
                  postgres-content-repository.ts (+ getItemById, conditional update)
  api/            content-http.ts         (unchanged: response/error shaping)
  ui/             content-views.tsx       (read views, unchanged)
                  item-editor-form.tsx    (new: "use client" authoring form)
```

- `content` continues to depend on `platform` for the shared Postgres pool config and imports
  identity **types only**. No new module-level dependency.
- `app/studio/**` and `app/api/content/**` compose the module.

## 9. Persistence and Migration

New migration `migrations/<timestamp>_add_content_item_authorship.cjs` (kebab-case config,
`single-transaction: true`, with a working `down`):

| Column | Type | Constraints |
| --- | --- | --- |
| `author_id` | `text` | nullable (existing seeded rows predate authoring) |
| `updated_by` | `text` | nullable |

`up` adds the two columns; `down` drops them. No backfill: rows created before this slice keep
`NULL` authorship and render without an author.

**Optimistic concurrency.** `updateContentItem` performs a conditional update —
`UPDATE content_items SET … WHERE id = $1 AND updated_at = $2`. If no row matches, the service
distinguishes *not found* from *stale* by reading the row: missing → `CONTENT_ITEM_NOT_FOUND`
(404); present with a different `updated_at` → `CONTENT_CONFLICT` (409). The in-memory store
enforces the same rule.

**Driver selection** is unchanged: `CONTENT_STORAGE_DRIVER=auto|memory|postgres` (see
[data-models.md](data-models.md) §5.4).

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media or attachments; items remain text + tags.
- **`ADR-006` (Qdrant)** — no search or recommendations.
- **`ADR-007` (offline)** — authoring is online-only.
- **`ADR-005` (Redis)** — no new ephemeral state; writes are not rate-limited in this slice.

Uses only `ADR-004` (PostgreSQL), already implemented.

## 11. Testing Plan (`§7.3`)

- **Unit:** input schemas (required fields, defaults, tag handling); `canAuthor`; the service —
  create stamps `authorId`/timestamps, role denial throws `403`, publishing stamps
  `publishedAt`, a stale `updatedAt` throws `409`. Memory repository `getItemById` and
  conditional update.
- **Integration:** `POST /api/content/items` and `PATCH /api/content/items/[id]` — unauthenticated
  `401`, learner `403`, valid create `201`, publish transition visible on the public list,
  `400`/`404`/`409` paths; migration `up`/`down` against PostgreSQL.
- **Component:** `/studio` renders the item list for an author and hides the create/edit controls
  for a non-author; the editor form submits and reflects a validation error.
- **Manual:** sign in as a scholar, create and publish an item at `/studio`, confirm it appears on
  `/content`, then edit it and confirm the stale-write guard.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Authorization enforced only in the UI | High | Enforce in the application layer; test the `403` path server-side (§7, §11) |
| Lost updates on concurrent edits | Medium | Optimistic concurrency with `updatedAt` → `409` (§9) |
| Schema change to a live table | Medium | Additive, nullable columns with a working `down`; no backfill (§9) |
| First client islands outside `identity` | Medium | Follow the leaf-island rule in [server-vs-client-components.md](server-vs-client-components.md); keep pages as server components |
| Content module coupling to identity | Medium | Pass the actor as plain data; import identity types only; wire in `app/**` (§7) |
| Scope creep into review/scheduling/media | Medium | §4 out-of-scope list |

## 13. Resolved Decisions

1. **Author roles — `scholar` + `admin`.** `learner` stays read-only; anonymous is rejected.
2. **Write API — `POST` + `PATCH` with `status` in the body.** No separate publish endpoint;
   the service stamps `publishedAt` on the transition to `published`.
3. **Authoring UI — a new `/studio` route** gated by middleware (auth) plus a server-side role
   check. This introduces the first client islands outside `identity` (`item-editor-form.tsx`).
4. **Data-model changes — authorship columns and optimistic concurrency.** Add `author_id` and
   `updated_by`; reject stale updates with `409`. **No** soft-delete/archive status and **no**
   slug column in this slice (both deferred).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) and
[data-models.md](data-models.md) are updated for the new surface; the new error codes are
registered; and rollout/rollback (migration `up`/`down`) is documented.

## 15. Recommended Implementation Order

On acceptance: migration → domain (types, schemas, authorization, errors) → application
(create/update use cases) → infrastructure (memory, then PostgreSQL conditional update) →
routes → `/studio` pages + editor island → tests → docs update. Follow the order used by the
comprehension slice ([content-comprehension-slice.md](content-comprehension-slice.md) §14).
