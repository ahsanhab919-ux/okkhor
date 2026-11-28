# Community Moderation Slice

- Status: `Implemented` (ninth product slice — decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [community-slice.md](community-slice.md) (the discussion surface being moderated),
  [scholar-verification-slice.md](scholar-verification-slice.md) (the admin review-queue pattern to
  mirror), [member-profile-slice.md](member-profile-slice.md) (the most recent
  composition-root slice)

## 1. Purpose

The community slice shipped a discussion surface with **no way to intervene**. §4 of
[community-slice.md](community-slice.md) deferred "editing or deleting threads/replies, and any
moderation/flagging tools", and §12 recorded the risk plainly: "Spam / abusive posting without
moderation — Medium". That deferral is now the live gap. A thread or a reply, once posted, is
permanent and visible to every member; there is no hide, no restore, no lock, and no audit of who
acted.

This document is the design/architecture note and Definition of Ready for the **ninth product
slice — community moderation tools** — which gives administrators three powers over the discussion
surface: **hide** (a soft, reversible removal of a thread or a reply), **restore**, and **lock**
(a thread that accepts no further replies). It adds a moderator queue at `/admin/community`, inline
moderation controls on a thread, moderation state to the existing `community` module, and one
additive migration.

It is a **single-module slice**: it extends `community` only. It introduces **no new module, no new
domain entity, and no new infrastructure**, and it reuses the admin review-queue shape already
proven by the verification slice (§8).

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | An administrator removes rule-breaking threads and replies from every member surface, and closes a thread that has run its course; every action is attributed and reversible (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the community slice's tables, repository, and services (already built); the identity session/roles (already built); no new infrastructure (§10) |
| Risk level understood | **Medium** — the change is small but it is the first slice that **removes** content from other members' views, so the visibility rule must hold on *every* read path, not only the list (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** The discussion surface becomes governable. An administrator opens `/admin/community`,
sees the newest threads with their moderation state, hides an offending thread or reply, and
restores it if the call was wrong. A thread that has run its course is locked: members can still
read it, but the reply form is replaced by a notice and the API refuses new replies. Hidden content
disappears from `/community`, from the thread page, and from member profiles — for everyone but a
moderator.

Acceptance criteria:

- [ ] A thread or reply carries a moderation state (`visible` | `hidden`); a hidden item is omitted
      from `/community`, from the thread detail read, and from the profile thread list.
- [ ] Opening a hidden thread's URL as a member returns `404`; `replyCount` counts only visible
      replies.
- [ ] A locked thread refuses new replies with `COMMUNITY_THREAD_LOCKED` (`409`); the thread page
      renders a "locked" notice instead of the reply form.
- [ ] An administrator can hide/restore a thread, lock/unlock a thread, and hide/restore a reply.
- [ ] Every moderation write records `moderatedBy` and `moderatedAt` (plus an optional note), so the
      decision is attributable after the fact.
- [ ] Non-administrators receive `403 COMMUNITY_FORBIDDEN` from every moderation use case, and
      `/admin/community` renders a restricted screen rather than the queue.
- [ ] The migration adds the moderation columns with a working `down`; existing rows are `visible`.
- [ ] Unit tests cover the authorization rule, the schemas, the visibility rule on each read path,
      and the lock rule; integration tests cover the routes and the migration.

## 4. Scope

**In scope:**

- moderation state on threads and replies (`visible` | `hidden`) and a `locked` flag on threads
- a `canModerate` rule (administrators) enforced in the application layer
- use cases: hide/restore a thread, lock/unlock a thread, hide/restore a reply
- a moderator queue at `/admin/community` and a per-thread moderation page
- inline moderation controls on the thread page for administrators
- one additive migration adding the moderation columns

**Explicitly out of scope (deferred):**

- **permanent deletion** — this slice hides (reversible); a hard delete is a separate, riskier
  operation with no undo
- **member reporting / flagging** — a report queue needs a new table, a new member write path, and
  its own triage rules; deferred rather than half-built (**resolved** by
  [member-reporting-slice.md](member-reporting-slice.md))
- editing another member's thread or reply (leaving a moderator edit note is a different feature)
- per-member rate limiting, throttling, or automatic spam detection (no new ephemeral state)
- notifications to an author that their content was hidden
- account-level sanctions (suspend/ban) — moderation acts on **content**, not on members
- moderator actions on **research items** — content authoring has its own status/ownership rules;
  this slice is the discussion surface only

Keeping the slice to a state flag, a lock flag, and one admin surface keeps it on `ADR-004` only and
triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/community/domain/community-types.ts`:

| Type | Fields |
| --- | --- |
| `ModerationState` | `"visible" \| "hidden"` |
| `ModerationAction` | `"hide" \| "restore" \| "lock" \| "unlock"` |
| `ModerateThreadInput` | `{ action: "hide" \| "restore" \| "lock" \| "unlock"; note?: string }` |
| `ModerateReplyInput` | `{ action: "hide" \| "restore"; note?: string }` |

Extended entities:

| Type | Added fields |
| --- | --- |
| `CommunityThread` | `moderationState`, `locked: boolean`, `moderatedBy?`, `moderatedAt?`, `moderationNote?` |
| `CommunityReply` | `moderationState`, `moderatedBy?`, `moderatedAt?`, `moderationNote?` |

Repository additions and contract changes in `CommunityRepository`:

| Method | Contract |
| --- | --- |
| `listThreads(options)` | **Changed:** `options` gains `includeHidden?: boolean`; member reads omit hidden threads, the moderator queue includes them |
| `listRepliesByThreadId(threadId, options?)` | **Changed:** `options` gains `includeHidden?: boolean`; member reads omit hidden replies |
| `getReplyById(id)` | A single reply in any state, or `undefined` |
| `updateThreadModeration(thread: CommunityThread)` | Persist the moderation columns (`moderationState`, `locked`, `moderatedBy`, `moderatedAt`, `moderationNote`) for an existing thread id |
| `updateReplyModeration(reply: CommunityReply)` | The reply equivalent |

Notes:

- **Visibility is a read-path rule, not a UI rule.** Every member-facing read (`/community`, the
  thread detail, and the profile thread list) filters hidden items *in the repository query*, so a
  page cannot render hidden content by forgetting a check.
- **`listThreadsByAuthor` stays visible-only** and gains no flag: a member profile is member-facing.
- `getThreadById` is unchanged and returns a thread in **any** state; the service decides whether the
  caller may see it (§7). The moderator page needs the row it is about to restore.
- `locked` is a **public** flag — members must be told why they cannot reply — while
  `moderatedBy`/`moderatedAt`/`moderationNote` are moderator-only and are stripped before a member
  response is shaped.
- Moderation is **soft**: no `delete` ships, so a wrong call is always repairable by `restore`.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the standard
error envelope). They live under a distinct `/api/community/moderation/**` namespace, mirroring the
admin surface of `/api/verification/applications/**`. **All four require the `admin` role.**

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/community/moderation/threads` | The moderation queue: newest threads, hidden included | `admin` |
| `GET` | `/api/community/moderation/threads/[id]` | A thread with **all** its replies, hidden included | `admin` |
| `POST` | `/api/community/moderation/threads/[id]` | Apply a thread action (`hide` \| `restore` \| `lock` \| `unlock`) | `admin` |
| `POST` | `/api/community/moderation/replies/[id]` | Apply a reply action (`hide` \| `restore`) | `admin` |

### 6.1 `GET /api/community/moderation/threads`

- **Query:** `limit` (default `20`, clamped to `[1, 50]`) — the same clamp as the member list.
- **Success** `200`: `{ "threads": [ { "…CommunityThreadSummary…", "moderationState", "locked" } ] }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 6.2 `GET /api/community/moderation/threads/[id]`

- **Success** `200`: `{ "thread": { "…CommunityThread…" }, "replies": [ { "…CommunityReply…" } ] }`,
  with hidden rows included and moderator metadata present.
- **Errors:** `COMMUNITY_THREAD_NOT_FOUND` (404), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 6.3 `POST /api/community/moderation/threads/[id]`

- **Request:** `{ "action": "hide", "note": "…" }` — `action` is one of the four verbs; `note` is
  optional (≤ 500 chars).
- **Success** `200`: `{ "thread": { "…CommunityThread…" } }` — the updated thread.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_THREAD_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 6.4 `POST /api/community/moderation/replies/[id]`

- **Request:** `{ "action": "hide" }` — `hide` or `restore`; `note` is optional.
- **Success** `200`: `{ "reply": { "…CommunityReply…" } }`.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_REPLY_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 6.5 Changed member endpoints

`GET /api/community/threads`, `GET /api/community/threads/[id]`, and
`POST /api/community/threads/[id]/replies` keep their paths, payloads, and success shapes. Their
**behaviour** narrows: hidden threads/replies are omitted, and a reply to a locked thread now fails
with `409`.

### 6.6 Error codes

New codes, whose executable source of truth is
`src/modules/community/domain/community-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `COMMUNITY_FORBIDDEN` | 403 | The caller is authenticated but is not an administrator |
| `COMMUNITY_THREAD_LOCKED` | 409 | A reply was attempted on a locked thread |
| `COMMUNITY_REPLY_NOT_FOUND` | 404 | Reply id is unknown |

`COMMUNITY_VALIDATION_FAILED`, `COMMUNITY_THREAD_NOT_FOUND`, and `COMMUNITY_UNKNOWN` are reused
unchanged.

## 7. Authorization Model

- **Moderation is an administrator power.** A new
  `src/modules/community/domain/community-authorization.ts` exports `canModerate(roles)`, following
  the shape of `verification-authorization.ts`. Every moderation use case asserts it in the
  **application layer** (`assertCanModerate`), not only in the UI (`ADR-001`).
- **Members keep their existing rights.** Posting and replying stay role-free; this slice adds no
  new permission for `learner` or `scholar`.
- **Hidden means hidden.** The visibility filter lives in the repository reads (§5), so it applies
  to the API, the pages, and the profile in one place. A member who opens a hidden thread's URL gets
  a `404`, identical to a deleted thread — the response does not reveal that content was moderated.
- **The lock is server-side.** `createReply` rejects a locked thread before writing, so a stale open
  form cannot bypass the lock.
- **Moderator metadata never reaches a member.** `moderatedBy`, `moderatedAt`, and `moderationNote`
  are returned only from the moderation endpoints; the member thread shape carries `moderationState`
  (implicitly `visible`) and `locked` only.
- **Edge gate.** The moderator pages live under `/admin/community/**`, already covered by the
  `/admin/:path*` middleware matcher — **no matcher change is needed**. As with the verification
  queue, the middleware only proves authentication; the `admin` rule is applied server-side by both
  the layout and the application layer.
- **Composition root.** A new `app/community-session.ts` resolves the viewer for the pages
  (`getCommunityViewer()`), mirroring `app/verification-session.ts`; the existing
  `app/api/community/community-actor.ts` supplies the actor for the routes. The community module
  imports identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/community/
  domain/         community-types.ts          (+ moderation fields, ModerationState, ModerationAction,
                                               repository additions and read flags)
                  community-authorization.ts  (new: canModerate)
                  community-errors.ts         (+ COMMUNITY_FORBIDDEN, COMMUNITY_THREAD_LOCKED,
                                               COMMUNITY_REPLY_NOT_FOUND)
                  community-schemas.ts        (+ moderateThreadSchema, moderateReplySchema)
  application/    community-service.ts        (+ listModerationQueue, getModerationThread,
                                               moderateThread, moderateReply;
                                               getThread and createReply gain visibility/lock rules)
  infrastructure/ community-store.ts          (+ moderation fields, visibility filters,
                                               getReplyById, update*Moderation)
                  postgres-community-repository.ts (same, in SQL)
  ui/             thread-list.tsx              (reused: renders state/lock pills)
                  moderation-controls.tsx      (new: "use client" action island)
app/
  community-session.ts                         (new: getCommunityViewer)
  community/[id]/page.tsx                      (locked notice replaces the reply form)
  admin/community/layout.tsx                   (admin gate; mirrors admin/verifications/layout.tsx)
  admin/community/page.tsx                     (the moderation queue)
  admin/community/[id]/page.tsx                (thread + all replies + controls)
  api/community/moderation/threads/route.ts
  api/community/moderation/threads/[id]/route.ts
  api/community/moderation/replies/[id]/route.ts
```

- `community` continues to depend on `platform` only and to import identity **types only**; it does
  not import `verification`, `content`, or `identity` services. `canModerate` is a community-domain
  rule over `UserRole`, exactly as `canReview` is a verification-domain rule.
- `app/community/**` and `app/api/community/**` remain the composition root that resolves the actor
  and threads it into the module.
- The admin queue reuses the `archive-card` markup and `ProtectedWorkspaceShell` chrome already used
  by the verification queue, so the two admin surfaces look like one console.
- `publicNavItems` is **not** changed: moderation is an admin surface reached from the existing
  `/admin` family of routes, not a member nav entry.

## 9. Persistence and Migration

New migration `migrations/20261128160000_add_community_moderation.cjs` (kebab-case config,
`single-transaction: true`, with a working `down` that drops the reply columns before the thread
columns):

### 9.1 `community_threads` — added columns

| Column | Type | Constraints |
| --- | --- | --- |
| `moderation_state` | `text` | not null, default `visible` |
| `locked` | `boolean` | not null, default `false` |
| `moderated_by` | `text` | nullable |
| `moderated_at` | `text` | nullable |
| `moderation_note` | `text` | nullable |

### 9.2 `community_replies` — added columns

| Column | Type | Constraints |
| --- | --- | --- |
| `moderation_state` | `text` | not null, default `visible` |
| `moderated_by` | `text` | nullable |
| `moderated_at` | `text` | nullable |
| `moderation_note` | `text` | nullable |

- Every column is **additive and nullable-or-defaulted**, so the migration backfills existing rows
  to `visible`/`false` with no data rewrite and no downtime.
- **No new index.** The queue lists newest threads with the existing
  `community_threads_created_at_id_idx`; the visibility filter is a low-cardinality predicate on a
  table that is already limit-bounded.
- `moderated_by` stores a bare member id as `text` with no cross-module foreign key, matching
  `author_id`.
- No driver-selection change: `COMMUNITY_STORAGE_DRIVER=auto|memory|postgres` is untouched and
  `.env.example` is not modified.

**Queries:**

- **Visible list:** the existing list query gains `AND t.moderation_state = 'visible'`; the
  moderator queue omits that clause.
- **Reply count:** the correlated subquery filters `r.moderation_state = 'visible'`, so a hidden
  reply does not inflate the count.
- **Replies:** the per-thread read gains `AND moderation_state = 'visible'`; the moderator read
  omits it and orders as before.
- **Moderation write:** `update … set moderation_state = $1, locked = $2, moderated_by = $3,
  moderated_at = $4, moderation_note = $5 where id = $6` (and the reply equivalent without
  `locked`).

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; moderation moves a state flag.
- **`ADR-005` (Redis)** — no rate limiting, throttling, or cache; nothing new is ephemeral.
- **`ADR-006` (Qdrant)** — no semantic search; the moderation queue is a recency scan.
- **`ADR-007` (offline)** — moderation is online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL) and the already-built community module.

## 11. Testing Plan (`§7.3`)

- **Unit:** `canModerate` (admins yes; learner/scholar no); the moderation schemas (allowed verbs,
  reply verbs are `hide`/`restore` only, note length bound); the service — a non-admin gets `403`;
  `hide` removes a thread from the member list, the detail read (`404`), and the profile list while
  the moderator queue still returns it; `restore` brings it back; `lock` makes `createReply` throw
  `COMMUNITY_THREAD_LOCKED`; hiding a reply removes it from the detail read and decrements
  `replyCount`; an unknown reply id yields `COMMUNITY_REPLY_NOT_FOUND`; each write stamps
  `moderatedBy`/`moderatedAt`.
- **Unit (memory store):** the visibility flags on `listThreads`, `listRepliesByThreadId`, and
  `listThreadsByAuthor`; `getReplyById`; the moderation updates.
- **Integration (routes):** `401` unauthenticated and `403` for a non-admin on every moderation
  endpoint; the admin happy path hide → queue shows it, member list does not → restore; `409` on
  replying to a locked thread; `400` on an unknown action; `404` on an unknown reply id. The
  migration `up`/`down` against PostgreSQL.
- **Component:** the thread page renders the locked notice and no reply form; `/admin/community`
  renders the restricted screen for a non-admin and the queue (with state pills) for an admin; the
  moderation control surfaces a server error.
- **Manual:** register a member and an admin, post a thread and a reply, hide the reply as the admin
  and confirm the member's view drops it, hide and restore the thread, lock it and confirm the reply
  form is gone and the API refuses.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A hidden item still appears on some member read path | **High** | The filter lives in the repository queries (§5, §9), not in the pages; every member read path has an explicit test (§11); a hidden thread's detail is a `404`, not a rendered tombstone |
| A moderator action is mistaken and content seems lost | Medium | Nothing is deleted — only `hidden`; `restore` is one click, and the queue lists hidden threads |
| Moderator metadata (who hid what) leaks to members | Medium | Member responses are shaped from the thread/reply minus `moderatedBy`/`moderatedAt`/`moderationNote`; only `/api/community/moderation/**` returns them |
| A member with the reply form open bypasses the lock | Low | `createReply` re-reads the thread and rejects a locked one in the application layer, so the check is not UI-only |
| The admin surface is reachable by a signed-in non-admin | Medium | The layout renders the restricted screen and every use case asserts `canModerate` (`ADR-001`); the routes return `403`, not the data |
| The moderation columns break the existing community reads | Low | Every column is additive with a default; the migration has a working `down`; the existing community tests must still pass unchanged |
| Backfilling a large table during the migration | Low | The columns are defaulted, not rewritten, so PostgreSQL stores the default without a table rewrite |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Who may moderate — administrators only.** `canModerate(roles)` mirrors the verification
   slice's `canReview`: the rule is `admin` alone, it lives in the community domain, and every
   moderation use case asserts it in the application layer. Learners and scholars gain no new
   permission; the existing role-free posting and replying rights are unchanged.
2. **Actions — hide/restore plus lock/unlock.** Threads and replies can be hidden and restored;
   threads can additionally be locked and unlocked. **No permanent delete ships**, so every
   moderation call is reversible and no member content is unrecoverable.
3. **Hidden content is fully invisible.** A hidden thread or reply is omitted from the member list,
   the thread detail read, the profile thread list, and the reply count. Opening a hidden thread's
   URL as a member returns `404` — the same response as an unknown thread — so the response never
   reveals that content was moderated. The visibility filter lives in the repository reads (§5, §9).
4. **Member reporting is out of scope.** No flag/report path ships in this slice; a report queue
   needs its own table, member write path, and triage rules, and is deferred as a candidate future
   slice (§4). **Resolved** by [member-reporting-slice.md](member-reporting-slice.md): the report
   table, the member report path, and the admin triage queue now ship in that slice.
5. **Entry points — a queue and inline controls.** Administrators moderate from
   `/admin/community` (the queue) and from `/admin/community/[id]` (a thread with all of its
   replies), and a member's thread page shows the same inline controls to an administrator. The two
   admin surfaces reuse the verification queue's chrome, and `/admin/:path*` is already in the
   middleware matcher, so no matcher change is needed.
6. **Attribution — every write is recorded.** Each moderation write stamps `moderatedBy`,
   `moderatedAt`, and an optional `moderationNote`; those fields are returned only from the
   moderation endpoints and never from a member-facing read.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the new namespace,
the changed member endpoints, the new error codes), [data-models.md](data-models.md) (the new
columns, the repository methods, the visibility rule), [module-boundaries.md](module-boundaries.md)
(the new `community-authorization.ts` and `moderation-controls.tsx`), and
[system-overview.md](system-overview.md) (the admin surface) are updated; the migration is added
with a working `down`; and the slice status plus the [index](README.md) entry are flipped to
`Implemented`. `configuration.md` and `.env.example` are **not** touched — no driver or env var is
added.

## 15. Recommended Implementation Order

On acceptance: migration (moderation columns) → domain (`ModerationState`/`ModerationAction`/
moderation fields → `community-authorization.ts` → new error codes → moderation schemas) →
infrastructure (memory store: fields, visibility filters, `getReplyById`, `update*Moderation`, then
the PostgreSQL repository in the same order) → application (`getThread`/`createReply` rules →
`listModerationQueue` → `getModerationThread` → `moderateThread` → `moderateReply`) → routes
(`/api/community/moderation/**`) → `app/community-session.ts` → the locked notice on the thread page
→ `/admin/community` layout + queue + detail → the inline moderation controls → tests → docs update.
Follow the order used by the verification and community slices
([scholar-verification-slice.md](scholar-verification-slice.md) §15).
