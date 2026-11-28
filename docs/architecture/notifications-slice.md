# Notifications Slice

- Status: `Proposed` (thirteenth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [password-reset-delivery-slice.md](password-reset-delivery-slice.md) (the reusable
  `platform` notification port and channels this slice finally reuses beyond password reset),
  [community-moderation-slice.md](community-moderation-slice.md) (the silent hide/restore action this
  slice tells the author about), [member-reporting-slice.md](member-reporting-slice.md) (the report
  triage queue whose outcome this slice reports back to the reporter, and the slice that deferred
  notifications)

## 1. Purpose

The password-reset-delivery slice built a reusable notification port in `platform` — a
`NotificationChannel` with `log`, `sms`, and `email` channels and a driver selector — precisely so
later features could deliver messages without a new abstraction. It then shipped with **only password
reset consuming it**, and recorded the gap as `§13` decision 8: "a general-purpose notification
service for other domains (verification decisions, moderation notices, reply notifications) — the port
is built to be reusable, but only password reset consumes it in this slice."

Two shipped surfaces are the direct consequence:

- **Moderation is silent.** When an administrator hides a member's thread or reply
  (`community-moderation-slice.md`), the author is never told. Their content simply stops appearing,
  with no explanation and no way to know it happened.
- **Reporting is silent.** When an administrator resolves or dismisses a report
  (`member-reporting-slice.md`), the reporter is never told the outcome. The member-reporting slice
  deferred this explicitly (`§4`): "neither the reporter nor the reported member is emailed or
  messaged about a report or its outcome; the platform notification port is not wired here."

This document is the design/architecture note and Definition of Ready for the **thirteenth product
slice — notifications + inbox** — which wires that port into both surfaces and gives members somewhere
to read the results:

- a **persisted notification** record (a member inbox) owned by a **new `notifications` module**;
- **outbound delivery** through the **existing** `platform` channels, reused unchanged;
- two producers, joined at the composition root: an **author notified when their content is hidden**,
  and a **reporter notified when their report is resolved or dismissed**;
- a **member inbox** at `/notifications`, with per-item and mark-all read actions and a nav entry.

It is a **new-module slice**. It adds one module, one table, one identity destination resolver, one
composition-root helper, three notifications endpoints, one page, and two small client islands — and it
reuses `getNotificationChannels()` exactly as shipped rather than adding a channel or a transport.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member whose thread or reply is hidden is told so, and a member who reported content learns the outcome — both in a persisted inbox and, when configured, by SMS/email — so moderation and reporting stop being silent (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the `platform` notification port and channels (already built, reused unchanged); the community moderation/report use cases (already built, the producers); the identity account + optional email and the destination lookup (already built; one small public resolver added); the existing outbound SMS/email gateways (operator-supplied configuration, not code) |
| Risk level understood | **Medium** — the slice is additive, but a notification must never leak moderator/reporter identity or the moderation note, must never fail the moderation action it reports on, and must never expose one member's inbox to another; each is a bounded, testable property (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** An administrator hides a member's reply; the author opens `/notifications` and sees
"Your reply was hidden" with a link back to the thread, and — if the operator has configured SMS or
email — also receives a message about it. Days later the administrator closes a report as resolved;
the reporter opens their inbox and sees the outcome. Nothing tells the author *who* hid their content
or *why* the moderator's note says what it says, and nothing tells the reporter anything about the
moderator. A member only ever sees their own inbox.

Acceptance criteria:

- [ ] Hiding a **visible** thread or reply creates **one** notification for its author and attempts an
      outbound delivery through the configured channels.
- [ ] A **restore**/**unlock** moderation action (a visibility-positive or neutral action) creates **no**
      notification.
- [ ] Resolving **or** dismissing a report creates one notification for the **reporter**, naming the
      outcome (`resolved` | `dismissed`).
- [ ] Notifying is **idempotent per item**: a repeated moderation call, or a re-hide after a restore,
      does **not** create a second notification or a second send (the unique key in §9).
- [ ] A moderation action **never fails** because a notification could not be created or sent — the
      persistence of the moderation fact and the notification are independent, and a delivery failure
      is logged, never thrown (§7).
- [ ] A notification **never** carries the moderator's identity, the reporter's identity, the moderation
      note, or the report's `detail` — only the outcome and a link (§7).
- [ ] No notification is created when the acting administrator **is** the recipient (self-moderation),
      so an admin does not message themselves.
- [ ] An authenticated member can read **their own** inbox newest-first at `/notifications` and
      `GET /api/notifications`; a member can never read, or learn of, another member's notifications.
- [ ] A member can mark one notification read and mark all read; both are idempotent, and marking an
      unknown or foreign id read returns `404`, never a confirmation.
- [ ] The member nav shows a **Notifications** entry with a bell icon; the inbox is a protected route
      (the middleware matcher gains `/notifications/:path*`).
- [ ] The migration creates `notifications` with a working `down`; the in-memory store mirrors the
      table (including the idempotent create and the read-marking).
- [ ] The channel set is selected by the **existing** `NOTIFICATION_CHANNEL_DRIVER`, unchanged; no new
      channel, transport, or channel configuration is added.
- [ ] Unit tests cover the schemas, idempotency, the privacy rule, the self-suppression rule, the
      best-effort delivery (failure swallowed), and the owner-scoped reads; integration tests cover the
      three routes, the two producers, and the migration.

## 4. Scope

**In scope:**

- a `Notification` domain entity and a new `notifications` module (domain → application →
  infrastructure → api → ui)
- a persisted member inbox: `createNotification`, `listNotifications`, `markNotificationRead`,
  `markAllNotificationsRead`
- outbound delivery through the **existing** `getNotificationChannels()` fan-out, best-effort
- two producers wired at the composition root: **hide → author** (thread and reply) and **report
  resolve/dismiss → reporter**
- one new identity public function (`getNotificationDestinationById`) so the composition root can
  resolve a recipient's contact points
- a member inbox page at `/notifications`, one mark-read client island, a nav entry, and a bell icon
- one additive migration creating `notifications`, and the `NOTIFICATIONS_STORAGE_DRIVER` variable

**Explicitly out of scope (deferred):**

- **reply notifications** — telling a thread author that someone replied is named in the
  password-reset slice's deferred list but is **not** wired here; it is a candidate follow-up (it needs
  a producer at the reply write path and a decision about noise)
- **verification-decision notifications** — the `verification` module's approve/reject decision is the
  other producer named in that deferred list; it is deferred to its own slice
- **preferences, muting, or per-type opt-out** — every member receives every notification this slice
  produces; a preference model (and its storage) is a follow-up
- **email digests, batching, or scheduled summaries** — each event sends immediately; batching needs a
  scheduler (`ADR-008`) and is deferred
- **push notifications / web push / native alerts** — the existing SMS/email/log channels only
- **delivery receipts, retries, or a delivery-status table** — each send is fire-and-forget with a
  server-side log, exactly as the password-reset slice delivers
- **retention or expiry** — notifications are kept indefinitely (bounded by the list limit); a
  retention/pruning job is deferred
- **a live unread badge** — the nav shows a link and icon only; an unread count on every page is
  deferred with the badge (§13 decision 4)
- **a member-to-member or admin-broadcast notification** — this slice is system-to-member only
- **localization of the notification copy** — a single English template per type this slice;
  multilingual copy is a follow-up

Keeping the slice to one module, one table, and two producers keeps it on `ADR-004` plus the
already-built `platform` port and triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/notifications/domain/notification-types.ts`:

| Type | Fields |
| --- | --- |
| `NotificationType` | `"content_hidden" \| "report_resolved" \| "report_dismissed"` |
| `Notification` | `{ id; recipientId; type; title; body; href; dedupeKey; readAt?; createdAt }` |
| `CreateNotificationInput` | `{ recipientId; type; title; body; href; dedupeKey; destination?: NotificationDestination }` — `destination` is used for outbound delivery only and is **not** persisted |
| `ListNotificationsOptions` | `{ limit?: number }` |

Repository additions (`NotificationRepository`):

| Method | Contract |
| --- | --- |
| `createNotification(notification)` | Insert unless a notification already exists for `(recipientId, dedupeKey)`; return `{ notification, created }` — the stored row (new or pre-existing) and whether this call created it (idempotent, mirroring the community slice's `createReport`) |
| `listNotifications(recipientId, options)` | The member's notifications, `createdAt` descending then `id` descending, truncated to `limit` |
| `getNotificationById(id)` | A single notification, or `undefined` |
| `markNotificationRead(id, readAt)` | Persist `readAt` for an existing notification id (no-op if already read) |
| `markAllNotificationsRead(recipientId, readAt)` | Persist `readAt` for every unread notification of the recipient; return the count updated |

The in-memory `NotificationStore` holds `notifications: Map<string, Notification>`.

**Identity — one small public addition** (`src/modules/identity/application/auth-service.ts`):

| Function | Contract |
| --- | --- |
| `getNotificationDestinationById(id)` | `(id: string) => Promise<NotificationDestination \| undefined>` — resolves a member's contact points (`{ phoneNumber, email? }`) for delivery, or `undefined` when no such member exists. It returns **only** the two contact points, never the password metadata or roles |

Notes:

- **A notification is a record of an outcome, not a copy of the content.** `Notification` carries a
  title, a body, and an `href`; it never stores the hidden item's text, the moderation note, or the
  report's `detail`. In particular the **moderator's note and identity never leave the moderation
  tables** — the notification body is authored by the producer, not copied from the moderator's input
  (§7).
- **`destination` is delivery-only and transient.** It is passed in by the composition root (which
  resolves it through identity) and is never written to the table, so contact points never enter the
  notifications store ([password-reset-delivery-slice.md](password-reset-delivery-slice.md) §5, §7).
- **`dedupeKey` is the idempotency identity.** It is the item a notification is *about*, not a per-call
  value: `content_hidden:<itemId>` for a hidden thread or reply, and `report_resolved:<reportId>` /
  `report_dismissed:<reportId>` for a closed report. A retried moderation call — or a re-hide after a
  restore — therefore does not notify twice (§9).
- **`recipientId` is a bare id with no foreign key**, exactly as `author_id` and `reporter_id` are
  stored: the module stores member ids as `text` and never joins into identity.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the standard
error envelope). All three notifications endpoints require **only an authenticated session** and are
**owner-scoped** to that session's member. The two producers change the **behaviour** of existing admin
endpoints without changing their request or response shapes.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/notifications` | The caller's inbox, newest first | session |
| `POST` | `/api/notifications/[id]/read` | Mark one of the caller's notifications read | session |
| `POST` | `/api/notifications/read-all` | Mark all the caller's notifications read | session |

### 6.1 `GET /api/notifications`

- **Query:** `limit` (default `20`, clamped to `[1, 50]` — the same clamp as the other lists).
- **Success** `200`: `{ "notifications": [ { "…Notification…" } ] }` — the caller's notifications,
  newest first.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_UNKNOWN` (500).

### 6.2 `POST /api/notifications/[id]/read`

- **Request:** no body.
- **Success** `200`: `{ "notification": { "…Notification…" } }` — the notification with `readAt` set;
  repeated calls return the same read notification (idempotent).
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_NOT_FOUND` (404) — an unknown id **or** a
  notification that belongs to another member, so the path is not an existence oracle,
  `NOTIFICATION_UNKNOWN` (500).

### 6.3 `POST /api/notifications/read-all`

- **Request:** no body.
- **Success** `200`: `{ "updated": 3 }` — the number of notifications marked read.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_UNKNOWN` (500).

### 6.4 Changed endpoints (behaviour only; shapes unchanged)

- `POST /api/community/moderation/threads/[id]` and
  `POST /api/community/moderation/replies/[id]`
  ([api-contracts.md](api-contracts.md) §4.31–§4.32) — on a `hide` action the route additionally
  notifies the hidden item's author. The response is **unchanged**; the notification is created after
  the moderation write succeeds and can never fail the request (§7).
- `POST /api/community/moderation/reports/[id]` ([api-contracts.md](api-contracts.md) §4.36) — on a
  `resolve`/`dismiss` action the route additionally notifies the report's reporter. The response is
  **unchanged**.

### 6.5 Error codes

New code, whose executable source of truth is
`src/modules/notifications/domain/notification-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `NOTIFICATION_NOT_FOUND` | 404 | The notification id is unknown **or** belongs to another member — the same response in both cases |

`AUTH_UNAUTHORIZED` and `NOTIFICATION_UNKNOWN` are the module's reused envelope codes;
`COMMUNITY_*` codes are unchanged on the producer routes.

## 7. Authorization Model

- **The inbox is owner-only.** Every notifications read and write is scoped to the authenticated
  session's member (`resolveNotificationActor`), and the service filters and updates only by that
  member's id. A notification id belonging to another member is reported as `NOTIFICATION_NOT_FOUND`
  (`404`) — never `403` — so the endpoint set cannot be used to enumerate other members' notifications
  (§6, §12).
- **A notification carries no moderation or reporting secrets.** The body is written by the producer
  and contains only the outcome and a link; it never includes `moderatedBy`, the moderation `note`,
  `reporterId`, or the report's `detail`. The moderator's note and identity stay in the moderation
  tables, exactly as `reporterId` is moderator-only today ([member-reporting-slice.md](member-reporting-slice.md)
  §7).
- **The producers inherit their existing gates.** The notify step runs *after* the already-authorized
  `moderateThread`/`moderateReply`/`resolveReport` use cases (each asserts `canModerate`); a caller who
  cannot moderate never reaches the notify step, so notifications expose no new write path.
- **A notification never fails its producer.** The notify step is best-effort: the moderation write is
  already committed before it runs, and a failure to persist or send a notification is logged and
  swallowed. Reversing this — letting a notification failure fail a moderation action — is explicitly
  forbidden (§3, §12).
- **Self-moderation is silent.** When the acting member is the recipient, no notification is created or
  sent, so an administrator hiding their own thread does not message themselves.
- **Delivery is server-side only.** The channels and gateway credentials are server-only; the inbox
  island learns only the member's own notifications, never a channel or a credential.
- **Composition root.** The producer routes resolve the actor with the existing
  `app/api/community/community-actor.ts` and call the new composition-root helper
  (`app/api/community/notify-moderation.ts`); the inbox routes resolve the actor with a new
  `app/api/notifications/notification-actor.ts`, mirroring `app/api/library/library-actor.ts`. The
  `notifications` module imports identity **types only** (none, in fact) and never a repository.

## 8. Module Placement and Dependencies

```
src/modules/notifications/
  domain/         notification-types.ts        (new: NotificationType/Notification/Create/List types,
                                                NotificationRepository, NotificationStore)
                  notification-errors.ts        (new: NOTIFICATION_* codes + NotificationError)
                  notification-schemas.ts       (new: listNotificationsSchema — limit parsing)
  application/    notification-service.ts      (new: createNotification + delivery, listNotifications,
                                                markNotificationRead, markAllNotificationsRead)
  infrastructure/ notification-repository.ts   (new: driver selector)
                  notification-store.ts          (new: in-memory repository)
                  postgres-notification-repository.ts (new: SQL repository)
  api/            notification-http.ts         (new: response + error shaping)
  ui/             notification-list.tsx        (new: server-safe presentational list)
                  notification-actions.tsx      (new: "use client" mark-read island)
src/modules/identity/
  application/    auth-service.ts              (change: + getNotificationDestinationById)
src/modules/experience/
  site-content.ts                              (change: + the Notifications nav entry)
  ui.tsx                                       (change: + the "bell" icon)
app/
  api/notifications/notification-actor.ts      (new: composition-root actor helper)
  api/notifications/route.ts                   (new: GET — the inbox)
  api/notifications/[id]/read/route.ts         (new: POST — mark one read)
  api/notifications/read-all/route.ts          (new: POST — mark all read)
  api/community/notify-moderation.ts           (new: composition-root helper — the producer wiring)
  api/community/moderation/threads/[id]/route.ts   (change: notify the author on hide)
  api/community/moderation/replies/[id]/route.ts   (change: notify the author on hide)
  api/community/moderation/reports/[id]/route.ts   (change: notify the reporter on resolve/dismiss)
  notifications-session.ts                     (new: composition-root viewer, mirrors library-session.ts)
  notifications/page.tsx                       (new: the member inbox)
middleware.ts                                  (change: + "/notifications/:path*")
migrations/20261128200000_create_notifications.cjs   (new: the notifications table)
```

- **One new module, one new cross-module edge.** `notifications` owns a member-facing product concern
  (an inbox), so it is a module of its own rather than a widening of `platform` — `platform` stays the
  domain-free leaf for cross-cutting infrastructure ([module-boundaries.md](module-boundaries.md) §5.2).
  Its only dependency is `platform` (the shared Postgres pool config **and** the notification
  channels — the same single edge `identity` already has), so it adds no module-to-module behaviour
  edge.
- **The producers join at the composition root, not in a module.** Exactly as
  `summarize-on-publish.ts` joins `content` and `summarization` and `app/community-session.ts` resolves
  the acting member, the new `app/api/community/notify-moderation.ts` owns the ordering "after a hide
  or a report closure, resolve the recipient and create the notification". `community` never imports
  `notifications`, and `notifications` never imports `community`; the two are joined only in `app/**`
  ([module-boundaries.md](module-boundaries.md) §6 rule 4).
- **The recipient's contact points are resolved in the composition root.** Because `notifications`
  may not reach into `identity`'s behaviour, the helper calls identity's new
  `getNotificationDestinationById` and passes the resolved `NotificationDestination` into
  `createNotification` as plain data — the same "resolve in `app/**`, pass plain data in" pattern the
  community actor uses. The `notifications` module therefore imports no domain module at all.
- **The channel fan-out is reused unchanged.** `createNotification` delivers through
  `getNotificationChannels()`, the documented `platform` entry point `identity` already imports; no new
  channel, transport, or driver variable is added for delivery.
- **Two client islands, one nav change.** `notification-actions.tsx` is a small `"use client"` leaf
  (`useState` + one POST each for the per-item and mark-all actions) joining the client inventory
  ([server-vs-client-components.md](server-vs-client-components.md) §5); `notification-list.tsx` and
  the `/notifications` page stay server components. The nav gains one entry and the shared `Icon` gains
  one `"bell"` case.

## 9. Persistence and Migration

New migration `migrations/20261128200000_create_notifications.cjs` (kebab-case config,
`single-transaction: true`, with a working `down` that drops the table).

### 9.1 `notifications` — new table

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `recipient_id` | `text` | not null |
| `type` | `text` | not null (`content_hidden` \| `report_resolved` \| `report_dismissed`) |
| `title` | `text` | not null |
| `body` | `text` | not null |
| `href` | `text` | not null |
| `dedupe_key` | `text` | not null |
| `read_at` | `text` | nullable |
| `created_at` | `text` | not null |

**Indexes:**

- `notifications_recipient_dedupe_uidx` — **unique** on `(recipient_id, dedupe_key)`; this is the
  idempotency guarantee (§5, §7) and the reason a repeated moderation action is a no-op.
- `notifications_recipient_created_at_idx` — on `(recipient_id, created_at desc, id desc)`; the inbox
  reads `where recipient_id = $1 order by created_at desc, id desc limit $2`.

- Every column is **new** (a brand-new table), so the migration rewrites no existing row and adds no
  locks beyond the `create table`.
- `recipient_id` stores a bare member id as `text` with **no cross-table foreign key**, matching
  `author_id`/`reporter_id`.

**Queries:**

- **Idempotent insert:** `insert … on conflict (recipient_id, dedupe_key) do nothing returning *`, then
  select the row for `(recipient_id, dedupe_key)` when the insert returned none — so the caller always
  gets the stored notification and learns whether it was newly created.
- **Inbox:** `select … from notifications where recipient_id = $1 order by created_at desc, id desc
  limit $2`.
- **Mark one:** `update notifications set read_at = $1 where id = $2 and read_at is null`.
- **Mark all:** `update notifications set read_at = $1 where recipient_id = $2 and read_at is null`.

The in-memory path mirrors all four: `notifications: Map<string, Notification>` keyed by id, an
idempotent `createNotification` that scans for `(recipientId, dedupeKey)` before inserting, and
`listNotifications`/`markNotificationRead`/`markAllNotificationsRead`.

### 9.2 Delivery semantics

`createNotification` **persists first** (so the inbox always has the outcome) and then delivers
**best-effort** through the resolved channels — and only when the row was newly created, so a retried
moderation call neither re-notifies nor re-sends:

- the message is built from the notification's `title`/`body` and the passed-in `destination`; the
  **email channel skips silently** when `destination.email` is absent, and the **SMS channel** sends to
  `destination.phoneNumber`;
- each channel send is wrapped independently, so a failure in one is logged and does not stop the other;
- when no channel is configured (production with no gateway), the send is logged and swallowed — it
  never throws and never changes the producer's response (§7);
- when no `destination` could be resolved (an unknown recipient), delivery is skipped and the inbox row
  still stands.

### 9.3 Configuration

| Variable | Meaning | Default |
| --- | --- | --- |
| `NOTIFICATIONS_STORAGE_DRIVER` | `auto \| memory \| postgres` — selects the `notifications` module's repository, exactly like the other modules' storage drivers | `auto` |

- **No channel configuration is added.** Delivery reuses `NOTIFICATION_CHANNEL_DRIVER` and the
  `NOTIFICATION_*` gateway variables unchanged; `docs/configuration.md` gains only the storage
  variable, and `.env.example` gains the same.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; a notification is text.
- **`ADR-005` (Redis)** — no new caching or rate limiting; the inbox is durable PostgreSQL (and an
  in-memory map in tests), and delivery uses the existing channels, so nothing new is ephemeral.
- **`ADR-006` (Qdrant)** — no semantic search; the inbox is a recency scan.
- **`ADR-007` (offline)** — the inbox and the producers are online-only.
- **`ADR-008`** — no calendar or scheduled behaviour; every notification is sent immediately (digests
  are deferred, §4).

Uses only `ADR-004` (PostgreSQL — one new table) and the already-built `platform` notification port and
`community`/`identity` modules.

## 11. Testing Plan (`§7.3`)

- **Unit (schemas):** `listNotificationsSchema` clamps `limit`; a missing body on the read endpoints is
  accepted.
- **Unit (service):** `createNotification` stores a row and delivers for a `content_hidden` and a
  `report_*` input; a second call with the same `(recipientId, dedupeKey)` returns the **same**
  notification, reports `created: false`, and sends **nothing**; a channel rejection is swallowed so
  `createNotification` still resolves with the stored row; no delivery is attempted without a
  `destination`; `listNotifications` returns only the given recipient's rows, newest first;
  `markNotificationRead`/`markAllNotificationsRead` set `readAt` and are idempotent; a foreign
  notification id raises `NOTIFICATION_NOT_FOUND`.
- **Unit (memory store):** the idempotent `createNotification`, the recipient filter + ordering of
  `listNotifications`, and both read-marking methods.
- **Integration (routes):** `401` unauthenticated on all three; the member happy path
  (hide a member's reply as an admin → the author's `GET /api/notifications` shows the
  `content_hidden` item → the reporter's own inbox shows the report outcome after triage → mark one
  read → mark all read → `updated` counts); `404` for another member's notification id; `200` with the
  same item on a duplicate read; the `log`-channel test double records the delivered message
  (`getLastNotificationMessageForTesting`); the migration `up`/`down` against PostgreSQL, including the
  unique key rejecting a duplicate insert.
- **Integration (producers):** a `hide` on a thread and on a reply each create one notification for the
  author; a `restore`/`unlock` creates none; a `resolve` and a `dismiss` each create one for the
  reporter; a repeated hide creates none; a moderation response is unchanged (and still succeeds) when
  the channel send throws.
- **Component:** `/notifications` renders the restricted screen for a guest and the caller's inbox for
  a signed-in member; the actions island marks one read and marks all read; the nav renders the
  Notifications entry with the bell icon; the inbox never renders another member's items.
- **Manual:** run with `NOTIFICATION_CHANNEL_DRIVER=log` and `NOTIFICATIONS_STORAGE_DRIVER=memory`;
  register a member and an admin; as the admin hide the member's reply, then resolve a report the
  member filed; confirm the member's `/notifications` shows both outcomes, the server log shows the
  delivered messages, and the notifications carry no moderator identity or note.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A notification **leaks moderator/reporter identity** or the moderation note | **High** | The body is authored by the producer from the outcome only; `moderatedBy`, the `note`, `reporterId`, and the report's `detail` are never copied into a notification, and a test asserts the stored body omits them (§5, §7) |
| A notification failure **fails the moderation action** it reports on | **High** | The notify step runs after the moderation write commits and is fully best-effort — persistence and send failures are logged and swallowed; a test throws in the channel and asserts the moderation response is unchanged (§7, §11) |
| A retried moderation call **double-notifies** the author | Medium | The unique key on `(recipient_id, dedupe_key)` (§9) makes a repeat a no-op, and delivery happens only on the first insert (§9.2) |
| One member reads **another member's inbox** | **High** | Every read and write is scoped to the session's member id; a foreign notification id returns `404`, not `403`, so ids cannot be enumerated (§7); a test asserts cross-member access fails |
| An `href` points a member at **hidden** content and 404s | Medium | The producer picks the link: a hidden thread/reply notification links to the thread page (or the discussion index), and a report-outcome notification links to `/community` rather than re-exposing a hidden target (§5, §6.4) |
| A new module adds cross-module coupling or a cycle | Medium | `notifications` depends only on `platform` (the leaf) and imports no domain module; `community` and `notifications` never import each other — the producers are joined solely in `app/**` (§8; [module-boundaries.md](module-boundaries.md) §8) |
| An administrator **messages themselves** by moderating their own content | Low | Self-suppression: no notification when the actor is the recipient (§7) |
| The inbox grows unbounded | Low | Accepted this slice (§4): the list is bounded and newest-first, and a retention/pruning policy is a documented follow-up; the table is append-only otherwise |
| The endpoint set becomes an **existence oracle** for notifications | Low | Unknown and foreign ids return the same `404`, and the list returns only the caller's rows (§7) |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Events — author-on-hide and reporter-on-outcome.** The slice notifies a member when their thread
   or reply is **hidden**, and a reporter when their report is **resolved or dismissed**. Visibility-
   positive actions (restore/unlock) notify no one. Reply notifications and verification-decision
   notifications are deferred (§4).
2. **Delivery — a persisted inbox *and* external channels.** Each notification is stored for the
   in-app inbox **and** delivered through the existing `platform` channels (SMS/email, or `log` in
   dev/test), so the outcome is recorded even when no gateway is configured.
3. **Module home — a new `notifications` module.** A member-facing inbox is a product domain, so it is
   its own module (domain → application → infrastructure → api → ui) rather than an extension of
   `platform` (which stays the domain-free leaf) or of `community` (which keeps notifications
   decoupled from discussion and reusable by future producers). It depends only on `platform`.
4. **Inbox behaviour — mark-read, newest-first, kept indefinitely, a nav bell, no badge.** A member can
   mark one notification read and mark all read; the list is newest-first (limit `20`, clamped to
   `[1, 50]`); notifications are kept with no expiry; the member nav gains a Notifications entry with a
   bell icon; and no live unread badge is added (it would need an unread query on every page). A
   retention policy is deferred (§4).
5. **Idempotency — one notification per item.** A unique key on `(recipient_id, dedupe_key)` and a
   delivery-on-first-insert rule make a repeated moderation call — or a re-hide after a restore — a
   no-op, so a member is never notified twice about the same item (§5, §9).
6. **Delivery reuses the existing channels unchanged.** `createNotification` fans out through
   `getNotificationChannels()` exactly as password reset does; no new channel, transport, or channel
   configuration is added (§8, §9.2).
7. **Contact points are resolved in the composition root.** `notifications` stores only the recipient's
   id and the message text; the composition root resolves the contact points through identity's new
   `getNotificationDestinationById` and passes them as delivery-only data, so the module imports no
   other domain module (§5, §8).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the three
notifications endpoints, the new `NOTIFICATION_NOT_FOUND` code, and the behaviour notes on the two
producer routes), [data-models.md](data-models.md) (the `Notification` types, the `notifications`
table, the repository methods and store, the `NOTIFICATIONS_STORAGE_DRIVER`, and the identity
destination resolver), [module-boundaries.md](module-boundaries.md) (the new module, its single
`platform` edge, and the composition-root producer wiring),
[system-overview.md](system-overview.md) (the module map, the `/notifications` surface, and the
delivery step), [server-vs-client-components.md](server-vs-client-components.md) (the
`notification-actions.tsx` island), [configuration.md](../configuration.md) and
[.env.example](../../.env.example) (the one new storage variable), and the [index](README.md) entry are
updated; the middleware matcher gains `/notifications/:path*`; the member-reporting slice's deferred
"notifications" item and the password-reset slice's §13 decision 8 ("only password reset consumes the
port") are annotated as **partly resolved** by this slice (delivery now also serves moderation and
reporting; reply and verification notifications remain deferred); the migration is added with a working
`down`; and the slice status plus the index entry are flipped to `Implemented`.

## 15. Recommended Implementation Order

On acceptance: migration (create `notifications`) → notifications domain (`Notification` types and the
repository/store interfaces → `NotificationError` and the `NOTIFICATION_*` codes →
`listNotificationsSchema`) → infrastructure (memory store: idempotent `createNotification`,
`listNotifications`, `getNotificationById`, `markNotificationRead`, `markAllNotificationsRead`, then
the driver selector and the PostgreSQL repository in the same order) → application
(`createNotification` persist-then-deliver with the created-only send, best-effort isolation; then
`listNotifications`, `markNotificationRead`, `markAllNotificationsRead`) → identity
`getNotificationDestinationById` → the composition-root helper
(`app/api/community/notify-moderation.ts`, resolved through identity) → wire it into the three producer
routes (thread hide, reply hide, report resolve/dismiss) → the notifications routes
(`/api/notifications`, `/api/notifications/[id]/read`, `/api/notifications/read-all`) with the actor
helper → `/notifications` (viewer, `notification-list.tsx`, `notification-actions.tsx` island) → the
nav entry, the `"bell"` icon, and the middleware matcher → tests → docs update. Follow the order used
by the member-reporting and password-reset-delivery slices
([member-reporting-slice.md](member-reporting-slice.md) §15,
[password-reset-delivery-slice.md](password-reset-delivery-slice.md) §15).
