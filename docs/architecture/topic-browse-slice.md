# Topic Browse Slice

- Status: `Accepted` (tenth product slice — Definition of Ready accepted; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [discovery-slice.md](discovery-slice.md) (the tag/category filters this slice turns
  into browsable routes), [member-profile-slice.md](member-profile-slice.md) (the composition-root
  read-surface pattern to mirror)

## 1. Purpose

Okkhor can *filter* by topic but cannot *browse* by topic. `content_items.tags` and
`community_threads.category` are already stored, already scored in search, and already accepted as
query parameters on `/search` (`tag`, `category`) — but only a member who already knows the value and
types a query can reach them. There is no page that answers "what topics exist?" and no URL that
answers "show me everything about this topic".

That gap makes the tag/category data inert: an author tags an item carefully and nothing links to it;
a member cannot wander from a summary into the rest of its subject. Turning the existing metadata into
addressable browse routes is the cheapest discovery feature left, and it reuses data and filters the
product already has.

This document is the design/architecture note and Definition of Ready for the **tenth product slice —
topic browse pages** — which delivers:

- a public **browse index** at `/topics` listing the research tags (always) and the community
  categories (signed-in viewers) with their item counts;
- a public **research-by-tag** page at `/tags/[tag]`;
- a members-only **threads-by-category** page at `/categories/[category]`.

It is a **composition-root slice**: it adds public read surfaces to the `content` and `community`
modules and renders three pages. It introduces **no new module, no new domain entity, and no new
infrastructure**, and it adds **no new HTTP endpoint**.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member opens `/topics`, sees every topic with a count, and enters a topic page that lists the published research (and, for the community half, the visible threads) filed under it (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the content and community slices' tables, repositories, and services (already built); the identity session/roles (already built); no new infrastructure (§10) |
| Risk level understood | **Low** — a read-only composition-root slice with no writes; the only notable risk is rendering members-only community content on a route that is not gated, mitigated in §7 and §12 |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Topics become visible and navigable. Anyone opens **`/topics`** and sees the research
tags with how many published items carry each one; a signed-in member also sees the community
categories with how many visible threads sit in each. Choosing a tag opens **`/tags/[tag]`** with the
published research filed under it; choosing a category opens **`/categories/[category]`** with the
visible threads in it. Every tag shown on a research item and every category shown on a thread links
to the matching browse page.

Acceptance criteria:

- [ ] `/topics` lists every research tag with its published-item count, published-item counts only
      (drafts never counted).
- [ ] For a signed-in viewer, `/topics` also lists every community category with its **visible**-thread
      count; for an anonymous visitor that section is replaced by a sign-in prompt (§7).
- [ ] `/tags/[tag]` lists the published research items carrying that tag, newest-published first, each
      linking to its detail page; an unknown or empty tag renders an empty state (not `404`).
- [ ] `/categories/[category]` lists the **visible** threads in that category, newest first, each
      linking to its detail page; an unknown or empty category renders an empty state (not `404`).
- [ ] A hidden thread is excluded from both the `/topics` category counts and the
      `/categories/[category]` list (the moderation rule holds on the new read paths).
- [ ] `/categories/[category]` is gated at the edge and redirects an anonymous visitor to
      `/auth?next=/categories/…`; `/topics` and `/tags/[tag]` are public.
- [ ] Each tag rendered on `/content/[id]` links to `/tags/[tag]`; the category rendered on
      `/community/[id]` links to `/categories/[category]`.
- [ ] `publicNavItems` gains a "Topics" entry pointing at `/topics`.
- [ ] No new HTTP endpoint is added; all three pages are server components reading the module
      services directly at the composition root.
- [ ] Unit tests cover the new public read surfaces; component tests cover the three pages
      (populated, empty, and — for `/topics` — anonymous vs signed-in).

## 4. Scope

**In scope:**

- a distinct-tag read on content and a distinct-category read on community, each with counts
- a published-items-by-tag read on content and a visible-threads-by-category read on community
- a public `/topics` browse index, a public `/tags/[tag]` page, and a members-only
  `/categories/[category]` page
- tag/category links from the two existing detail pages into the matching browse page
- a "Topics" entry in the public navigation
- one additive migration adding the two indexes that back the new reads
- a `/categories/:path*` middleware matcher entry (the only gate change)

**Explicitly out of scope (deferred):**

- a **tag/category editor or taxonomy** — tags and categories stay free-form strings; this slice
  reads them, it does not curate, merge, rename, or validate them
- **tag normalization** (casing, synonyms, stemming) — the distinct-tag list is the exact set of
  stored values, so "AI" and "ai" remain two rows until a separate normalization slice exists
- **unified `/topics/[slug]`** mixing research and threads in one namespace (decided against in §13)
- **pagination** on the topic pages — a capped list is the baseline, matching the profile slice
- **counts on `/search`** or a "top tags" widget on the landing page
- **per-topic RSS/feed, following, or notifications**
- **editing an item's tags** or a thread's category from the browse pages

Keeping the slice to read surfaces over existing tables keeps it on `ADR-004` plus the already-built
content and community modules, and triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

No new domain entity. New read types and repository methods on two existing contracts.

**Content** (`src/modules/content/domain/content-types.ts`):

| Type | Fields |
| --- | --- |
| `TagCount` | `{ tag: string; count: number }` |
| `ListPublishedItemsByTagOptions` | `{ limit: number }` |

Added to `ContentRepository`:

| Method | Contract |
| --- | --- |
| `listDistinctPublishedTags()` | Every distinct tag across **published** items, each with how many published items carry it; `count` descending, then `tag` ascending |
| `listPublishedItemsByTag(tag, options: ListPublishedItemsByTagOptions)` | The **published** items carrying `tag` exactly, `publishedAt` descending then `id` descending, truncated to `limit` |

**Community** (`src/modules/community/domain/community-types.ts`):

| Type | Fields |
| --- | --- |
| `CategoryCount` | `{ category: string; count: number }` |

Added to `CommunityRepository`:

| Method | Contract |
| --- | --- |
| `listDistinctCategories()` | Every distinct `category` across **visible** threads, each with how many visible threads sit in it; `count` descending, then `category` ascending |
| `listThreadsByCategory(category, options: ListThreadsOptions)` | The **visible** threads in `category` exactly, as `CommunityThreadSummary`, `createdAt` descending then `id` descending, keyset-paginated like `listThreads` |

Notes:

- **Visibility is a read-path rule, not a UI rule.** `listDistinctCategories` and
  `listThreadsByCategory` filter `moderation_state = 'visible'` **in the repository query**, exactly
  as `listThreads` does ([community-moderation-slice.md](community-moderation-slice.md) §5), so a
  hidden thread is absent from the category counts and the category list without any page-level check.
- **Tags and categories match exactly.** A browse link is built from the value returned by the
  distinct read, so the by-tag/by-category read matches that exact value; a caller cannot reach an
  unfiltered list by passing a value that does not exist (it gets an empty state). Case-insensitive
  matching and normalization are deferred (§4).
- **Counting, not listing.** The knowable set of topics comes from the distinct reads, which the
  browse index renders; the per-topic pages then read the rows. The browse index never derives its
  topic set by scanning a page of items, so a topic cannot appear or vanish depending on which page
  of items happens to be visible.
- Both modules gain **read-only** methods: no command, no write path, no new error code.

## 6. API Contracts

**No new HTTP endpoint.** All three pages are server components that read the module services
directly at the composition root, exactly as `/content`, `/community`, and the profile pages do. The
topic surface has no client mutations, so there is nothing for a route handler to protect, and the
new error code set is empty. [api-contracts.md](api-contracts.md) gains only the §7 route-protection
note for `/categories/:path*`.

## 7. Authorization Model

- **Research topics are public.** `/tags/[tag]` renders published research (already public on
  `/content/[id]`) and is reachable without signing in. `/topics` renders research tags to everyone.
- **Community topics are members-only.** A thread is members-only on the `/community` hub, so the
  community half of `/topics` and the `/categories/[category]` page are members-only too.
  `/categories/:path*` is added to the middleware matcher (alongside `/community/:path*`), so an
  anonymous visitor is redirected to `/auth?next=/categories/…`.
- **The index degrades politely.** `/topics` is a **public** route — it is deliberately **not** added
  to the matcher — and resolves an optional viewer in the composition root: the research-tag section
  always renders, and the community-category section renders for a signed-in viewer and is replaced by
  a sign-in prompt for an anonymous one. This mirrors how `/u/[id]` renders its threads section only
  for a signed-in viewer ([member-profile-slice.md](member-profile-slice.md) §7).
- **Hidden content never counts.** Because both community reads filter in SQL (§5), a hidden thread is
  absent from the counts and the category list regardless of who is asking; the moderator queue is the
  only surface that sees hidden rows, and it is unchanged.
- **Composition root.** `/topics` reuses the existing `app/community-session.ts` `getCommunityViewer()`
  to resolve the optional viewer (the category section is a community read, so the community viewer is
  the right one); the pages for `/tags/[tag]` and `/categories/[category]` need no viewer. The content
  and community modules import identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/content/
  domain/content-types.ts                 (+ TagCount, ListPublishedItemsByTagOptions,
                                             listDistinctPublishedTags, listPublishedItemsByTag)
  infrastructure/content-store.ts         (+ the two reads)
  infrastructure/postgres-content-repository.ts (+ the two reads, in SQL)
  application/content-service.ts          (+ listDistinctPublishedTags, listPublishedItemsByTag)
  ui/content-views.tsx                    (reused: ContentItemList)
src/modules/community/
  domain/community-types.ts               (+ CategoryCount,
                                             listDistinctCategories, listThreadsByCategory)
  infrastructure/community-store.ts       (+ the two reads, visible-only)
  infrastructure/postgres-community-repository.ts (+ the two reads, in SQL)
  application/community-service.ts        (+ listDistinctCategories, listThreadsByCategory)
  ui/thread-list.tsx                      (reused: ThreadList)
src/modules/experience/site-content.ts    (+ "Topics" nav entry)
middleware.ts                             (+ "/categories/:path*" matcher)
app/
  topics/page.tsx                         (public browse index; category section gated on a viewer)
  tags/[tag]/page.tsx                     (public: published research by tag)
  categories/layout.tsx                   (protected workspace chrome, mirrors app/community/layout.tsx)
  categories/[category]/page.tsx          (protected: visible threads by category)
  content/[id]/page.tsx                   (tags rendered as links to /tags/[tag])
  community/[id]/page.tsx                 (category pill becomes a link to /categories/[category])
```

- The browse pages depend on `content` and `community` **read surfaces** only. Neither module depends
  on the other; the composition root (`app/**`) joins them on the index page. No new cross-module edge
  is introduced — this is the same modules-import-types-only rule the rest of the app follows.
- **No new module.** A topic is not an entity; it is a projection of two existing columns. A dedicated
  module would own nothing, so the reads live where the data already does, mirroring the member-profile
  slice ([member-profile-slice.md](member-profile-slice.md) §8).
- **Reused presentation.** The per-topic pages render through the existing `ContentItemList` and
  `ThreadList`, so the browse cards match the archive and the hub with no duplicated markup.
- `publicNavItems` gains `{ label: "Topics", href: "/topics" }`. `/topics` is public, so the entry is
  visible to everyone; the community half of the page prompts for sign-in rather than redirecting.
- `/categories/**` reuses the `ProtectedWorkspaceShell` chrome through its own layout, so the
  category pages sit inside the same protected shell as `/community`.

## 9. Persistence and Queries

**No new table and no column change.** One additive migration adds two indexes so the new reads are
indexed:

| Index | On | Serves |
| --- | --- | --- |
| `content_items_tags_gin_idx` | `content_items using gin (tags)` | `listPublishedItemsByTag` (`tags @> $1::jsonb`); also the existing search tag filter |
| `community_threads_category_created_at_idx` | `community_threads (category, created_at)` | `listThreadsByCategory` and `listDistinctCategories` |

- Both indexes are additive and reversible (`exports.down` drops them); no column, table, or
  constraint changes.
- The GIN index is on the `tags` `jsonb` column (which is `not null default '[]'`); the category index
  is on the existing `category`/`created_at` text columns.

**Queries:**

- **Distinct tags:**
  `select tag, count(*)::int as count from content_items, jsonb_array_elements_text(tags) as tag where
  status = 'published' group by tag order by count desc, tag asc`.
- **Published items by tag:**
  `select … from content_items where status = 'published' and tags @> $1::jsonb order by published_at
  desc, id desc limit $2` (the `$1` value is `['<tag>']`).
- **Distinct categories:**
  `select category, count(*)::int as count from community_threads where moderation_state = 'visible'
  group by category order by count desc, category asc`.
- **Threads by category:** the existing thread-list query gains `and t.category = $1` (with
  `t.moderation_state = 'visible'` already applied) and the keyset cursor (`created_at`, `id`), ordered
  as before; the correlated `reply_count` subquery still counts visible replies only.

The in-memory repositories compute the same results over their maps, filtering to published items and
visible threads respectively. No driver-selection change: `CONTENT_STORAGE_DRIVER` and
`COMMUNITY_STORAGE_DRIVER` are untouched and `.env.example` is not modified.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; topics are text labels.
- **`ADR-005` (Redis)** — no caching or rate limiting; three server-rendered reads.
- **`ADR-006` (Qdrant)** — no semantic discovery; these are exact metadata filters, not a ranking
  workload. This slice stays on the `ADR-006` fallback baseline ([discovery-slice.md](discovery-slice.md)).
- **`ADR-007` (offline)** — browse pages are online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL) and the already-built content and community modules.

## 11. Testing Plan (`§7.3`)

- **Unit (content):** `listDistinctPublishedTags` counts only published items and orders by count then
  tag; a tag on a draft is not counted; `listPublishedItemsByTag` returns only published items carrying
  the tag exactly, in newest-published order, honouring the limit; an unknown tag yields an empty list.
- **Unit (community):** `listDistinctCategories` counts only **visible** threads and orders by count
  then category; a hidden thread's category is neither counted nor surfaced by it alone;
  `listThreadsByCategory` returns visible threads in the category in newest order (hidden omitted,
  locked included) and paginates with the keyset cursor.
- **Integration (repositories):** the memory and PostgreSQL reads agree on filtering and ordering; the
  migration adds and drops both indexes (`migrations` test).
- **Component:** `/topics` renders the tag grid with counts for everyone and the category grid with
  counts only for a signed-in viewer (a sign-in prompt otherwise); `/tags/[tag]` renders the item list
  and an empty state; `/categories/[category]` renders the thread list and an empty state; `/content/[id]`
  renders tag links and `/community/[id]` renders the category link.
- **Manual:** tag a published item, confirm it appears on `/topics` with the right count, open its
  `/tags/[tag]` page, hide a thread as an admin and confirm its category count and category page drop
  it, and confirm `/categories/[category]` redirects an anonymous visitor to `/auth`.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Members-only thread content renders on a non-gated route | **High** | `/categories/:path*` is added to the middleware matcher and the index's category section only renders for a resolved viewer (§7); the community reads are visible-only (§5) |
| A hidden thread leaks through a category count or list | **High** | The `moderation_state = 'visible'` filter lives in the repository queries (§5, §9), the same rule the hub uses; a test asserts a hidden thread is absent from both |
| Tag/category strings with spaces or Bangla break the route segment | Medium | Next.js encodes/decodes the dynamic segment; the link is built with `encodeURIComponent` from the exact stored value and the page decodes `params`, so the round-trip is lossless |
| A duplicate tag casing ("AI" vs "ai") fragments a topic | Medium | Accepted and documented (§4): the distinct list is the exact set of stored values; normalization is a separate slice, not a hidden behaviour change here |
| The browse index derives topics from a page of items and misses some | Medium | Topics come from the distinct reads (`group by`), not from a page of items, so the topic set is complete regardless of list pagination (§5) |
| The category index hide/show state drifts from the hub | Low | Both read through the same community service/repository; the category list reuses the hub's thread query with one extra predicate |
| Adding a GIN index causes a long migration lock on a large table | Low | The table is small and the index is additive; PostgreSQL's default `CREATE INDEX` concurrency is acceptable at this scale, and `down` drops it cleanly |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Corpora — research tags and community categories.** The browse covers both existing metadata
   columns in one slice: research items by tag and community threads by category.
2. **Routes — separate `/tags/[tag]` and `/categories/[category]`.** A tag and a category are distinct
   namespaces, so a shared name never collides, and each keeps its own visibility rule. A unified
   `/topics/[slug]` mixing both was rejected as ambiguous.
3. **A browse index with counts, linked from the nav.** `/topics` lists every topic with its count and
   is linked from `publicNavItems` (and from each item's/thread's tags). Because the community half is
   members-only (§7), the research-tag section renders for everyone and the category section renders
   for a signed-in viewer only.
4. **Research public, community protected.** `/tags/[tag]` is public like `/content`; `/categories/[category]`
   requires sign-in like `/community` and is added to the middleware matcher. Published research and
   visible threads keep exactly the visibility they already had.
5. **Reads are distinct-plus-filtered, index-backed.** The slice adds `listDistinctPublishedTags`,
   `listPublishedItemsByTag`, `listDistinctCategories`, and `listThreadsByCategory` plus one additive
   index migration, rather than scanning global lists in the composition root.
6. **No new HTTP endpoint.** The topic surface is read-only server rendering; nothing needs a route
   handler.
7. **No new module and no taxonomy editing.** Topics are a projection of existing columns; tags and
   categories stay free-form and uncurated (§4).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the
`/categories/:path*` route-protection note), [data-models.md](data-models.md) (the new repository
methods and the two indexes), [module-boundaries.md](module-boundaries.md) (the new content/community
read surfaces and the absence of a new module), [system-overview.md](system-overview.md) (the browse
surfaces and the matcher), and [server-vs-client-components.md](server-vs-client-components.md) (the
three new server-component pages; no new client island) are updated; the index migration is added with
a working `down`; and the slice status plus the [index](README.md) entry are flipped to `Implemented`.
`configuration.md` and `.env.example` are **not** touched — no driver or env var is added.

## 15. Recommended Implementation Order

On acceptance: migration (the two indexes) → content domain types → content memory repository → content
PostgreSQL repository → content service (`listDistinctPublishedTags`, `listPublishedItemsByTag`) →
community domain types → community memory repository → community PostgreSQL repository → community
service (`listDistinctCategories`, `listThreadsByCategory`) → the `/categories/:path*` matcher entry →
the "Topics" nav entry → `app/topics/page.tsx` → `app/tags/[tag]/page.tsx` →
`app/categories/layout.tsx` + `app/categories/[category]/page.tsx` → the tag/category links on the two
detail pages → tests → docs update. Follow the order used by the discovery and member-profile slices
([member-profile-slice.md](member-profile-slice.md) §15).
