# Unread Badge Slice

- Status: `Proposed` (sixteenth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [notifications-slice.md](notifications-slice.md) (the module, table, endpoints,
  inbox, and nav entry this slice builds the badge on — and the slice that deferred "a live unread
  badge"), [reply-notifications-slice.md](reply-notifications-slice.md) and
  [verification-notifications-slice.md](verification-notifications-slice.md) (the producer slices
  whose outcomes the badge now counts)

## 1. Purpose

The notifications slice shipped the member inbox and the nav entry for it, and explicitly deferred
one item (`notifications-slice.md` §4, §13 decision 4):

> **a live unread badge** — the nav shows a link and icon only; an unread count on every page is
> deferred with the badge (§13 decision 4).

> **Inbox behaviour — mark-read, newest-first, kept indefinitely, a nav bell, no badge.** … no live
> unread badge is added (it would need an unread query on every page).

Three producers now write to the inbox (moderation/report outcomes, new replies, and
verification decisions), so a member has no at-a-glance signal that something is waiting: they must
open `/notifications` to find out. This slice adds that signal — a small count badge on the
`Notifications` entry in the shared workspace sidebar, visible on every protected page.

This document is the design/architecture note and Definition of Ready for the **sixteenth product
slice — the unread badge** — which reads the shipped `notifications` table through a new count query
and surfaces the result in the shipped sidebar:

- one new **repository method** (`countUnread`) and one **read-only use case**
  (`countUnreadNotifications`) — no new entity, table, column, or migration;
- one new **read endpoint** (`GET /api/notifications/unread-count`) returning `{ "unread": n }`;
- one new **client fetch in the shared shell** and a small **badge in the sidebar** — the count is
  never cached, never polled, and re-read after the member marks anything read.

It is a **read-surface slice**. It adds no table, migration, channel, producer, or configuration
variable; it only reads the inbox that already exists and renders one number.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member sees, from any protected page, how many unread notifications are waiting, so the three producer outcomes are discoverable without opening the inbox (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | The `notifications` module, table, endpoints, and sidebar nav entry (already built); the `read_at` column and the existing recipient index (already built, read-only reuse); the shared `ProtectedWorkspaceShell` and `experience` sidebar (already built, the mount point) |
| Risk level understood | **Low** — the slice is read-only and additive: it counts rows, never writes, never blocks a page, and an unavailable count degrades to "no badge" (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member with two unread notifications sees a small badge reading "2" on the
`Notifications` entry in the sidebar while browsing the community, their library, or any other
protected page. Opening `/notifications` and marking one read drops it to "1"; marking all read
removes the badge entirely. A member with nothing unread sees no badge. A guest sees no sidebar at
all (unchanged), and a count is only ever the signed-in member's own.

Acceptance criteria:

- [ ] `GET /api/notifications/unread-count` returns `{ "unread": n }` for the signed-in member, where
      `n` is the number of that member's notifications with no `readAt`, and `401 AUTH_UNAUTHORIZED`
      for an anonymous caller.
- [ ] The count is **owner-scoped**: it counts only the session member's notifications, using the
      same actor resolution as the other notifications endpoints.
- [ ] The sidebar `Notifications` entry renders the exact count as a badge when it is greater than
      zero, and renders **no** badge when it is zero (§13 decision 4).
- [ ] The badge is visible on **every protected page** (it is part of the shared workspace shell, not
      the inbox page) (§13 decision 1).
- [ ] The count is fetched once when the shell mounts and re-fetched after the member marks a
      notification read or marks all read; it is **not** polled (§13 decision 2).
- [ ] A count that cannot be fetched or a failed request **never** blocks or breaks the page: the
      badge simply does not render (a logged no-op) (§7, §12).
- [ ] Marking read still returns its existing response and is unaffected by the badge — the producer
      endpoints and their payloads are unchanged.
- [ ] No new table, column, index, migration, channel, producer, or configuration variable is added;
      the count reads the existing `notifications` table via the existing indexes.
- [ ] Unit tests cover the count (unread only, owner-scoped, zero when none); integration tests cover
      the endpoint (`200 { unread }`, owner-scoping, `401` when anonymous); a component test confirms
      the sidebar renders the badge with a count and hides it at zero.

## 4. Scope

**In scope:**

- one read-only repository method, `countUnread(recipientId)`, on the existing
  `NotificationRepository` (memory and PostgreSQL)
- one read-only use case, `countUnreadNotifications(actor)`
- one read endpoint, `GET /api/notifications/unread-count` → `{ "unread": n }`
- a count badge on the `Notifications` sidebar entry (`experience` `AppSidebar`), fed by the shared
  shell (`identity` `ProtectedWorkspaceShell`)
- a refresh signal the inbox's mark-read islands emit so the badge re-reads after a mark-read

**Explicitly out of scope (deferred):**

- **polling or a live push/websocket** — the count is read on load and after a mark-read only; a
  real-time update channel is a follow-up (§13 decision 2)
- **per-type or per-page badges** — one number for the whole inbox; category/thread badges are not
  modelled
- **a "mark as seen" that is distinct from "read"** — the badge counts exactly `read_at IS NULL`
- **notification preferences, muting, or per-type opt-out** — separate follow-ups
- **a pagination-independent total or a list total** — the endpoint returns the unread count only
- **changing the inbox list, its limit, or any producer** — the badge is a purely additive read
- **a badge on the public (unauthenticated) nav** — the public nav has no member context and is
  unchanged
- **animation, sound, or title-bar flashing** — a static count only
- **localization of the badge** — a bare number, which is locale-neutral

Keeping the slice to one count query and one endpoint keeps it on the already-built `notifications`
module and `experience`/`identity` chrome, adds **no** table, and triggers none of the deferred
infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

**No entity change.** The count is derived from columns that already exist:

| Existing column | Role in this slice |
| --- | --- |
| `notifications.recipient_id` | scopes the count to the session member |
| `notifications.read_at` | `read_at IS NULL` = unread |

**One repository method** added to `NotificationRepository`
(`src/modules/notifications/domain/notification-types.ts`):

| Member | Change |
| --- | --- |
| `NotificationRepository` | gains `countUnread(recipientId: string): Promise<number>` — the number of the recipient's notifications with no `readAt` |

No other type, store, schema, or table changes. The count reuses the existing
`notifications_recipient_dedupe_uidx` index prefix for the recipient filter and reads no new column.

## 6. API Contracts

One endpoint is added. No existing endpoint changes its request or response shape.

### 6.1 `GET /api/notifications/unread-count`

The caller's unread count. Requires an authenticated session (any role); owner-scoped, exactly like
`GET /api/notifications` ([api-contracts.md](api-contracts.md) §4.37).

- **Success** `200`:

  ```json
  { "unread": 2 }
  ```

  `unread` is the number of the session member's notifications whose `readAt` is unset (`0` when
  none). It is a plain integer, never negative.

- **Errors:** `AUTH_UNAUTHORIZED` (401) when anonymous, `NOTIFICATION_UNKNOWN` (500) for an
  unexpected failure — the same envelope and codes as the other notifications endpoints
  ([api-contracts.md](api-contracts.md) §6).

There is **no** request body and no query parameter; the page size and list shape of
`GET /api/notifications` are untouched.

### 6.2 Unchanged endpoints

`GET /api/notifications` (list), `POST /api/notifications/[id]/read`, and
`POST /api/notifications/read-all` keep their exact shapes. Marking read changes what the **count**
endpoint subsequently returns, but that is data, not a contract change.

## 7. Authorization Model

- **Owner-only, like every notifications read.** The actor is resolved with the existing
  `app/api/notifications/notification-actor.ts`; the query is scoped to `actor.id`, so a member can
  only ever read their own count. Unknown or another member's data is never addressable — there is no
  id in this endpoint at all.
- **Anonymous callers are rejected before any read** (`AUTH_UNAUTHORIZED`, 401), matching the other
  notifications endpoints.
- **The badge is best-effort chrome.** A failed or unavailable count is logged and swallowed by the
  shell; the page renders normally without a badge. A badge failure can never fail a page, a
  navigation, or a mark-read.
- **No new write path.** The slice only reads; it adds no mutation and cannot change `read_at`.
- **No content leakage.** The count is an integer derived from the caller's own rows; it carries no
  title, body, link, type, or actor.
- **Composition root.** The endpoint lives in `app/**` and calls the `notifications` module's public
  use case; the shell fetches the app's own endpoint over HTTP, exactly as it already calls the
  session endpoint — no module imports another module's internals (§8).

## 8. Module Placement and Dependencies

```
src/modules/notifications/
  domain/        notification-types.ts                 (change: + NotificationRepository.countUnread)
  application/   notification-service.ts               (change: + countUnreadNotifications)
  infrastructure/notification-store.ts                 (change: memory countUnread)
  infrastructure/postgres-notification-repository.ts   (change: PostgreSQL countUnread)
app/
  api/notifications/unread-count/route.ts              (new: GET → { unread })
src/modules/experience/
  ui.tsx                                               (change: AppSidebar renders an optional count badge)
src/modules/identity/
  ui/protected-workspace-shell.tsx                     (change: fetch the count, pass it to AppSidebar)
src/modules/notifications/
  ui/notification-actions.tsx                          (change: signal a refresh after a mark-read)
```

- **No new module, no new edge.** `notifications` keeps its single `platform` edge; the endpoint is
  joined at the composition root. `experience` stays presentational: `AppSidebar` renders a plain
  number and imports nothing new. `identity` already imports `experience`'s sidebar and the identity
  session client; it gains one more app-API fetch, the same pattern as its session call.
- **The shell performs the fetch; the sidebar renders the number.** The count is chrome (the badge is
  part of the shared workspace nav), so the shared `ProtectedWorkspaceShell` owns the fetch and
  passes a plain `unreadCount` to `experience`'s `AppSidebar`, which renders the badge. No module
  imports the notifications module's UI, and no per-area layout is touched (§13 decision 7).
- **The refresh signal is a window event.** The inbox's mark-read islands, after a successful POST,
  emit a `okkhor:inbox-changed` browser event; the shell subscribes and re-fetches. This keeps the
  shell and the islands decoupled (neither imports the other) and needs no polling
  ([notifications-slice.md](notifications-slice.md) §6.2, §6.3 islands are unchanged in behaviour).
- **No middleware change.** `/notifications/:path*` is already a protected matcher and
  `/api/notifications/**` already re-checks the session; `/api/notifications/unread-count` inherits
  both.

## 9. Persistence and Migration

**None.** This slice adds no table, column, index, or migration:

- the count reads the existing `notifications` table (`recipient_id`, `read_at`), which was created
  by `migrations/20261128200000_create_notifications.cjs`;
- the recipient filter reuses the existing `notifications_recipient_dedupe_uidx` index prefix; no new
  index is added — the inbox is a member-scoped, low-cardinality set and a counting scan over one
  member's rows is acceptable at this scale (a partial `(recipient_id) WHERE read_at IS NULL` index is
  a deliberate deferral, noted in §12);
- the in-memory store and the PostgreSQL repository gain one read-only method each and no schema
  change.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media.
- **`ADR-005` (Redis)** — no caching; the count is a direct DB read, deliberately **not** cached this
  slice (a short-TTL cache is a follow-up, §12).
- **`ADR-006` (Qdrant)** — no semantic search; the count is a `read_at IS NULL` scan.
- **`ADR-007` (offline)** — the badge is online-only chrome.
- **`ADR-008`** — no scheduled behaviour; the count is fetched on demand, never on a timer (§13
  decision 2).

Uses only `ADR-004` (PostgreSQL — the already-created `notifications` table) and the already-built
`notifications`, `experience`, and `identity` code.

## 11. Testing Plan (`§7.3`)

- **Unit (service + repository):** `countUnreadNotifications` returns the number of the member's
  unread rows; read rows are excluded; another member's rows are excluded; a member with none gets
  `0`; marking one (and all) read lowers the count.
- **Integration (endpoint):** `GET /api/notifications/unread-count` returns `200 { "unread": n }` for
  a member with unread notifications, `0` after marking all read, exactly the member's own count when
  two members have inboxes, and `401 AUTH_UNAUTHORIZED` when anonymous.
- **Component:** the sidebar renders a badge with the count when `unreadCount > 0` and no badge when
  it is `0`; a guest (no session) renders the shell's unauthenticated state as today.
- **Manual:** run with `NOTIFICATIONS_STORAGE_DRIVER=memory`; create a notification for the member;
  open any protected page and see the badge; open `/notifications`, mark one read and the badge drops;
  mark all read and the badge disappears.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| The count query is run on **every page** and adds DB load | Low | It is a single indexed, member-scoped `COUNT`; it is fetched once per mount and after a mark-read, never polled (§13 decision 2); a short-TTL cache is a deferred follow-up if needed |
| A slow or failing count **blocks the page** | Medium | The fetch is client-side and best-effort: the shell renders the page immediately and never awaits the count to paint; a failure is logged and the badge is simply absent (§7) |
| The badge **leaks another member's** activity | Low | The actor is resolved from the session and the query is scoped to `actor.id`; there is no id parameter (§7) |
| The badge **goes stale after a mark-read** | Medium | The mark-read islands emit `okkhor:inbox-changed` after success and the shell re-fetches, so the badge reflects the member's own action without a reload (§8) |
| The badge **re-fetches too often** | Low | It fetches on mount, on a client-side navigation, and on an explicit inbox-changed event only — no interval (§13 decision 2) |
| A new **partial index** is avoided, so the count scan grows with the inbox | Low | The inbox is member-scoped and bounded by the list limit in practice; a partial `(recipient_id) WHERE read_at IS NULL` index is a deliberate, documented deferral (§9, §4) |
| The badge's **count and the inbox disagree** momentarily | Low | Both read the same table; the badge re-reads after a mark-read, so they converge on the member's next action (§8) |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Placement — the sidebar `Notifications` entry, on every protected page.** The badge is part of
   the shared workspace nav (the `Notifications` item in `AppSidebar`), so it is visible across the
   whole protected app, which is the "unread count on every page" the notifications slice deferred.
   (A page-only count in the inbox header was the alternative; the owner chose the everywhere badge.)
2. **Freshness — on load, and again after a mark-read; no polling.** The count is fetched once when
   the shell mounts, on a client-side navigation, and when the inbox signals a mark-read. There is no
   interval, websocket, or push — a live-updating badge is a follow-up.
3. **Count source — a dedicated read endpoint.** `GET /api/notifications/unread-count` returns
   `{ "unread": n }`, backed by a new `NotificationRepository.countUnread(recipientId)`. This keeps
   the badge a single cheap query independent of the list page size. (Adding a total to
   `GET /api/notifications` was the alternative; the owner chose the dedicated, lightweight endpoint.)
4. **Formatting — the exact count, hidden at zero.** The badge shows the exact number and renders
   nothing when the count is `0`. (A capped "9+" was the alternative; the owner chose the exact
   number, which is simpler and matches the badge's scale.)
5. **Reuse — no new module, table, migration, channel, or configuration.** The slice adds one
   repository method, one read use case, one endpoint, one sidebar badge, and one shell fetch; it
   reuses the shipped `notifications` table and endpoints, the `experience` sidebar, and the
   `identity` shell unchanged otherwise. No new configuration variable is introduced.
6. **Authorization — owner-only and read-only.** The count is the session member's own unread rows;
   anonymous callers get `401`; the slice adds no write path and no id parameter.
7. **Wiring — the shared shell fetches, the sidebar renders, the islands signal.** The count is
   chrome, so `ProtectedWorkspaceShell` performs the app-API fetch and passes a plain `unreadCount`
   to `experience`'s `AppSidebar`; the mark-read islands emit a `okkhor:inbox-changed` window event
   that the shell listens for. No module imports another module's UI or internals, and no per-area
   layout is modified.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the new
`GET /api/notifications/unread-count`, §4.40, and the §6 endpoint range),
[data-models.md](data-models.md) (the read-only count over `notifications`),
[module-boundaries.md](module-boundaries.md) (the shell fetch and the sidebar badge),
[system-overview.md](system-overview.md) (the badge as a read surface), and the [index](README.md)
entry are updated; the notifications slice's §4 deferred "a live unread badge" item (§13 decision 4)
is annotated as **resolved**; and the slice status plus the index entry are flipped to
`Implemented`. No migration is added (§9), and no [configuration.md](../configuration.md) or
[.env.example](../../.env.example) change is required.

## 15. Recommended Implementation Order

On acceptance: `NotificationRepository.countUnread` (domain type + the memory and PostgreSQL
implementations) → the `countUnreadNotifications(actor)` use case → the
`GET /api/notifications/unread-count` route (owner-scoped, `{ "unread": n }`) → the `AppSidebar` badge
(an optional `unreadCount`, hidden at zero) → the shell wiring (fetch the count after the session
loads, pass it to the sidebar, re-fetch on navigation and on the `okkhor:inbox-changed` event) → the
mark-read islands emitting that event after a successful POST → **tests → docs update.**
