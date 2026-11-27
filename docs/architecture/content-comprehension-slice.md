# Content Comprehension Slice

- Status: `Implemented` (read path; Definition of Ready accepted — see §2)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)

## 1. Purpose

Describe the **first product-defining vertical slice** for `Okkhor`: browsing research
comprehension items (a source-language title/abstract with a Bangla summary). This document is
the design/architecture note the handbook requires before medium-complexity work enters
development, and it carried the Definition of Ready for that slice.

The slice is now **implemented** (read path only). The Definition of Ready in §2 was accepted,
the open questions in §12 are resolved, and the acceptance criteria in §3 are met. §4 records
what remains explicitly out of scope for slice 1.

## 2. Definition of Ready (`§7.2`)

Table kept as originally accepted.

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A learner can open a research item and read a Bangla summary of it, without translation tools (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (already adopted, `ADR-004`); identity slice (already built); no new infrastructure (§7) |
| Risk level understood | **Medium** — first new domain module and first new table outside identity, but no new external service (§11) |
| Design/architecture note | This document |

Accepted: the Definition of Ready was signed off and the four open questions in §12 were
resolved (public read; per-module `CONTENT_STORAGE_DRIVER`; cursor pagination; UUID path
segments).

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Demonstrate the core product promise end to end on a narrow path: research
content is stored once, and a learner reads a native-language summary of it on a low-end
device — the first slice that is *product*, not platform.

Acceptance criteria (all met):

- [x] A `content` module exists under `src/modules/content/` following the layering in
      [module-boundaries.md](module-boundaries.md) (`domain` / `application` /
      `infrastructure` / `api` / `ui`).
- [x] A learner can open `/content` and see a list of published research items.
- [x] A learner can open `/content/[id]` and read the item's title, source-language abstract,
      and Bangla summary.
- [x] Both pages render as **server components** — content is readable with JavaScript
      disabled, per [server-vs-client-components.md](server-vs-client-components.md).
- [x] Items are served from PostgreSQL in non-test environments and from an in-memory store under
      `NODE_ENV=test`, selected by the documented driver pattern (`CONTENT_STORAGE_DRIVER`).
- [x] A migration creates the `content_items` table with a working `down`.
- [x] An unknown or unpublished id returns a `404` page, not a crash.
- [x] Unit tests cover the memory repository; integration tests cover the list/detail reads and
      the migration path.

The `content_items` table and its repository are the first non-identity persistence surface; the
"served from PostgreSQL in non-test environments" criterion is satisfied by
`CONTENT_STORAGE_DRIVER` resolving to the Postgres repository whenever `DATABASE_URL` is present.

## 4. Scope

**In scope (slice 1 = read path only):**

- a new `content` domain module with the standard layers
- the `content_items` table and its migration
- two server-rendered pages (list, detail)
- read-only JSON endpoints for the same data
- a development seed script with a small set of hand-authored items

**Explicitly out of scope (deferred):**

- any authoring/editing UI (items are seeded in slice 1)
- AI/LLM summarization pipeline (summaries are hand-authored for now)
- full-text or semantic search, recommendations (`ADR-006` stays deferred)
- media/video assets (`ADR-003` stays deferred)
- comments, reactions, sharing (community slice)
- offline caching (`ADR-007` stays deferred)

Keeping slice 1 to the read path is deliberate: it delivers the product promise while
**triggering none** of the deferred infrastructure ADRs (§9).

## 5. Core Entities

Proposed domain types in `src/modules/content/domain/content-types.ts`:

| Type | Fields |
| --- | --- |
| `ResearchItem` | `id`, `title`, `abstract`, `summaryBn`, `sourceLanguage`, `tags`, `status`, `sourceUrl?`, `publishedAt?`, `createdAt`, `updatedAt` |
| `ResearchItemStatus` | `"draft" \| "published"` |
| `ContentRepository` | `listPublishedItems(options)`, `getPublishedItemById(id)`, `createItem(input)`, `updateItem(id, input)` |

Notes:

- `summaryBn` is the Bangla comprehension summary — the product value.
- `sourceLanguage` records the abstract's language (default `en`); the UI keeps the default
  locale `bn-BD` (`ADR-009`).
- `status` gates visibility: only `published` items are listable/readable.
- Write methods (`createItem` / `updateItem`) exist for the seed script and future authoring, but
  slice 1 exposes no write endpoints.

## 6. API Contracts

Read-only, following the conventions in [api-contracts.md](api-contracts.md):

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/content/items` | List published items (paginated) | none (public read) |
| `GET` | `/api/content/items/[id]` | Fetch one published item | none (public read) |

- Success: `200` with the item(s). Unknown/unpublished id → `404` with the standard error
  envelope.
- Pagination: `?limit=&cursor=` (cursor pagination) — see §12.
- No `POST`/`PATCH` in slice 1.

Read is public: comprehension content is the top of the funnel and must be reachable without
an account. This was resolved in §12.

## 7. Module Placement and Dependencies

```
src/modules/content/
  domain/         content-types.ts, content-errors.ts, content-pagination.ts
  application/    content-service.ts        (list/get use cases, cursor codec)
  infrastructure/ content-repository.ts     (driver selector)
                  content-store.ts          (in-memory repository)
                  postgres-content-repository.ts
  api/            content-http.ts           (response/error shaping)
  ui/             content-views.tsx         (list/detail presentational components, server-safe)
```

- Depends on `platform` for any cross-cutting concern, and on nothing else at module level.
- `app/content/**` composes the module — the composition root per
  [module-boundaries.md](module-boundaries.md) §6.
- No import of the identity module is needed for public read; if a future slice adds
  authorship, it imports identity **types only**.

## 8. Persistence and Migration

New migration `migrations/20261128090000_create_content_items.cjs` (kebab-case config,
`single-transaction: true`, with a working `down`):

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `title` | `text` | not null |
| `abstract` | `text` | not null |
| `summary_bn` | `text` | not null |
| `source_language` | `text` | not null, default `en` |
| `tags` | `jsonb` | not null, default `[]` |
| `status` | `text` | not null, default `draft` |
| `source_url` | `text` | nullable |
| `published_at` | `text` | nullable |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |

Index: `content_items_status_published_at_idx` on `(status, published_at)` to support the
list query. Follows the timestamp-as-`text` convention recorded in
[data-models.md](data-models.md) §3.

Driver selection mirrors the established pattern (`§5.1`/`§5.2` in
[data-models.md](data-models.md)): `CONTENT_STORAGE_DRIVER=auto|memory|postgres`, resolving to
memory under `NODE_ENV=test`, otherwise PostgreSQL when `DATABASE_URL` is present, otherwise a
fail-fast misconfiguration error. A per-module env var was chosen (resolved in §12) so the
content module's driver is independent of `AUTH_STORAGE_DRIVER`.

## 9. What This Does Not Trigger

- **`ADR-003` (R2)** — no media assets in slice 1.
- **`ADR-006` (Qdrant)** — no semantic search or recommendations in slice 1.
- **`ADR-007` (offline)** — no offline requirement is claimed for the read path yet.

Uses only `ADR-004` (PostgreSQL), which is already implemented.

## 10. Testing Plan (`§7.3`)

- **Unit:** memory `ContentRepository` (list filters `published`, get returns `undefined` for
  drafts/missing); service layer.
- **Integration:** `GET /api/content/items` and `GET /api/content/items/[id]` (published list,
  `404` path); migration up/down against PostgreSQL following the existing auth pattern.
- **Component:** the list page renders items server-side; the detail page renders title,
  abstract, and `summaryBn` with no client JavaScript required.
- **Manual:** seed items, load `/content` and `/content/[id]`, verify readability with JS
  disabled and at a throttled network profile.

## 11. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Scope creep into authoring/AI/search | Medium | §4 out-of-scope list; slice ships seeded, read-only |
| First non-auth table sets a wrong data convention | Medium | Follow [data-models.md](data-models.md) conventions and the existing auth migration style |
| Public read invites abuse later | Low | Read-only, no write endpoints; revisit at authoring slice |
| Bangla rendering on low-end devices | Low | Server-rendered text; no client bundle for reading; validate with `ADR-009` guidance |
| Pagination choice locked too early | Low | Cursor vs offset called out in §12; either is reversible at this scale |

## 12. Resolved Decisions

All five questions are now resolved and reflected in the implementation.

1. **Public vs authenticated read — public.** `/content` and `/content/[id]` are not gated by
   the middleware; comprehension content is the top of the funnel and must be reachable
   without an account. The read endpoints require no auth.
2. **Storage-driver env var — per-module `CONTENT_STORAGE_DRIVER`.** Mirrors
   `AUTH_STORAGE_DRIVER`; the content module's driver is independent of the identity module's.
3. **Pagination — cursor.** Keyset pagination ordered `publishedAt DESC, id DESC`, with an
   opaque base64url cursor over `"<publishedAt>|<id>"`. `limit` defaults to `20` and is
   clamped to `[1, 50]`. Reversible at this scale if a future slice needs offset paging.
4. **Seed content source — illustrative placeholders.** Slice 1 ships
   clearly-labelled hand-authored sample items in `scripts/seed-content.ts`; they are not
   curated from any licensed source. A real editorial source and licence are future work,
   gated by the authoring slice.
5. **Item identity in URLs — UUID path segment.** `/content/[id]` uses the item's UUID;
   slugs are deferred until human-readable URLs are a demonstrated need.

## 13. Definition of Done (`§7.3`)

This slice is done only when: acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) and
[data-models.md](data-models.md) are updated for the new surface; observability covers the new
endpoints; and rollout/rollback (migration `up`/`down`) is documented.

## 14. Status and Next Step

The read-path slice is implemented: migration → domain/application → infrastructure (memory,
then PostgreSQL) → endpoints → pages → seed → tests → docs. See
[api-contracts.md](api-contracts.md) §4.9–§4.10, [data-models.md](data-models.md) §2.6/§3.4/§5.4,
and [module-boundaries.md](module-boundaries.md) §5.4 for the shipped surface.

Next step is the **authoring/write slice** (create/update endpoints, an authoring UI, and a real
editorial content source) or the **search slice**; each is a new design note and must not start
until its own Definition of Ready is accepted. The authoring/write slice is specified in
[content-authoring-slice.md](content-authoring-slice.md). Slice 1 deliberately stops at the read
path and triggers none of the deferred infrastructure ADRs (§9).
