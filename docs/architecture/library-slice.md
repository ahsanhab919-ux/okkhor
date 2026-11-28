# Library Slice

- Status: `Implemented` (seventh product slice — decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (the research read
  path this slice attaches to), [discovery-slice.md](discovery-slice.md) (the most recent slice;
  pattern to mirror)

## 1. Purpose

Okkhor has no personal surface. A member can read the archive and search it, but the moment they
leave a research item there is nothing that remembers it: no "read later", no personal shelf.
Research comprehension is a *repeated* activity — a learner returns to items they meant to finish
— and today every visit starts from zero.

This document is the design/architecture note and Definition of Ready for the **seventh product
slice — the library** — which delivers a per-member saved-items collection: save any published
research item to "My Library", see the saved list, and remove an item. It is a small, additive
slice built entirely on the already-adopted `ADR-004` (PostgreSQL) with no new infrastructure.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A signed-in member saves a published research item to their personal library, sees the saved list newest-first, and removes an item (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the content read path (already built); the identity session/roles (already built); no new infrastructure (§10) |
| Risk level understood | **Low** — one new module, one new table, no new role, and no privilege boundary beyond the existing member gate (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member reading `/content/[id]` taps **Save**; the item joins their **My Library**
at `/library`; they can open any saved item or remove it, and the saved list survives across
sessions.

Acceptance criteria:

- [x] `/content/[id]` renders a Save/Saved toggle; for an anonymous visitor it offers to sign in
      and returns to the item afterwards.
- [x] `POST /api/library/items` saves a published item for the acting member and is idempotent
      (saving an already-saved item succeeds without creating a duplicate).
- [x] `DELETE /api/library/items/[id]` removes a saved item; removing a non-saved item is a no-op
      that still succeeds.
- [x] `GET /api/library` returns the member's saved items, hydrated to research items, newest-saved
      first, capped at the page size.
- [x] `/library` renders the saved list, each entry linking to `/content/[id]`, with a Remove
      action; an empty library shows an empty state.
- [x] Unauthenticated requests to any library endpoint return `401`; `/library` is gated at the edge
      and redirects to `/auth?next=/library`.
- [x] Saving a non-existent or non-published item returns `404` `LIBRARY_ITEM_NOT_FOUND`.
- [x] A saved item that is later unpublished or deleted silently drops out of the library list (§13).
- [x] A "My Library" entry is added to the public navigation.
- [x] Unit tests cover the save schema and the service; integration tests cover the three routes and
      the two pages.

## 4. Scope

**In scope:**

- a new `library` module with the standard layers (domain, application, infrastructure, api)
- a per-member saved-items relation persisted in one new table
- `POST /api/library/items`, `DELETE /api/library/items/[id]`, `GET /api/library`
- a `SaveItemButton` client island on the item detail page
- a protected `/library` page and a "My Library" nav entry
- a small content public surface (`getPublishedItemsByIds`, backed by a new
  `ContentRepository.getPublishedItemsByIds`) so the composition root can hydrate the saved list
  and validate a save target

**Explicitly out of scope (deferred):**

- saving community threads (research items only, per §13)
- notes, highlights, tags, folders, or ordering the library by hand
- read-progress / "continue reading" state (a separate concern; relates to `ADR-007`)
- sharing a library, public shelves, or export
- cross-member recommendation or "people also saved" (an `ADR-006` workload)
- cursor pagination of the saved list — a single capped list is the baseline (§13)
- notifications when a saved item changes

Keeping the slice on one new table with no new dependency keeps it on `ADR-004` plus the
already-adopted content and identity modules, and triggers none of the deferred infrastructure ADRs
(§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/library/domain/library-types.ts`:

| Type | Fields |
| --- | --- |
| `SavedItem` | `userId: string`, `itemId: string`, `savedAt: string` (ISO) — the save relation; the pair `(userId, itemId)` is its identity |
| `LibraryActor` | `id: string`, `roles: UserRole[]` (opaque actor, resolved from identity at the composition root) |
| `SaveItemInput` | `itemId: string` |
| `ListSavedItemsInput` | `limit?: number` |
| `LibraryRepository` | see below |
| `LibraryStore` | `saves: Map<string, SavedItem>` (keyed `${userId}:${itemId}`) |

`LibraryRepository`:

| Method | Contract |
| --- | --- |
| `listSavedItems(userId, options: { limit: number })` | The member's saves, `savedAt` descending then `itemId` descending, truncated to `limit` |
| `isItemSaved(userId, itemId)` | `true` when the save exists |
| `saveItem(item: SavedItem)` | Idempotent upsert on `(userId, itemId)`; never duplicates |
| `removeSavedItem(userId, itemId)` | Removes the save; returns `true` when a row was removed, `false` when there was nothing to remove |

Notes:

- The relation is identified by the `(userId, itemId)` pair, so a save carries **no surrogate id**;
  the in-memory map is keyed by the pair and the table's primary key is the composite.
- The `library` module stores **no item content**. It imports content **types only** where it must
  name an item; hydration and the published-item check happen at the composition root (§8), so the
  module owns no read model over `content_items`.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the standard
error envelope). Every library endpoint requires an authenticated session (§7).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/library` | List the member's saved items (hydrated) | authenticated |
| `POST` | `/api/library/items` | Save a published item | authenticated |
| `DELETE` | `/api/library/items/[id]` | Remove a saved item | authenticated |

### 6.1 `GET /api/library`

- **Query:** `limit` — default `20`, clamped to `[1, 50]`.
- **Success** `200`:

  ```json
  { "items": [ { "item": { "…ResearchItem…" }, "savedAt": "2026-11-28T10:00:00.000Z" } ], "total": 3 }
  ```

  The composition root hydrates each `SavedItem.itemId` through the content module; ids that no
  longer resolve to a published item are omitted (§13).
- **Errors:** `AUTH_UNAUTHORIZED` (401), `LIBRARY_VALIDATION_FAILED` (400), `LIBRARY_UNKNOWN` (500).

### 6.2 `POST /api/library/items`

- **Body:** `{ "itemId": "…" }`.
- **Validation:** `itemId` is a non-empty string (1–200 chars) naming a **published** research item;
  the published check is done at the composition root via the content module.
- **Success** `201`: `{ "item": { "itemId": "…", "savedAt": "…" } }` — or `200` with the existing
  save when the item was already saved (idempotent).
- **Errors:** `AUTH_UNAUTHORIZED` (401), `LIBRARY_VALIDATION_FAILED` (400, bad body),
  `LIBRARY_ITEM_NOT_FOUND` (404, unknown or unpublished item), `LIBRARY_UNKNOWN` (500).

### 6.3 `DELETE /api/library/items/[id]`

- **Success** `200`: `{ "removed": true | false }` — idempotent; `false` when nothing was saved.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `LIBRARY_UNKNOWN` (500).

### 6.4 Error codes

New codes, whose executable source of truth is `src/modules/library/domain/library-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `LIBRARY_VALIDATION_FAILED` | 400 | Request body/query failed schema validation (missing `itemId`) |
| `LIBRARY_ITEM_NOT_FOUND` | 404 | The item to save does not exist or is not published |
| `LIBRARY_UNKNOWN` | 500 | Unhandled failure (fallback) |

## 7. Authorization Model

- **Members only.** Every library endpoint requires an authenticated session, and `/library` is
  added to the middleware matcher. The save relation is scoped to the acting member's id, so one
  member can never read or modify another member's library.
- **No role requirement.** Any authenticated member (learner, scholar, admin) may keep a library.
- **Save target must be published.** A member may only save an item that is currently published;
  the check happens at the composition root through the content module, so drafts are never
  reachable through a save.
- **Composition root.** The acting member is resolved in `app/**` (as in the content, verification,
  community, and search slices); the `library` module imports identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/library/
  domain/         library-types.ts          (SavedItem, LibraryActor, repository type)
                  library-errors.ts         (LIBRARY_* codes)
                  library-schemas.ts        (Zod: saveItemSchema; list limit clamp)
  application/    library-service.ts        (save / list / remove / isSaved)
  infrastructure/ library-repository.ts     (LIBRARY_STORAGE_DRIVER selector)
                  library-store.ts          (in-memory repository)
                  postgres-library-repository.ts
  api/            library-http.ts           (response/error shaping)
  ui/             save-item-button.tsx      ("use client" island: Save/Saved toggle)
                  library-list.tsx          (server presentational component)
app/
  library/layout.tsx                        (protected workspace chrome)
  library/page.tsx                          (server component; viewer + hydrated saved items)
  api/library/library-actor.ts              (resolve the acting member)
  api/library/route.ts                      (GET)
  api/library/items/route.ts                (POST)
  api/library/items/[id]/route.ts           (DELETE)
```

- `library` depends on `platform` for the shared Postgres pool config.
- `library` owns one table (`saved_items`) and writes only to it. It does **not** read
  `content_items`; the composition root does.
- **Content addition.** `getPublishedItemsByIds(ids): Promise<ResearchItem[]>` is added to content's
  public surface (`content-service.ts`, backed by a new `ContentRepository.getPublishedItemsByIds`).
  It is called only by `app/library/**` and `app/api/library/**` to hydrate the saved list; the
  `library` module never calls it.
- **Detail-page island.** `app/content/[id]/page.tsx` resolves an *optional* viewer and the saved
  state server-side, then renders `<SaveItemButton itemId initialSaved authenticated />`. The page
  stays a server component; only the button is client (see
  [server-vs-client-components.md](server-vs-client-components.md)).
- `publicNavItems` gains `{ label: "My Library", href: "/library" }` after `Community`; because
  `/library` is in the middleware matcher, an anonymous click redirects to `/auth`.

## 9. Persistence and Queries

**One new table, one migration.**

`saved_items`:

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `text` | not null |
| `item_id` | `text` | not null |
| `saved_at` | `text` (ISO) | not null |
| — | — | primary key `(user_id, item_id)` — the pair is the identity, so a duplicate save is impossible |

- Index `(user_id, saved_at, item_id)` for the newest-first list.
- No foreign keys, consistent with the existing `content_items` / `community_*` tables; the
  `(user_id, item_id)` relation is enforced logically and the item's existence is checked at save
  time (§7).

**Queries:**

- **List:** `select item_id, saved_at from saved_items where user_id = $1 order by saved_at desc,
  item_id desc limit $2`. The composition root then hydrates the ids through the content module and
  drops any id that is no longer a published item.
- **Save:** `insert … on conflict (user_id, item_id) do nothing` — idempotent.
- **Remove:** `delete … where user_id = $1 and item_id = $2`; the affected-row count is the return
  value.
- **Is saved:** `select 1 … where user_id = $1 and item_id = $2`.

Driver selection mirrors the established pattern:
`LIBRARY_STORAGE_DRIVER=auto|memory|postgres` (default `auto`; `auto` is memory under
`NODE_ENV=test`, postgres when `DATABASE_URL` is present, otherwise a fail-fast throw).

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media.
- **`ADR-005` (Redis)** — no caching or ephemeral state; saves are durable rows.
- **`ADR-006` (Qdrant)** — no semantic discovery; no recommendations.
- **`ADR-007` (offline)** — the library is online-only; read-progress sync is explicitly out of
  scope (§4).
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL) and the already-built content and identity modules.

## 11. Testing Plan (`§7.3`)

- **Unit:** `saveItemSchema` (missing/oversized `itemId` rejected); the limit clamp; the service
  `save` (idempotent — two saves yield one row), `remove` (returns `false` when absent),
  `isSaved`, and `list` ordering (newest-saved first, tie-broken by `itemId`); the memory repository.
- **Integration:** `POST /api/library/items` (`401` unauthenticated; saves a published item; saving
  twice stays one entry; `404` for a draft or unknown item; `400` for a bad body); `DELETE` (removes;
  removing twice is a no-op); `GET /api/library` (returns hydrated items newest-first; omits an item
  that was unpublished after saving; `401` unauthenticated); cross-member isolation (member B cannot
  see member A's saves).
- **Component:** the item detail page renders the Save toggle and reflects the saved state; an
  anonymous visitor sees the sign-in affordance; `/library` lists saved items linking to
  `/content/[id]` and renders an empty state.
- **Manual:** sign in, save two items from their detail pages, open `/library`, remove one, confirm
  the toggle and the list both update and the state survives a reload.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A new client island on the public read path grows the item-detail bundle | Low | Keep `SaveItemButton` a tiny leaf that only owns a boolean and one fetch; the page stays a server component (§8) |
| Cross-module hydration couples `library` to `content` | Medium | Recorded as a composition-root concern (§8); the module owns only its table and imports content types only |
| A saved item is unpublished or deleted, leaving a dangling save | Low | The list hydrates through the published content path and silently omits unresolvable ids (§13); a periodic cleanup is unnecessary at bootstrap scale |
| Save/unsave races double-submit | Low | `(user_id, item_id)` primary key makes save idempotent; delete is naturally idempotent; the button disables while a request is in flight |
| The library duplicates the archive's card markup | Low | `library-list.tsx` reuses the content card presentation; only the Remove affordance is added |
| New module drifts from the layering rules | Medium | Copy the `community`/`search` structure; keep identity and content imports to types; resolve the actor and hydrate items in `app/**` |

## 13. Resolved Decisions

1. **Scope — research items only.** A save points at a published research item; community threads
   are not savable in this slice. The library is a comprehension reading list.
2. **Module — a new `library` module with its own `LIBRARY_STORAGE_DRIVER`,** owning the
   `saved_items` relation. One place owns "what a member saved", matching the one-module-per-domain
   rule (`ADR-001`).
3. **Surfacing — a Save/Saved toggle on `/content/[id]`,** a protected `/library` page listing the
   saved items, and a "My Library" entry in the public navigation. Anonymous visitors hitting
   `/library` are redirected to `/auth`.
4. **Access — members only.** Any authenticated member may keep a library; the relation is scoped to
   the acting member, so libraries never leak across members (§7).
5. **Unpublished / deleted items — hidden.** The library lists only items that are currently
   published; a save whose item is later unpublished or deleted silently drops out of the list. The
   save row itself is left in place.
6. **Ordering — newest-saved first, capped.** A single list ordered by `savedAt` descending,
   truncated to the page size (default 20). Cursor pagination is deferred.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md),
[data-models.md](data-models.md), [configuration.md](../configuration.md),
[server-vs-client-components.md](server-vs-client-components.md),
[module-boundaries.md](module-boundaries.md), and [system-overview.md](system-overview.md) are
updated for the new surface; the new error codes are registered; the `saved_items` migration is
added; and `.env.example` documents `LIBRARY_STORAGE_DRIVER`.

## 15. Recommended Implementation Order

On acceptance: migration (`saved_items`) → domain (types, errors, schemas) → application (service) →
infrastructure (driver selector, memory repository, PostgreSQL repository) → api helper → the
content `getPublishedItemsByIds` public surface → routes + the `library-actor` composition helper →
the `SaveItemButton` island on `/content/[id]` → the `/library` page + `library-list` + nav entry →
tests → docs update. Follow the order used by the community and discovery slices
([discovery-slice.md](discovery-slice.md) §15).
