# Member Profile Slice

- Status: `Proposed` (eighth product slice — decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [library-slice.md](library-slice.md) (the most recent slice; pattern to mirror),
  [discovery-slice.md](discovery-slice.md) (the per-author filter that proves authorship is
  addressable)

## 1. Purpose

Okkhor has no member roster and no member surface. A thread or a research item shows an author's
*name* (resolved through identity for the discovery slice), but there is nowhere to go to see who
that member is or what else they have written. Authorship is stored — `content_items.author_id`,
`community_threads.author_id` — but it is not addressable.

Making authorship addressable is the cheapest trust feature the product has: a learner who reads a
good summary can ask "who wrote this, and what else?" and a scholar's body of work becomes a
profile rather than a set of orphaned posts.

This document is the design/architecture note and Definition of Ready for the **eighth product
slice — the member profile page** — which delivers a member profile at `/profile` (your own) and
`/u/[id]` (another member's), showing a member's public footprint: display name and role badge,
authored research items, and authored community threads, plus a private rollup on your own profile.
It is a **composition-root slice**: it adds public read surfaces to the identity, content,
community, and library modules and renders two pages; it introduces **no new module, no new
domain entity, and no new infrastructure**.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member opens a profile and sees who that member is and what they have contributed — their published research items and their community threads (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the identity session/roles, content authorship, community authorship, and library slices (all already built); no new infrastructure (§10) |
| Risk level understood | **Low** — a read-only composition-root slice; the only schema change is two additive indexes; the notable risk is exposing member data on a public route, mitigated in §7 and §12 |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Every member has a profile. A signed-in member opens **`/profile`** and sees their own
name, role badge, and member-since date, a private rollup of their library, and their authored
research items and threads. Anyone can open **`/u/[id]`** and see another member's public
footprint, with each contribution linking to its detail page.

Acceptance criteria:

- [ ] `/profile` renders the signed-in member's display name, role badge(s), and member-since date.
- [ ] `/profile` lists the member's authored research items (published, plus drafts flagged when the
      member is the viewer) and authored community threads, each linking to its detail page.
- [ ] `/profile` shows a private rollup linking to `/library` with the member's saved-item count.
- [ ] `/u/[id]` renders another member's display name, role badge(s), member-since date, and
      published research items; for a signed-in viewer it also renders that member's threads, and
      for an anonymous viewer the threads section is replaced by a sign-in prompt (§7).
- [ ] `/u/[id]` for an unknown id returns `404` (a Next.js `notFound()`).
- [ ] No profile view exposes a phone number, password metadata, or any other member's saved items.
- [ ] `/profile` is gated at the edge and redirects an anonymous visitor to `/auth?next=/profile`.
- [ ] A member may open their own `/u/[id]` and it agrees with `/profile`.
- [ ] Unit tests cover the new public read surfaces; component tests cover both pages (populated,
      empty, and unknown-member states).
- [ ] No new HTTP endpoint is added; both pages read the module services directly at the composition
      root.

## 4. Scope

**In scope:**

- a `PublicProfile` identity view type and a `getPublicProfile(id)` public surface that returns only
  non-sensitive fields
- an author-scoped published-items read on content and an author-scoped thread read on community
- a saved-item count on library, so the own-profile rollup is exact
- a `/profile` page (protected) and a `/u/[id]` page (visibility per §13)
- a shared thread-list presentational component extracted from `/community` so the profile and the
  hub share one card
- a "Profile" entry in the public navigation
- one additive migration adding author indexes to `content_items` and `community_threads`

**Explicitly out of scope (deferred):**

- editing a profile (display name, avatar, bio, locale) — this slice is read-only
- following, followers, or a member directory / roster
- a reputation score, badges beyond the existing roles, or contribution counts beyond the library
- showing *another* member's saved library or any private state
- per-author pagination beyond a capped list — a single capped list is the baseline (§13)
- the author profile for house/system-authored items that carry no `authorId`

Keeping the slice to read surfaces on existing tables keeps it on `ADR-004` plus the already-built
identity, content, community, and library modules, and triggers none of the deferred infrastructure
ADRs (§10).

## 5. Core Entities and Domain Changes

No new domain entity. One new identity view type, plus new read options on two existing repository
contracts.

**Identity** (`src/modules/identity/domain/auth-types.ts`):

| Type | Fields | Note |
| --- | --- | --- |
| `PublicProfile` | `id: string`, `displayName: string`, `roles: UserRole[]`, `createdAt: string` | The **only** member shape a profile page may render. Deliberately excludes `phoneNumber`, `locale`, `lastLoginAt`, `updatedAt`, and `passwordUpdatedAt` |

**Content** (`src/modules/content/domain/content-types.ts`) — add to `ContentRepository`:

| Method | Contract |
| --- | --- |
| `listPublishedItemsByAuthor(authorId, options: { limit: number })` | The author's **published** items, `publishedAt` descending then `id` descending, truncated to `limit` |

**Community** (`src/modules/community/domain/community-types.ts`) — add to `CommunityRepository`:

| Method | Contract |
| --- | --- |
| `listThreadsByAuthor(authorId, options: { limit: number })` | The author's threads as `CommunityThreadSummary`, `createdAt` descending then `id` descending, truncated to `limit` |

**Library** (`src/modules/library/domain/library-types.ts`) — add to `LibraryRepository`:

| Method | Contract |
| --- | --- |
| `countSavedItems(userId)` | The exact number of saves the member holds |

Notes:

- The profile pages are **read-only compositions**. They do not write to content, community, or
  library, so none of those modules gains a new command.
- The identity module owns the member identity; the content/community/library modules keep owning
  their own rows and expose only author-scoped reads. The composition root joins them by id (§8).

## 6. API Contracts

**No new HTTP endpoint.** Both profile pages are server components that read the module services
directly at the composition root, exactly as `/library` and `/community` do. The profile surface has
no client mutations, so there is nothing for a route handler to protect. The new error code set is
therefore empty and [api-contracts.md](api-contracts.md) gains only an endpoint-adjacent note (§7
matcher) plus the module-boundary notes.

## 7. Authorization Model

- **Own profile is a member surface.** `/profile` is added to the middleware matcher; an anonymous
  visitor is redirected to `/auth?next=/profile`. The page re-checks the session defensively.
- **The public profile is read-only and public-footprint-only.** `getPublicProfile` returns the
  `PublicProfile` view (§5), which carries no phone number and no password metadata, so nothing
  sensitive can leak through the route even if a caller forgets to filter.
- **Threads on `/u/[id]` follow the hub's gate.** Because `/community` is members-only, the threads
  section is only rendered for a signed-in viewer; an anonymous visitor sees a sign-in prompt in its
  place. Published research items are public and render for everyone.
- **Private state never crosses to `/u/[id]`.** Saved items and draft research items are shown
  **only** on `/profile`, and only for the signed-in viewer; `/u/[id]` shows published items and
  public threads only.
- **Drafts are owner-only.** The own profile may mark the viewer's own drafts, using the existing
  authoring read; a draft is never rendered on `/u/[id]`.
- **Composition root.** The viewer is resolved in `app/**` (as in every prior slice); the content,
  community, and library modules import identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/identity/
  domain/auth-types.ts                 (+ PublicProfile)
  application/auth-service.ts          (+ getPublicProfile)          [public read surface]
  ui/profile-card.tsx                  (presentational: name, role badge, member-since)
src/modules/content/
  domain/content-types.ts              (+ listPublishedItemsByAuthor)
  infrastructure/content-store.ts      (+ listPublishedItemsByAuthor)
  infrastructure/postgres-content-repository.ts (+ listPublishedItemsByAuthor)
  application/content-service.ts       (+ listPublishedItemsByAuthor)  [public read surface]
  ui/content-views.tsx                 (reused: ContentItemList)
src/modules/community/
  domain/community-types.ts            (+ listThreadsByAuthor)
  infrastructure/community-store.ts    (+ listThreadsByAuthor)
  infrastructure/postgres-community-repository.ts (+ listThreadsByAuthor)
  application/community-service.ts     (+ listThreadsByAuthor)      [public read surface]
  ui/thread-list.tsx                   (extracted: ThreadList, reused by /community)
src/modules/library/
  domain/library-types.ts              (+ countSavedItems)
  infrastructure/{library-store,postgres-library-repository}.ts (+ countSavedItems)
  application/library-service.ts       (+ countSavedItems)          [public read surface]
src/modules/experience/site-content.ts (+ "Profile" nav entry)
app/
  profile-session.ts                   (getProfileViewer + getOptionalViewer)
  profile/layout.tsx                   (protected workspace chrome)
  profile/page.tsx                     (server component; the viewer's own profile)
  u/[id]/page.tsx                      (server component; another member's profile)
```

- The profile pages depend on `identity`, `content`, `community`, and `library` read surfaces. None
  of those modules depends on another; the joins happen in `app/**`.
- **Thread-list extraction.** The discussion card markup currently lives inline in
  `app/community/page.tsx`. It moves to `src/modules/community/ui/thread-list.tsx` as
  `ThreadList({ threads })` and `/community` is updated to use it, so the hub and the profile share
  one card with no duplicated markup.
- **Profile card.** `src/modules/identity/ui/profile-card.tsx` is a server presentational component
  that renders a `PublicProfile`; it is the only new UI component (the activity lists reuse
  `ContentItemList` and `ThreadList`).
- `publicNavItems` gains `{ label: "Profile", href: "/profile" }`; because `/profile` is in the
  middleware matcher, an anonymous click redirects to `/auth`.
- `/u/[id]` is a **public** route and is deliberately **not** added to the middleware matcher; only
  `/profile` is gated (§7, §13).

## 9. Persistence and Queries

**No new table.** One additive migration adds two indexes so the author-scoped reads are indexed:

| Index | On | Serves |
| --- | --- | --- |
| `content_items_author_id_published_at_idx` | `content_items (author_id, published_at)` | `listPublishedItemsByAuthor` |
| `community_threads_author_id_created_at_idx` | `community_threads (author_id, created_at)` | `listThreadsByAuthor` |

- Both indexes are additive and reversible (`exports.down` drops them); no column, table, or
  constraint changes.
- `author_id` is nullable on `content_items` (existing rows may predate authorship), so
  `listPublishedItemsByAuthor` matches on the exact id and a null author is never returned for any
  id.

**Queries:**

- **Published items by author:**
  `select … from content_items where author_id = $1 and status = 'published' order by published_at
  desc, id desc limit $2`.
- **Threads by author:** `select …, (select count(*) from community_replies r where
  r.thread_id = t.id) as reply_count from community_threads t where t.author_id = $1 order by
  t.created_at desc, t.id desc limit $2`.
- **Saved count:** `select count(*) from saved_items where user_id = $1`.

No driver selection change: these are ordinary reads through the existing repository selectors.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media or avatars.
- **`ADR-005` (Redis)** — no caching; two server-rendered pages.
- **`ADR-006` (Qdrant)** — no semantic discovery; the author read is an exact-id metadata filter, not
  a ranking workload.
- **`ADR-007` (offline)** — profiles are online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL) and the already-built identity, content, community, and library
modules.

## 11. Testing Plan (`§7.3`)

- **Unit:** `getPublicProfile` returns only the `PublicProfile` fields (assert `phoneNumber` and
  `passwordUpdatedAt` are absent) and throws `404` for an unknown id; `listPublishedItemsByAuthor`
  returns only the author's published items in order and honours the limit; `listThreadsByAuthor`
  mirrors it with reply counts; `countSavedItems` is exact.
- **Integration (repositories):** the memory and PostgreSQL author-scoped reads agree on ordering
  and filtering; the migration adds and drops both indexes (`migrations` test).
- **Component:** `/profile` renders the member header, items, threads, and the library rollup;
  `/u/[id]` renders the public footprint and never renders private state; an empty profile shows an
  empty state; an unknown `/u/[id]` renders the not-found UI; `/community` still renders through the
  extracted `ThreadList`.
- **Manual:** sign in, open `/profile`, confirm the rollup count matches `/library`, open a thread's
  author link to `/u/[id]`, and confirm the public view shows no private data.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A profile view leaks member PII (phone number) onto a public route | **High** | The only member shape any page may render is `PublicProfile` (§5), which has no phone number; `/u/[id]` never reads the library or drafts (§7); a test asserts the sensitive fields are absent |
| `/u/[id]` exposes members-only community content | Medium | Decided in §13; if the public route is chosen, its thread read is gated the same way the hub is, or the section is omitted for anonymous visitors |
| Extracting the community card regresses `/community` | Low | The extraction is markup-preserving and covered by the existing community page test plus a new `ThreadList` test |
| Author-scoped reads miss items whose `author_id` is null | Low | Null authors are simply not addressable; documented in §9, and the studio always stamps `author_id` going forward |
| Two pages drift from each other | Low | Both compose the same `profile-card`, `ContentItemList`, and `ThreadList`; only the data scope differs (§8) |
| A page silently renders another member's data | Low | `/profile` always scopes to the session viewer; `/u/[id]` always takes the id from the route and reads only published/public surfaces (§7) |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Routes — `/profile` and `/u/[id]`.** `/profile` is the signed-in member's own surface and is
   gated at the edge; `/u/[id]` is another member's profile, with visibility per decision 2.
2. **Visibility of `/u/[id]` — public read.** Anyone may open another member's profile and see the
   public footprint: display name, role badge(s), member-since, and published research items. No
   phone number and no private state is reachable through the route. The threads section is rendered
   only for a signed-in viewer, matching the members-only `/community` hub. `/u/[id]` is therefore
   **not** added to the middleware matcher.
3. **Sections — member header plus all three activity lists.** The always-present header is name,
   role badge(s), and member-since. The profile also surfaces authored research items, authored
   community threads, and — on the owner's own `/profile` only — a saved-items rollup linking to
   `/library` with the exact count.
4. **Drafts — owner-only, own profile only.** `/profile` may flag the viewer's own drafts; a draft is
   never rendered on `/u/[id]`.
5. **Reads — author-scoped and index-backed.** The slice adds `listPublishedItemsByAuthor`,
   `listThreadsByAuthor`, `countSavedItems`, and one additive index migration rather than filtering
   global lists in the composition root.
6. **No new HTTP endpoint.** The profile surface is read-only server rendering; nothing needs a
   route handler.
7. **Navigation — a "Profile" entry** is added to `publicNavItems`.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md),
[data-models.md](data-models.md), [server-vs-client-components.md](server-vs-client-components.md),
[module-boundaries.md](module-boundaries.md), and [system-overview.md](system-overview.md) are
updated for the new surfaces; the author-index migration is added; and the slice status plus the
[index](README.md) entry are flipped to `Implemented`. `configuration.md` and `.env.example` are
**not** touched — no driver or env var is added.

## 15. Recommended Implementation Order

On acceptance: migration (author indexes) → identity `PublicProfile` + `getPublicProfile` → content
`listPublishedItemsByAuthor` (type → memory repo → PostgreSQL repo → service) → community
`listThreadsByAuthor` (same order) → library `countSavedItems` → extract `ThreadList` and switch
`/community` to it → `profile-card` → `app/profile-session.ts` composition helpers → `/profile` page
+ layout → `/u/[id]` page → nav entry → tests → docs update. Follow the order used by the community
and library slices ([library-slice.md](library-slice.md) §15).
