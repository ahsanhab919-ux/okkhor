# Journal-Club Sessions Slice

- Status: `Proposed` (seventeenth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (the published
  research item a session is held on), [content-authoring-slice.md](content-authoring-slice.md) (the
  `canAuthor` scholar/admin role gate this slice's hosting rule mirrors),
  [community-slice.md](community-slice.md) (the authenticated actor, list, and client-island pattern
  reused here), [notifications-slice.md](notifications-slice.md),
  [reply-notifications-slice.md](reply-notifications-slice.md), and
  [verification-notifications-slice.md](verification-notifications-slice.md) (the notification port
  and the composition-root producer pattern this slice reuses to confirm an RSVP and to tell
  registrants a session changed or was cancelled)

## 1. Purpose

`Journal Club Asia / Okkhor` is a Bangla-first research product. Its members read published research
items, discuss them in the community, and save them to a library — but there is no way for a group
to **read a paper together at a scheduled time**, which is the product's namesake activity ("Journal
Club"). Today a member can discuss a thread asynchronously, but nothing schedules a shared, live
reading and nothing tells an interested member that a session exists, changed, or was called off.

This document is the design/architecture note and Definition of Ready for the **seventeenth product
slice — journal-club sessions + RSVP**:

- a **persisted session** record owned by a **new `sessions` module**: a host, the published research
  item it is held on, a title, a scheduled time, a duration, and a location/join link;
- an **RSVP** record — a member is either **going** or **not going** — idempotent per member per
  session;
- **host actions**: a scholar or admin **schedules** a session; the host (or an admin) **edits** it or
  **cancels** it;
- **notifications** through the **existing** `notifications` module and `platform` channels, reused
  unchanged: an RSVP **confirmation** to the member, and a **change** / **cancellation** notice to
  every **going** registrant;
- a **sessions list** at `/sessions` and a **session detail** at `/sessions/[id]` with an RSVP island.

It is a **new-module slice**. It adds one module, two tables, six endpoints, two pages, one client
island, three notification types, and one composition-root producer helper — and it reuses the
notification port, the actor helper pattern, and the in-memory/Postgres driver split exactly as
shipped rather than adding a channel, a transport, or a scheduler.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A scholar can schedule a live journal-club session on a published research item; members RSVP **going/not going**; a member who RSVPs is confirmed in their inbox, and every going registrant is told when the host reschedules or cancels — so a scheduled session is discoverable, joined, and never silently changes (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the `content` module's published-item read (already built; the composition root resolves the referenced item); the `identity` module's session/roles and the existing `getNotificationDestinationById` (already built, reused unchanged); the `platform` notification port and channels (already built, reused unchanged); the `notifications` module (already built, reused unchanged); no scheduler (deliberately — §10) |
| Risk level understood | **Medium** — the slice is additive, but a session is a public-to-members surface, only scholars/admins may host, only the host/an admin may change or cancel, an RSVP must be idempotent per member, and no producer may fail the action it reports on; each is a bounded, testable property (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A verified scholar opens a published research item and schedules a journal-club session
for next Thursday at 9pm with a join link; the session appears at `/sessions`. A member opens the
detail page and RSVPs **going**, and their inbox shows "You're registered" with a link back to the
session. A day later the host reschedules it — every going registrant's inbox shows "The session was
rescheduled" — and a week later the host cancels it, and every going registrant sees "The session
was cancelled". A member who never RSVP'd is told nothing. A learner cannot schedule a session, and
no member can edit or cancel someone else's session.

Acceptance criteria:

- [ ] A **scholar or admin** can schedule a session that references a **published** research item;
      a `learner` cannot (`403`), and an unknown or **unpublished** `researchItemId` is rejected
      (`400`).
- [ ] A session stores a title, a scheduled time (ISO-8601), a duration in minutes, and a location
      (a join URL or venue text); scheduling requires a **future** `scheduledAt`.
- [ ] Any authenticated member can read the session list and a session's detail; a member can
      **never** set another member's RSVP or read who else RSVP'd **not going**.
- [ ] A member can set their RSVP to **going** or **not going**; setting the same value twice is
      **idempotent** (one row per `(sessionId, memberId)`), and an RSVP on a **cancelled** session is
      rejected (`400`).
- [ ] RSVPing **going** creates **one** `session_confirmed` notification for that member (and a
      delivery attempt through the configured channels); re-RSVPing going does **not** notify again
      (the `session_confirmed:<sessionId>` dedupe key).
- [ ] Only the **host** or an **admin** can edit or cancel a session (`403` otherwise). Editing a
      field other than `scheduledAt` notifies no one; changing `scheduledAt` creates **one**
      `session_updated` notification for every **going** registrant.
- [ ] Cancelling creates **one** `session_cancelled` notification for every **going** registrant and
      sets `status = cancelled` with a `cancelledAt`; cancelling an already-cancelled session is
      idempotent and notifies no one twice.
- [ ] A producer **never fails** the action it reports on: the session write commits first and every
      notification/delivery failure is logged and swallowed (§7).
- [ ] No notification is created when the host **is** the recipient (a host who also RSVP'd going
      does not message themselves).
- [ ] The list and detail read only from the `sessions` module; the research item's title and the
      host's display name are resolved in the **composition root** and passed in as plain data — the
      module imports no other domain module (§8).
- [ ] The member nav shows a **Sessions** entry; both pages are protected routes (the middleware
      matcher gains `/sessions/:path*`).
- [ ] The migration creates `journal_club_sessions` and `session_rsvps` with working `down`s; the
      in-memory store mirrors both tables (including the idempotent RSVP upsert).
- [ ] Unit tests cover the schemas, the host/an-admin gate, the future-time rule, the idempotent
      RSVP, the cancel/edit rules, the producer's best-effort isolation and self-suppression; the
      integration tests cover the six routes, the three producers, and the two migrations.

## 4. Scope

**In scope:**

- a `JournalClubSession` and a `SessionRsvp` domain entity and a new `sessions` module
  (domain → application → infrastructure → api → ui)
- persisted sessions: `createSession`, `listSessions`, `getSessionById`, `updateSession`,
  `cancelSession`
- persisted RSVPs: `getRsvpBySessionAndMember`, `upsertRsvp` (idempotent), `listRsvpsBySessionId`
- a host rule (`canHostSession` — scholar/admin) and a host-or-admin rule for edit/cancel
- six endpoints: list, detail, schedule, edit, cancel, rsvp (§6)
- a composition-root producer helper that reuses the `notifications` module for the RSVP
  confirmation and the change/cancellation notices
- three new notification types: `session_confirmed`, `session_updated`, `session_cancelled`
- a sessions list page at `/sessions`, a session detail at `/sessions/[id]`, one RSVP client island,
  a nav entry, and a calendar icon
- one additive migration creating `journal_club_sessions` and `session_rsvps`, and the
  `SESSIONS_STORAGE_DRIVER` variable

**Explicitly out of scope (deferred):**

- **timed reminders** — "a reminder one hour before the session" needs a scheduler, which does not
  exist; batching and scheduling are deferred with `ADR-008` (§10). This slice sends a confirmation
  at RSVP time and notices at change/cancel time only.
- **attendance tracking / check-in** — a session is RSVP-only this slice; marking who actually
  attended is a follow-up
- **session recordings, playback, or media** — no audio/video; the streams are text. Recording
  storage would be `ADR-003` (R2) and is deferred
- **live chat, Q&A, or a live room** — the session links out to an external meeting; the platform
  hosts no real-time room
- **editing a session's linked research item** — a session references a published item; changing the
  reference after creation is not supported this slice
- **"maybe" / waitlists / capacity limits** — a two-state RSVP with no cap; a capacity model is a
  follow-up
- **recurring sessions** — each session is one-off; a recurring series needs the calendar model
  (`ADR-008`)
- **calendar export (.ics) or external calendar sync** — deferred
- **who-else-is-going visibility** — the detail read returns a **count**, never the attendee list of
  **not going** members; an attendee list is a follow-up with a privacy decision
- **notification preferences / muting of session notices** — not built (mirrors the notifications
  slice's §4 deferral)
- **localization of the session copy** — a single English template per notification type this slice

Keeping the slice to one module, two tables, and three producers keeps it on `ADR-004` plus the
already-built `platform` port and `notifications` module, and triggers none of the deferred
infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/sessions/domain/session-types.ts`:

| Type | Fields |
| --- | --- |
| `SessionStatus` | `"scheduled" \| "cancelled"` |
| `JournalClubSession` | `{ id; hostId; researchItemId; title; description; scheduledAt; durationMinutes; location; status; createdAt; updatedAt; cancelledAt? }` |
| `RsvpStatus` | `"going" \| "not_going"` |
| `SessionRsvp` | `{ id; sessionId; memberId; status; createdAt; updatedAt }` |
| `SessionSummary` | `JournalClubSession & { goingCount: number }` |
| `SessionDetail` | `JournalClubSession & { goingCount: number; callerRsvp?: RsvpStatus }` |
| `SessionActor` | `{ id: string; roles: UserRole[] }` — resolved in `app/**`, treated as opaque |
| `CreateSessionInput` | `{ researchItemId; title; description?; scheduledAt; durationMinutes?; location }` |
| `UpdateSessionInput` | `{ title?; description?; scheduledAt?; durationMinutes?; location? }` |
| `SetRsvpInput` | `{ status: RsvpStatus }` |
| `ListSessionsOptions` | `{ limit: number }` |

Repository additions (`SessionRepository`):

| Method | Contract |
| --- | --- |
| `createSession(session)` | Insert a new session |
| `updateSession(session)` | Persist the mutable columns (`title`, `description`, `scheduledAt`, `durationMinutes`, `location`, `status`, `cancelledAt`, `updatedAt`) of an existing session |
| `listSessions(options)` | Session **summaries** (each with its `goingCount`), `scheduledAt` ascending then `id` ascending, truncated to `limit` — soonest first, time-independent |
| `getSessionById(id)` | A single session, or `undefined` |
| `getRsvpBySessionAndMember(sessionId, memberId)` | A single RSVP, or `undefined` |
| `upsertRsvp(rsvp)` | Insert or update the RSVP for `(sessionId, memberId)`; **idempotent** — a repeat call sets the same status and there is never more than one row per pair (the unique key in §9). Returns the stored RSVP |
| `listRsvpsBySessionId(sessionId)` | Every RSVP for a session; the service derives the `going` count and the cancellation recipients from it |

The in-memory `SessionStore` holds `sessions: Map<string, JournalClubSession>` and
`rsvps: Map<string, SessionRsvp>`.

New module authorization in `src/modules/sessions/domain/session-authorization.ts`:

| Function | Contract |
| --- | --- |
| `canHostSession(roles)` | `scholar` and `admin` may schedule a session; `learner` may not — mirrors `canAuthor` ([content-authorization.ts](../../src/modules/content/domain/content-authorization.ts)) |

Notes:

- **A session is a scheduled reading, not a copy of the paper.** `JournalClubSession` stores a
  `researchItemId` (a bare id, no foreign key) and its own `title`/`description`; it never copies the
  research item's abstract, summary, or tags. The item's title is resolved in the composition root at
  read time (§8).
- **`researchItemId` is a bare id with no foreign key**, exactly as `author_id` and `reporter_id` are
  stored: the module stores ids as `text` and never joins into `content`.
- **The published-item check happens in the composition root.** The `sessions` module cannot import
  `content`, so the schedule route resolves the item with the content module's public
  `getPublishedItemById` and rejects an unknown or draft item with `SESSION_VALIDATION_FAILED`
  (`400`) before calling `createSession` — the same "resolve in `app/**`, pass plain data in" pattern
  the notification producers use.
- **`SessionRsvp` is idempotent per `(sessionId, memberId)`.** A member has at most one RSVP row per
  session; going → not going → going updates the same row, so a head-count never double-counts a
  member and a re-RSVP never re-notifies (§9).
- **`goingCount` is derived, never stored.** It is the number of `going` RSVPs for the session,
  computed by the repository (a grouped count in Postgres) for the list and by the service for the
  detail, so it can never drift from the RSVP rows.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the standard
error envelope). All six require **an authenticated session**; the write gates are stated per route.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/sessions` | The session list, soonest first | session (any role) |
| `GET` | `/api/sessions/[id]` | One session's detail with its `goingCount` and the caller's RSVP | session (any role) |
| `POST` | `/api/sessions` | Schedule a session | session + `canHostSession` (scholar/admin) |
| `PATCH` | `/api/sessions/[id]` | Edit a session's fields | session + host-or-admin |
| `POST` | `/api/sessions/[id]/cancel` | Cancel a session | session + host-or-admin |
| `POST` | `/api/sessions/[id]/rsvp` | Set the caller's RSVP (going/not going) | session (any role) |

### 6.1 `GET /api/sessions`

- **Query:** `limit` (default `20`, clamped to `[1, 50]` — the same clamp as the other lists).
- **Success** `200`: `{ "sessions": [ { "…SessionSummary…" } ] }` — `scheduledAt` ascending, then
  `id` ascending.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `SESSION_UNKNOWN` (500).

### 6.2 `GET /api/sessions/[id]`

- **Success** `200`: `{ "session": { "…SessionDetail…" } }` — the session, its `goingCount`, and the
  caller's RSVP (`"going" \| "not_going"`, omitted when the caller has not RSVP'd).
- **Errors:** `AUTH_UNAUTHORIZED` (401), `SESSION_NOT_FOUND` (404), `SESSION_UNKNOWN` (500).

### 6.3 `POST /api/sessions`

- **Request:** `{ "researchItemId": "…", "title": "…", "description"?: "…", "scheduledAt": "ISO-8601", "durationMinutes"?: 60, "location": "…" }`.
- **Success** `201`: `{ "session": { "…JournalClubSession…" } }`.
- **Errors:** `SESSION_VALIDATION_FAILED` (400 — a missing/blank field, an unparseable or **past**
  `scheduledAt`, a non-positive `durationMinutes`, or a `researchItemId` that is not a **published**
  item), `AUTH_UNAUTHORIZED` (401), `SESSION_FORBIDDEN` (403 — the caller cannot host),
  `SESSION_UNKNOWN` (500).

### 6.4 `PATCH /api/sessions/[id]`

- **Request:** any of `{ "title"?, "description"?, "scheduledAt"?, "durationMinutes"?, "location"? }`.
- **Success** `200`: `{ "session": { "…JournalClubSession…" } }` — the updated session. When
  `scheduledAt` changed, every going registrant is additionally notified (`session_updated`,
  §6.7/§7); the response is unchanged.
- **Errors:** `SESSION_VALIDATION_FAILED` (400 — an unparseable or past `scheduledAt`, a non-positive
  `durationMinutes`, or an edit to a **cancelled** session), `AUTH_UNAUTHORIZED` (401),
  `SESSION_FORBIDDEN` (403 — the caller is neither the host nor an admin), `SESSION_NOT_FOUND` (404),
  `SESSION_UNKNOWN` (500).

### 6.5 `POST /api/sessions/[id]/cancel`

- **Request:** no body.
- **Success** `200`: `{ "session": { "…JournalClubSession…" } }` — the session with `status:
  "cancelled"` and `cancelledAt` set; a repeated call returns the same session (idempotent) and
  notifies no one a second time.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `SESSION_FORBIDDEN` (403), `SESSION_NOT_FOUND` (404),
  `SESSION_UNKNOWN` (500).

### 6.6 `POST /api/sessions/[id]/rsvp`

- **Request:** `{ "status": "going" | "not_going" }`.
- **Success** `200`: `{ "rsvp": { "…SessionRsvp…" } }` — the caller's RSVP; repeated calls with the
  same `status` return the same row (idempotent). Only a transition **into** `going` sends the
  `session_confirmed` notification, and only once per session (§6.7/§7).
- **Errors:** `SESSION_VALIDATION_FAILED` (400 — an unknown `status`, or an RSVP to a **cancelled**
  session), `AUTH_UNAUTHORIZED` (401), `SESSION_NOT_FOUND` (404), `SESSION_UNKNOWN` (500).

### 6.7 Behaviour notes (shape unchanged)

- **`POST /api/sessions`** never notifies (nobody is registered yet).
- **`PATCH /api/sessions/[id]`** notifies all going registrants **only** when `scheduledAt` changes.
- **`POST /api/sessions/[id]/cancel`** notifies all going registrants.
- **`POST /api/sessions/[id]/rsvp`** notifies the caller when the stored status becomes `going`.
- Every notification is created **after** the session/RSVP write commits and can never fail the
  request (§7).

### 6.8 Error codes

New codes, whose executable source of truth is
`src/modules/sessions/domain/session-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `SESSION_VALIDATION_FAILED` | 400 | A field is invalid: a missing/blank required field, an unparseable or past `scheduledAt`, a non-positive `durationMinutes`, a `researchItemId` that is not a published item, an illegal edit/cancel of a cancelled session, or an unknown `status` |
| `SESSION_FORBIDDEN` | 403 | The caller may not host, or may not edit/cancel a session they do not own |
| `SESSION_NOT_FOUND` | 404 | The session id is unknown |

`AUTH_UNAUTHORIZED` and `SESSION_UNKNOWN` are the module's reused envelope codes;
`NOTIFICATION_*` codes are unchanged on the notification path.

## 7. Authorization Model

- **Reads require a session; the copy is member-facing.** The list and detail are readable by any
  authenticated member. The detail carries a **count**, never the list of going members or any
  not-going member — the endpoint is not an attendance oracle (§12).
- **Only scholars and admins host.** `createSession` asserts `canHostSession`; a `learner` receives
  `SESSION_FORBIDDEN` (`403`). This mirrors the content-authoring gate and keeps "who may run a
  session" a verified-member power.
- **Only the host or an admin changes a session.** `updateSession` and `cancelSession` assert that
  the actor is the session's `hostId` **or** holds `admin`; anyone else receives
  `SESSION_FORBIDDEN` (`403`). The rule is enforced in the service, not only at the route, so it
  holds for every caller.
- **An RSVP is the caller's own.** `setRsvp` writes only the session's `(sessionId, actor.id)` row;
  there is no endpoint that sets another member's RSVP. A not-going member's identity is never
  returned to anyone.
- **A notification never fails its producer.** Each producer runs **after** the session/RSVP write
  commits and is best-effort: a persistence or delivery failure is logged and swallowed. Reversing
  this — letting a notification failure fail a schedule, edit, cancel, or RSVP — is explicitly
  forbidden (§3, §12).
- **Self-suppression.** When the acting member is also the recipient (a host who RSVP'd going, then
  edits or cancels), no notification is created, so a host does not message themselves.
- **Delivery is server-side only.** The producer resolves each recipient's contact points through
  identity's existing `getNotificationDestinationById` and passes them to `createNotification` as
  delivery-only data; the client island learns only its own RSVP, never a channel or a credential.
- **Composition root.** The routes resolve the actor with a new
  `app/api/sessions/session-actor.ts` (mirroring `app/api/community/community-actor.ts`); the pages
  resolve the current user with a new `app/sessions-session.ts` (mirroring
  `app/community-session.ts`). The producer helper lives in `app/api/sessions/session-notify.ts`. The
  `sessions` module imports no other domain module — the research item and member labels are resolved
  in `app/**` and passed in as plain data (§8).

## 8. Module Placement and Dependencies

```
src/modules/sessions/
  domain/         session-types.ts            (new: Session/Rsvp types, SessionRepository, SessionStore)
                  session-errors.ts            (new: SESSION_* codes + SessionError)
                  session-schemas.ts           (new: createSessionSchema, updateSessionSchema,
                                                 setRsvpSchema, listSessionsSchema — limit parsing)
                  session-authorization.ts     (new: canHostSession — scholar/admin)
  application/    session-service.ts          (new: createSession, listSessions, getSessionDetail,
                                                 updateSession, cancelSession, setRsvp,
                                                 listGoingRsvpsBySessionId)
  infrastructure/ session-repository.ts       (new: driver selector)
                  session-store.ts             (new: in-memory repository)
                  postgres-session-repository.ts (new: SQL repository, two tables)
  api/            session-http.ts             (new: response + error shaping)
  ui/             session-list.tsx            (new: server-safe presentational list)
                  session-actions.tsx          (new: "use client" RSVP island)
src/modules/notifications/
  domain/         notification-types.ts       (change: + session_confirmed | session_updated |
                                                 session_cancelled)
src/modules/experience/
  site-content.ts                             (change: + the Sessions nav entry)
  ui.tsx                                      (change: + the "calendar" icon)
app/
  api/sessions/session-actor.ts               (new: composition-root actor helper)
  api/sessions/session-notify.ts              (new: composition-root producer helper)
  api/sessions/route.ts                       (new: GET list, POST schedule)
  api/sessions/[id]/route.ts                  (new: GET detail, PATCH edit)
  api/sessions/[id]/cancel/route.ts           (new: POST)
  api/sessions/[id]/rsvp/route.ts             (new: POST)
  sessions-session.ts                         (new: composition-root viewer, mirrors community-session.ts)
  sessions/page.tsx                           (new: the session list)
  sessions/[id]/page.tsx                      (new: the session detail)
  sessions/[id]/not-found.tsx                 (new: unknown session)
middleware.ts                                  (change: + "/sessions/:path*")
migrations/20261128230000_create_journal_club_sessions.cjs  (new: the two tables)
```

- **One new module, one new edge — and the edge is only `platform`.** `sessions` owns a member-facing
  product concern (a scheduled journal club), so it is a module of its own rather than a widening of
  `content` (which owns the item, not the event) or `community` (which owns asynchronous discussion).
  Its only dependency is `platform` (the shared Postgres pool config — the same single edge `identity`
  and `notifications` already have), so it adds no module-to-module behaviour edge
  ([module-boundaries.md](module-boundaries.md) §5.2).
- **The referenced item and the labels are resolved in the composition root.** Because `sessions` may
  not reach into `content` or `identity`, the schedule route resolves the item with the content
  module's public `getPublishedItemById`, and the detail page resolves the item's title and the host's
  display name with `getPublishedItemById` and identity's `getPublicProfile`/`listProfilesByIds` — all
  plain data passed into the presentational layer. The `sessions` module imports no domain module.
- **The producers join at the composition root, not in a module.** Exactly as
  `app/api/community/notify-producers.ts` joins `community` and `notifications`, the new
  `app/api/sessions/session-notify.ts` owns the ordering "after a schedule/edit/cancel/RSVP write,
  resolve the recipients and create the notifications". `sessions` never imports `notifications`, and
  `notifications` never imports `sessions`; the two are joined only in `app/**`
  ([module-boundaries.md](module-boundaries.md) §6 rule 4).
- **The channel fan-out is reused unchanged.** Each notification is delivered through the existing
  `getNotificationChannels()` via the unchanged `createNotification`; no new channel, transport, or
  driver variable is added for delivery. Only the three new `NotificationType` values are added.
- **Two pages, one island, one nav change.** `session-actions.tsx` is a small `"use client"` leaf
  (`useState` + one POST for the going/not-going toggle) joining the client inventory
  ([server-vs-client-components.md](server-vs-client-components.md) §5); `session-list.tsx`, the
  `/sessions` page, and the `/sessions/[id]` page stay server components. The nav gains one entry and
  the shared `Icon` gains one `"calendar"` case.

## 9. Persistence and Migration

New migration `migrations/20261128230000_create_journal_club_sessions.cjs` (kebab-case config,
`single-transaction: true`, with a working `down` that drops both tables).

### 9.1 `journal_club_sessions` — new table

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `host_id` | `text` | not null |
| `research_item_id` | `text` | not null |
| `title` | `text` | not null |
| `description` | `text` | not null (empty string allowed) |
| `scheduled_at` | `text` | not null (ISO-8601) |
| `duration_minutes` | `integer` | not null |
| `location` | `text` | not null |
| `status` | `text` | not null (`scheduled` \| `cancelled`) |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |
| `cancelled_at` | `text` | nullable |

**Index:** `journal_club_sessions_scheduled_at_idx` — on `(scheduled_at asc, id asc)`; the list reads
`order by scheduled_at asc, id asc limit $1`.

### 9.2 `session_rsvps` — new table

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `session_id` | `text` | not null |
| `member_id` | `text` | not null |
| `status` | `text` | not null (`going` \| `not_going`) |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |

**Indexes:**

- `session_rsvps_session_member_uidx` — **unique** on `(session_id, member_id)`; this is the
  idempotency guarantee (§5, §7) and the reason a repeat RSVP updates one row.
- `session_rsvps_session_status_idx` — on `(session_id, status)`; the going count and the
  cancellation recipient list read `where session_id = $1 and status = 'going'`.

- Every column is **new** (two brand-new tables), so the migration rewrites no existing row and adds
  no locks beyond the two `create table`s.
- `host_id`, `research_item_id`, and `member_id` store bare member/content ids as `text` with **no
  cross-table foreign key**, matching `author_id`/`reporter_id`.

**Queries:**

- **List with counts:** `select s.*, count(r.member_id) filter (where r.status = 'going') as
  going_count from journal_club_sessions s left join session_rsvps r on r.session_id = s.id group by
  s.id order by s.scheduled_at asc, s.id asc limit $1`.
- **Detail:** `select … from journal_club_sessions where id = $1`, plus
  `select count(*) … from session_rsvps where session_id = $1 and status = 'going'` and
  `select … from session_rsvps where session_id = $1 and member_id = $2`.
- **Upsert RSVP:** `insert … on conflict (session_id, member_id) do update set status = excluded.status,
  updated_at = excluded.updated_at returning *`.
- **Going recipients / count:** `select … from session_rsvps where session_id = $1 and status = 'going'`.

The in-memory path mirrors all of it: `sessions: Map<string, JournalClubSession>` keyed by id,
`rsvps: Map<string, SessionRsvp>` keyed by id, an upsert that scans for `(sessionId, memberId)` before
inserting, and a list that computes each `goingCount` from the rsvps map.

### 9.3 Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `SESSIONS_STORAGE_DRIVER` | `auto \| memory \| postgres` — selects the `sessions` module's repository, exactly like the other modules' storage drivers | `auto` |

- **No scheduler configuration and no channel configuration is added.** Notifications reuse
  `NOTIFICATION_CHANNEL_DRIVER` and the `NOTIFICATION_*` gateway variables unchanged;
  `docs/configuration.md` gains only the storage variable, and `.env.example` gains the same.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; a session is text (a title, a description, and a join link). Session
  recordings/playback are deferred (§4).
- **`ADR-005` (Redis)** — no new caching or rate limiting; sessions and RSVPs are durable PostgreSQL
  (and maps in tests), and notifications use the existing channels, so nothing new is ephemeral.
- **`ADR-006` (Qdrant)** — no semantic search; the list is a `scheduledAt` scan.
- **`ADR-007` (offline)** — the list, detail, RSVP, and scheduling are online-only.
- **`ADR-008` (calendar-aware operations)** — **deliberately not triggered.** `ADR-008` is the
  *internal* operational calendar (regional demand events). This slice has **no scheduler and no
  timed job**: it sends a confirmation at RSVP time and notices at change/cancel time only. **Timed
  reminders** ("an hour before the session") are deferred precisely because they need a scheduler,
  which is `ADR-008`'s Step 3 work and is sequenced behind its own ADR (§4). This slice does not
  build that scheduler.
- **`ADR-009`** — not applicable to this slice.

Uses only `ADR-004` (PostgreSQL — two new tables) and the already-built `platform` notification port
and `content`/`identity`/`notifications` modules.

## 11. Testing Plan (`§7.3`)

- **Unit (schemas):** `createSessionSchema` requires a non-blank `title`, `location`, and
  `researchItemId`, a parseable `scheduledAt`, and a positive `durationMinutes`; `updateSessionSchema`
  accepts a partial body; `setRsvpSchema` accepts only `going`/`not_going`;
  `listSessionsSchema` clamps `limit`.
- **Unit (service):** `createSession` rejects a learner (`SESSION_FORBIDDEN`) and a past `scheduledAt`
  (`SESSION_VALIDATION_FAILED`) and stores a valid session; `updateSession`/`cancelSession` reject a
  non-host non-admin (`SESSION_FORBIDDEN`), reject editing a cancelled session, and let the host and
  an admin through; `cancelSession` is idempotent; `setRsvp` is idempotent per `(sessionId, memberId)`
  and rejects RSVPing a cancelled session; `getSessionDetail` returns the `goingCount` and the
  caller's RSVP and never a not-going member's identity.
- **Unit (memory store):** the idempotent RSVP upsert (one row per pair, status updated),
  `listSessions` ordering and `goingCount`, and `listRsvpsBySessionId`.
- **Unit (authorization):** `canHostSession` is true for `scholar` and `admin`, false for `learner`.
- **Integration (routes):** `401` unauthenticated on all six; a scholar schedules a session on a
  published item (`201`) and a draft/unknown item is rejected (`400`); a learner is `403` on
  `POST /api/sessions`; the detail read returns the `goingCount` and the caller's RSVP; a member
  RSVPs going and the count rises, then not going and it falls; another member's edit/cancel is
  `403`; the host edits `scheduledAt` and the going registrants are notified; the host cancels and
  the going registrants are notified; a repeat cancel does not re-notify; the `log`-channel test
  double records the delivered messages (`getLastNotificationMessageForTesting`); the migration
  `up`/`down` against PostgreSQL, including the unique key rejecting a duplicate RSVP.
- **Integration (producers):** an RSVP going creates one `session_confirmed` for the member and a
  second going creates none; a `scheduledAt` edit creates one `session_updated` for each going
  registrant and a repeat to the same time creates none; a cancel creates one `session_cancelled` for
  each going registrant; a host who RSVP'd going is not notified of their own edit/cancel; a session
  response is unchanged (and still succeeds) when the channel send throws.
- **Component:** `/sessions` renders the restricted screen for a guest and the list for a signed-in
  member; `/sessions/[id]` renders the detail with the RSVP island; the island sets going and not
  going; the nav renders the Sessions entry with the calendar icon; the detail never renders a
  not-going member's identity.
- **Manual:** run with `NOTIFICATION_CHANNEL_DRIVER=log` and `SESSIONS_STORAGE_DRIVER=memory`;
  register a learner, a scholar, and an admin; schedule a session as the scholar on a published item;
  RSVP going as the learner; edit the time and cancel as the scholar; confirm the learner's
  `/notifications` shows the confirmation, reschedule, and cancellation, and the server log shows the
  delivered messages.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A session is scheduled by someone who is **not a host** | **High** | `createSession` asserts `canHostSession` in the service, not only the route; a learner receives `403`, and a test asserts it (§7, §11) |
| A member **edits or cancels another member's session** | **High** | `updateSession`/`cancelSession` assert the actor is the host or an admin; anyone else receives `403`, and a test asserts it (§7, §11) |
| A repeat RSVP **double-counts** a member or **re-notifies** | Medium | The unique key on `(session_id, member_id)` (§9) makes a repeat an update of one row, and the confirmation is sent only on a transition **into** `going`, once per `session_confirmed:<sessionId>` (§5, §6.6) |
| A notification failure **fails the schedule/edit/cancel/RSVP** it reports on | **High** | Each producer runs after the write commits and is fully best-effort — persistence and send failures are logged and swallowed; a test throws in the channel and asserts the session response is unchanged (§7, §11) |
| The detail read leaks **who is or isn't attending** | Medium | The read returns a **count** only — never the going-member list and never a not-going member — so the endpoint is not an attendance oracle (§7, §12) |
| A session references an **unknown or unpublished** item | Medium | The schedule route resolves the item in the composition root and rejects a non-published id with `400` before the write (§5, §6.3) |
| An edit **re-notifies on every keystroke** | Low | Only a change to `scheduledAt` notifies; a change to any other field notifies no one, and the dedupe key includes the new time so a repeat to the same time is a no-op (§6.7) |
| A new module adds cross-module coupling or a cycle | Medium | `sessions` depends only on `platform` (the leaf) and imports no domain module; `sessions` and `notifications` never import each other — the producers are joined solely in `app/**` (§8; [module-boundaries.md](module-boundaries.md) §8) |
| A host **messages themselves** by editing or cancelling a session they RSVP'd going | Low | Self-suppression: no notification when the actor is the recipient (§7) |
| The list grows unbounded | Low | Accepted this slice (§4): the list is bounded and soonest-first, and past sessions aging out is a documented follow-up; the table is otherwise append-only |
| A timed reminder is expected but never sent | Low | Explicitly deferred and stated in §4/§10: there is no scheduler, so the slice sends confirmation and change/cancel notices only, and the follow-up is named |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Hosting — scholars and admins.** A **scholar or admin** may schedule a session; a `learner` may
   not. This mirrors content authoring's `canAuthor` gate, keeping "who may run a session" a
   verified-member power (§5, §7).
2. **Attachment — a session is held on one published research item.** Each session **requires** a
   `researchItemId` that resolves to a **published** item; the check is performed in the composition
   root through the content module's `getPublishedItemById`, and an unknown or draft item is rejected
   with `400`. The item's title is resolved at read time, never copied into the session row (§5, §8).
3. **RSVP — two states, going / not going.** A member is either going or not going, one row per
   `(sessionId, memberId)`, idempotent, with no "maybe", no waitlist, and no capacity cap. The
   detail read exposes a **count**, never the attendee list (§4, §5, §7).
4. **Notifications — confirmation + change/cancel notices now; timed reminders deferred.** RSVPing
   going confirms the member (`session_confirmed`); a host edit that changes `scheduledAt` notifies
   every going registrant (`session_updated`); a cancel notifies every going registrant
   (`session_cancelled`). All three reuse the existing `notifications` module, `platform` channels,
   and `getNotificationDestinationById` unchanged. **Timed reminders** ("an hour before") are
   **deferred** because they need a scheduler, which does not exist and is `ADR-008`'s own
   sequenced work — so this slice triggers no calendar or scheduled behaviour (§4, §6.7, §10).
5. **Module home — a new `sessions` module.** A scheduled journal club is a product domain of its
   own, so it is its own module (domain → application → infrastructure → api → ui) rather than a
   widening of `content` (which owns the item) or `community` (which owns asynchronous discussion).
   It depends only on `platform`. The producers that join it to `notifications` live in `app/**`
   (§8).
6. **Write authority — the host or an admin.** Only the session's `hostId` or a member with `admin`
   may edit or cancel; the rule is enforced in the service so it holds for every caller (§7).
7. **Idempotency and delivery — one RSVP row per member, one notice per event.** The unique key on
   `(session_id, member_id)` and the `session_confirmed` / `session_updated:<new scheduledAt>` /
   `session_cancelled` dedupe keys make repeated RSVPs, edits, and cancels no-ops, so a member is
   never counted twice or notified twice about the same event (§5, §9).
8. **Access — sessions are a protected surface.** Both pages sit behind the auth middleware
   (`/sessions/:path*`), consistent with `/community` and `/library`; the nav gains a **Sessions**
   entry with a calendar icon (§6, §8).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the six sessions
endpoints and the new `SESSION_*` codes), [data-models.md](data-models.md) (the `JournalClubSession`
and `SessionRsvp` types, the two tables, the repository methods and store, the `SESSIONS_STORAGE_DRIVER`,
and the three new `NotificationType` values), [module-boundaries.md](module-boundaries.md) (the new
module, its single `platform` edge, and the composition-root producer wiring),
[system-overview.md](system-overview.md) (the module map, the `/sessions` surface, and the producer
step), [server-vs-client-components.md](server-vs-client-components.md) (the `session-actions.tsx`
island), [configuration.md](../configuration.md) and [.env.example](../../.env.example) (the one new
storage variable), and the [index](README.md) entry are updated; the middleware matcher gains
`/sessions/:path*`; the notifications slice's §4 "reply/verification/etc." deferred list and this
slice's own deferred reminders are cross-referenced (the timed reminder is annotated as deferred to a
scheduler, `ADR-008`); the migration is added with a working `down`; and the slice status plus the
index entry are flipped to `Implemented`.

## 15. Recommended Implementation Order

On acceptance: migration (create `journal_club_sessions` and `session_rsvps`) → sessions domain
(`JournalClubSession`/`SessionRsvp` types and the repository/store interfaces → `SessionError` and
the `SESSION_*` codes → `canHostSession` → the four schemas) → infrastructure (memory store:
`createSession`, `updateSession`, `listSessions` with `goingCount`, `getSessionById`,
`getRsvpBySessionAndMember`, the idempotent `upsertRsvp`, `listRsvpsBySessionId`, then the driver
selector and the PostgreSQL repository in the same order) → application (`createSession`, then
`listSessions`, `getSessionDetail`, `updateSession`, `cancelSession`, `setRsvp`,
`listGoingRsvpsBySessionId`) → the three new `NotificationType` values → the composition-root
producer helper (`app/api/sessions/session-notify.ts`, resolving recipients and destinations through
identity) → the sessions routes (`/api/sessions`, `/api/sessions/[id]`, `/api/sessions/[id]/cancel`,
`/api/sessions/[id]/rsvp`) with the actor helper and the producer calls → `/sessions` and
`/sessions/[id]` (viewer, `session-list.tsx`, `session-actions.tsx` island, the item/host resolution
in the composition root) → the nav entry, the `"calendar"` icon, and the middleware matcher → tests
→ docs update. Follow the order used by the community and notifications slices
([community-slice.md](community-slice.md) §15, [notifications-slice.md](notifications-slice.md) §15).
