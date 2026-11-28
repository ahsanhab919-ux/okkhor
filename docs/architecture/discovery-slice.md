# Discovery Slice

- Status: `Implemented`
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-006` (deferred vector target), `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (the research read
  path), [content-authoring-slice.md](content-authoring-slice.md) (authorship), and
  [community-slice.md](community-slice.md) (threads and replies; pattern to mirror)

## 1. Purpose

Okkhor has no discovery surface. Research is only reachable by scrolling the archive in recency
order, and community threads are only reachable by opening `/community`. There is no way to ask
for "climate adaptation", "RAG", or "anything by this author" and get a result.

`ADR-006` names `Search` as a first-class domain and adopts `Qdrant` as the vector store for
**semantic** discovery — but explicitly defers it until "a concrete semantic discovery workload
exists", and names `PostgreSQL` **keyword and metadata search** as the mandatory fallback every
vector lookup must degrade to. That fallback is not yet built.

This document is the design/architecture note and Definition of Ready for the **fifth product
slice — discovery** — which delivers that keyword/metadata baseline: a unified search over
published research items and community threads, with text, tag/category, and author filters and a
relevance/recency sort. It is the pre-`Qdrant` half of `ADR-006` and the reference implementation
against which later semantic search is measured (`ADR-006`, Validation and Success Metrics).

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A signed-in member searches across research and community by text, tag/category, and author, and gets correctly ranked, navigable results (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the content read path and the community slice (already built); the identity session/roles (already built); no new infrastructure (§10) |
| Risk level understood | **Low** — a new read-only module, no new tables, no new role, and no privilege boundary beyond the existing member gate (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Make the corpus findable. A member opens `/search`, types a query, narrows by
research tag or thread category or by author, and reads a ranked list of matches spanning both
published research items and community threads, each linking to its detail page.

Acceptance criteria:

- [ ] `/search` renders a query form and a result list; results link to `/content/[id]` and
      `/community/[id]`.
- [ ] `GET /api/search` returns unified hits for a text query across **both** published research
      items and community threads.
- [ ] Filters work: research `tag`, thread `category`, and `author`, plus a `kind` narrowing.
- [ ] `sort=relevance` (default) and `sort=newest` both produce the documented ordering.
- [ ] Unauthenticated requests to the search endpoint return `401`; the page is gated at the edge.
- [ ] An empty or over-long query returns `400` with the standard error envelope.
- [ ] The author filter is offered as a dropdown of the authors present in the result set, labeled
      with display names resolved from identity; results show "by <name>".
- [ ] Unit tests cover the query schema and the scoring/merge service; integration tests cover the
      route and the page.
- [ ] No new database tables; the read path is read-only against `content_items` and
      `community_threads`.

## 4. Scope

**In scope:**

- a new `search` module with the standard layers (domain, application, infrastructure, api, ui)
- a unified, read-only search over published research items and community threads
- text query, research-tag and thread-category filters, an author filter, and a `kind` narrowing
- a deterministic relevance score and a recency sort
- `GET /api/search`, a `/search` page, and a "Search" entry in the public nav
- a small identity public surface (`getUserProfilesByIds`) so the composition root can label
  authors

**Explicitly out of scope (deferred):**

- **semantic / vector search** — `Qdrant` stays unprovisioned per `ADR-006`; this slice is the
  keyword baseline it must beat
- **cross-source cursor pagination** — results are a single ranked page capped at `limit`; a
  stable merged keyset across two sources is deferred
- full-text search (`tsvector`/`pg_trgm`) and trigram indexes — substring matching is the baseline
- saved searches, search history, analytics, and query suggestions
- recommendations / "related content" (a separate `ADR-006` workload)
- searching verification applications or any non-public corpus
- highlighting / snippet extraction around the matched terms (results show a leading excerpt)

Keeping the slice read-only, on two existing tables, with no new dependency, keeps it on
`ADR-004` plus the already-adopted identity module and triggers none of the deferred
infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/search/domain/search-types.ts`:

| Type | Fields |
| --- | --- |
| `SearchKind` | `"research" \| "thread"` |
| `SearchSort` | `"relevance" \| "newest"` |
| `SearchQuery` | `tokens: string[]`, `kind?: SearchKind`, `tags?: string[]`, `category?: string`, `authorId?: string`, `limit: number` (the repository-level filter) |
| `SearchCriteria` | `query: string`, `kind?`, `tag?`, `category?`, `author?`, `sort: SearchSort`, `limit` (the HTTP/application-level input) |
| `SearchDocument` | `kind`, `id`, `title`, `body`, `tags: string[]`, `authorId?`, `createdAt` (a normalized row, produced by the repository) |
| `SearchHit` | `kind`, `id`, `title`, `excerpt`, `tags: string[]`, `authorId?`, `createdAt`, `href`, `score` |
| `SearchResult` | `{ hits: SearchHit[]; total: number }` |
| `SearchRepository` | `searchDocuments(query: SearchQuery): Promise<SearchDocument[]>` |

Notes:

- The repository returns **normalized `SearchDocument`s**, not module entities. For a research
  item, `body` is `abstract` + `summaryBn` and `tags` is the item's tags; for a thread, `body` is
  the thread body and `tags` is `[category]`. This keeps the scoring logic source-agnostic.
- `href` and `excerpt` are derived in the application layer (the repository has no opinion about
  routes or presentation).
- The `search` module imports content and community **types only** (`ResearchItem`,
  `CommunityThread`) where it needs to name a row; it never calls their behaviour.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the
standard error envelope). Search requires an authenticated session (see §7).

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/search` | Unified search over research and community | authenticated |

### 6.1 `GET /api/search`

- **Query:**
  - `q` — required; trimmed, 1–120 chars.
  - `kind` — `all` (default) \| `research` \| `thread`.
  - `tag` — research tag filter.
  - `category` — community category filter.
  - `author` — an author id; narrows to items and threads by that member.
  - `sort` — `relevance` (default) \| `newest`.
  - `limit` — default `20`, clamped to `[1, 50]`.
- **Success** `200`:

  ```json
  { "hits": [ { "…SearchHit…" } ], "total": 12 }
  ```

  Each hit is `{ kind, id, title, excerpt, tags, authorId?, createdAt, href, score }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `SEARCH_VALIDATION_FAILED` (400), `SEARCH_UNKNOWN` (500).

### 6.2 Error codes

New codes, whose executable source of truth is
`src/modules/search/domain/search-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `SEARCH_VALIDATION_FAILED` | 400 | Query parameters failed schema validation (empty/over-long query, unknown `kind`/`sort`) |
| `SEARCH_UNKNOWN` | 500 | Unhandled failure (fallback) |

## 7. Authorization Model

- **Members only.** Search requires an authenticated session, and `/search` is added to the
  middleware matcher. The corpus includes community threads, which are member-only; gating the
  whole surface means results can never **widen access** to member-only content, per `ADR-006`
  ("filtering and authorization are enforced against … records, so a search can never widen
  access"). Research remains readable anonymously at `/content`; only the *search* surface is
  gated.
- **No role requirement.** Any authenticated member (learner, scholar, admin) may search.
- **No write path.** The module is read-only; there is nothing to authorize beyond the session.
- **Composition root.** The acting member is resolved in `app/**` (as in the content, verification,
  and community slices); the search module imports identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/search/
  domain/         search-types.ts           (kinds, criteria, documents, hits, repository type)
                  search-errors.ts          (SEARCH_* codes)
                  search-schemas.ts         (Zod query schema; tokenizer)
  application/    search-service.ts         (tokenize -> repository -> score -> merge -> sort)
  infrastructure/ search-repository.ts      (SEARCH_STORAGE_DRIVER selector)
                  search-store.ts           (in-memory repository; reads the content/community stores)
                  postgres-search-repository.ts
  api/            search-http.ts            (response/error shaping)
  ui/             search-form.tsx            ("use client" island: query + filters -> URL)
                  search-results.tsx         (server presentational component)
app/
  search/layout.tsx                          (protected workspace chrome)
  search/page.tsx                            (server component; reads ?q=&… searchParams)
  api/search/route.ts                        (GET)
```

- `search` depends on `platform` for the shared Postgres pool config.
- `search` **reads** the content and community data. This is an intentional, documented
  **read-only read model**: the search module owns no tables and writes nothing. The dependency
  edges are recorded in [module-boundaries.md](module-boundaries.md) §6:
  - `search` → `content`: the memory repository calls `getMemoryContentRepository()`; the Postgres
    repository reads `content_items`.
  - `search` → `community`: the memory repository calls `getMemoryCommunityRepository()`; the
    Postgres repository reads `community_threads`.
- **Identity addition.** `getUserProfilesByIds(ids): Promise<{ id: string; displayName: string }[]>`
  is added to identity's public surface (`auth-service.ts`, backed by a new
  `AuthRepository.listProfilesByIds`). It is called only by `app/search/…` to label the author
  dropdown and the "by <name>" line; the search module itself never resolves names.
- `publicNavItems` gains `{ label: "Search", href: "/search" }` after `Research`.

## 9. Persistence and Queries

**No new tables and no migration.** Search reads two existing tables read-only.

- **Research candidates:** from `content_items` where `status = 'published'`.
- **Thread candidates:** from `community_threads`.

**Filtering (repository).** A document matches when **every** token appears (case-insensitively)
in at least one of `title`, `body`, or the tag/category text — an AND-of-tokens substring match —
and when the `kind`, `tag`/`category`, and `authorId` filters (when present) all hold. In
PostgreSQL this is one `ILIKE` condition per token ANDed together; `tags` (a `jsonb` array) is
matched via its text representation. In memory it is the same predicate over the store maps.
Candidates are capped (`maxCandidates`, e.g. 200) before scoring.

**Scoring (application).** Identical in both drivers, computed in the service so it is unit
testable without a database:

- per token: `+3` if it appears in `title`, `+2` if it appears in a `tag`/`category`, `+1` if it
  appears in `body`; the hit score is the sum over tokens.
- `sort=relevance`: order by `score` desc, then `createdAt` desc, then `id` desc.
- `sort=newest`: order by `createdAt` desc, then `id` desc (score ignored).

**Merging.** The repository returns documents from both sources in one list; the service maps each
to a `SearchHit`, sorts per §6.1, and truncates to `limit`. `total` is the pre-truncation match
count.

Driver selection mirrors the established pattern:
`SEARCH_STORAGE_DRIVER=auto|memory|postgres` (default `auto`; `auto` is memory under
`NODE_ENV=test`, postgres when `DATABASE_URL` is present, otherwise a fail-fast throw).

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media.
- **`ADR-005` (Redis)** — no caching or ephemeral state; results are computed per request.
- **`ADR-006` (Qdrant)** — deliberately **not** provisioned; this slice is the keyword/metadata
  fallback path, not the vector path.
- **`ADR-007` (offline)** — search is online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL) and the already-built identity module.

## 11. Testing Plan (`§7.3`)

- **Unit:** the query schema (empty/over-long `q` rejected, `kind`/`sort` enums, `limit` clamp);
  the tokenizer; the scoring function (title > tag > body weighting, tie-break by recency); the
  merge/sort service (`relevance` vs `newest`); the memory repository (AND-of-tokens matching,
  tag/category and author filters, `kind` narrowing).
- **Integration:** `GET /api/search` (`401` unauthenticated; text query returns both kinds;
  `tag`/`category`/`author`/`kind` filters; `sort`; `limit` clamp; `400` empty query); the page
  renders results and the author dropdown.
- **Component:** `/search` renders hits linking to `/content/[id]` and `/community/[id]`; the form
  island reflects `q` and filters and navigates on submit; an empty result set shows the empty
  state.
- **Manual:** register a member, search a term present in one research item and one thread, apply
  a tag filter and an author filter, toggle `relevance`/`newest`, and open a result.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Substring matching misses multi-word / reordered queries | Medium | Documented as a baseline limitation (§4); full-text (`tsvector`) and semantic search are explicit follow-ups. Correctness of the AND-of-tokens rule is unit-tested |
| Candidate cap hides deep matches | Low | The cap is generous relative to the bootstrap corpus and is documented; the ranked page is the product surface, and cross-source pagination is deferred with a note |
| Sequential scans on `ILIKE` as tables grow | Low | Acceptable at bootstrap scale; a `pg_trgm` GIN index is a behavior-preserving follow-up, not required here |
| Gating search removes anonymous discovery | Low | Flagged and accepted in §7/§13: the corpus includes member-only threads, and widening access is prohibited by `ADR-006`. Research stays public at `/content` |
| Read-only cross-module query couples `search` to two tables | Medium | Recorded as an intentional read model in §8 and [module-boundaries.md](module-boundaries.md) §6; the module owns no tables and writes nothing |
| New module drifts from the layering rules | Medium | Copy the `content`/`community` structure; keep identity imports to types; resolve actors and author names in `app/**` |

## 13. Resolved Decisions

1. **Engine — PostgreSQL keyword/metadata search.** No new infrastructure; this is the `ADR-006`
   fallback path and the keyword baseline semantic search must later beat. `Qdrant` stays
   unprovisioned.
2. **Scope — research **and** community.** One unified result set over published research items
   and community threads.
3. **Capabilities — text, tag/category, author, and sort.** Free-text query; research `tag` and
   thread `category` filters; an author filter; and a `relevance`/`newest` sort. No pagination,
   suggestions, or saved searches in this slice.
4. **Surfacing — a new `/search` page plus `GET /api/search`,** with a "Search" entry in the public
   nav.
5. **Module — a new `search` module** with its own `SEARCH_STORAGE_DRIVER`, implemented as a
   read-only read model over the content and community tables (§8). One place owns discovery,
   matching `ADR-006`'s `Search` domain.
6. **Author filter — name plus dropdown.** Results show "by <name>"; the filter is a dropdown of
   the authors present in the result set, resolved through a new identity public surface
   `getUserProfilesByIds` used only at the composition root (§8).
7. **Access — members only.** Search requires a session and `/search` joins the middleware matcher,
   so results never widen access to member-only threads (§7).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md),
[data-models.md](data-models.md), [configuration.md](../configuration.md),
[server-vs-client-components.md](server-vs-client-components.md), and
[module-boundaries.md](module-boundaries.md) are updated for the new surface; the new error codes
are registered; and `.env.example` documents `SEARCH_STORAGE_DRIVER`.

## 15. Recommended Implementation Order

On acceptance: domain (types, errors, schemas/tokenizer) → application (scoring + merge service) →
infrastructure (driver selector, memory repository, PostgreSQL repository) → api helper → routes →
the identity `getUserProfilesByIds` public surface → `/search` page + `search-form` island + nav
entry → tests → docs update. Follow the order used by the authoring, verification, and community
slices ([content-authoring-slice.md](content-authoring-slice.md) §15).
