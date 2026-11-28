# Reply Notifications Slice

- Status: `Implemented` (fourteenth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [notifications-slice.md](notifications-slice.md) (the module, table, endpoints,
  channels, and inbox this slice reuses unchanged — and the slice that deferred reply notifications),
  [community-slice.md](community-slice.md) (the reply write path this slice produces from),
  [password-reset-delivery-slice.md](password-reset-delivery-slice.md) (the reusable `platform`
  notification port)

## 1. Purpose

The notifications slice wired the `platform` port into two surfaces — a hidden item tells its author,
and a closed report tells its reporter — and deliberately deferred **reply notifications**
(`notifications-slice.md` §4): "telling a thread author that someone replied is named in the
password-reset slice's deferred list but is **not** wired here; it is a candidate follow-up (it needs a
producer at the reply write path and a decision about noise)."

Two shipped surfaces are the direct consequence:

- **Starting a thread is silent.** A member writes a thread, and when another member replies they are
  never told. They have to revisit the thread to discover that the conversation continued.
- **Participating is silent.** A member who replied earlier in a discussion is never told that the
  discussion moved on — even though they are the most likely to want to know.

This document is the design/architecture note and Definition of Ready for the **fourteenth product
slice — reply notifications** — which wires a producer into the reply write path and reuses the shipped
notifications machinery end to end:

- one new `NotificationType` value (`"reply_posted"`) — no new entity, table, or column;
- one **composition-root producer** (`notifyNewReply`) joining `community` and `notifications`;
- recipients derived from the thread: its **author** plus the authors of its **prior visible replies**,
  minus the replier;
- delivery through the **existing** `platform` channels, persisted in the **existing** inbox, read at
  the **existing** `/notifications` page.

It is a **producer slice**, not a new-module slice. It adds one enum value, one composition-root
helper, one route change, and no endpoint, page, table, migration, island, or configuration variable.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member who started a thread, and the members who already replied in it, are told when someone posts a new reply — in the persisted inbox and, when configured, by SMS/email — so a running discussion is no longer silent (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | The `notifications` module, table, endpoints, inbox, channels, and driver selection (already built, reused unchanged); the `community` reply use case (`createReply`, already built, the producer); the identity destination resolver `getNotificationDestinationById` (already built); the existing outbound SMS/email gateways (operator-supplied configuration, not code) |
| Risk level understood | **Low–Medium** — the slice is additive and reuses audited machinery, but a reply notification reaches **several** members at once, so the slice must bound noise (one row per recipient per reply, idempotent) and must never disclose the reply text, the replier's identity, or another member's inbox; each is a bounded, testable property (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member starts a thread; two others reply. The thread author opens `/notifications` and
sees "New reply in a discussion you're part of" with a link back to the thread, and — if the operator
has configured SMS or email — also receives a message about it. Each earlier replier sees the same
outcome for later replies. A member is never notified about their own reply, a notification never
contains the reply text or the replier's name, and a member only ever sees their own inbox.

Acceptance criteria:

- [ ] Posting a reply to a **visible, unlocked** thread creates **one** notification for each distinct
      recipient — the **thread author** and the authors of the thread's **prior visible replies** —
      excluding the replier, and attempts an outbound delivery through the configured channels.
- [ ] The recipient set is **de-duplicated**: a member who is both the thread author and a prior
      replier receives exactly one notification per reply.
- [ ] The **replier is never notified** about their own reply (self-suppression, as the moderation
      producers do).
- [ ] Notifying is **idempotent per reply per recipient**: a retried reply call does **not** create a
      second notification or a second send (the unique key on `(recipient_id, dedupe_key)`, §5, §9).
- [ ] A reply that is **rejected** (unknown/hidden thread → `404`, locked thread → `409`) creates **no**
      notification — the producer runs only after the reply write commits.
- [ ] A reply **never fails** because a notification could not be created or sent — the reply write and
      the notification are independent, and a delivery failure is logged, never thrown (§7).
- [ ] A notification **never** carries the reply text, the replier's identity, or any moderation/
      reporting data — only a neutral outcome and a link to the thread (§5, §7).
- [ ] The member inbox (`/notifications`, `GET /api/notifications`) renders reply notifications with
      **no component change** — the existing generic card (§13 decision 4).
- [ ] The channel set is selected by the **existing** `NOTIFICATION_CHANNEL_DRIVER` and stored by the
      **existing** `NOTIFICATIONS_STORAGE_DRIVER`, unchanged; no new channel, table, endpoint, page,
      island, or configuration variable is added.
- [ ] Unit tests cover the recipient-derivation rule (author + prior participants − replier, distinct),
      self-suppression, idempotency, and best-effort delivery; integration tests cover the reply route
      producing notifications for the author and prior participants while the response is unchanged.

## 4. Scope

**In scope:**

- one new `NotificationType` value, `"reply_posted"`, in the existing union
- one **composition-root producer** (`notifyNewReply`) that joins `community` and `notifications`
  without either module importing the other
- the recipient rule: thread author + distinct authors of prior visible replies, minus the replier
- the reply route wiring — the notify step runs after `createReply` commits, best-effort
- the rename of the community composition-root helper file so its name covers both moderation and reply
  producers
- a re-check that the existing inbox list renders the new type (it is type-agnostic)

**Explicitly out of scope (deferred):**

- **a follow/subscribe model** — this slice derives recipients from the thread itself; an explicit
  "watch this thread" / mute toggle (and its storage) is a follow-up
- **verification-decision notifications** — the `verification` module's approve/reject decision remains
  the other producer named in the password-reset deferred list; it is deferred to its own slice
- **preferences, muting, or per-type opt-out** — every derived recipient receives the notification this
  slice produces; a preference model is a follow-up (it is the natural home for reply notifications,
  which are the highest-volume type)
- **batching, digests, or scheduled summaries** — each reply sends immediately; batching needs a
  scheduler (`ADR-008`) and is deferred
- **push notifications / web push / native alerts** — the existing SMS/email/log channels only
- **delivery receipts, retries, or a delivery-status table** — each send is fire-and-forget with a
  server-side log, exactly as the shipped producers deliver
- **a live unread badge** — still deferred with the badge (`notifications-slice.md` §13 decision 4)
- **localization of the notification copy** — a single English template this slice
- **thread-body or reply-body notifications on edit** — only a new reply produces a notification

Keeping the slice to one enum value and one producer keeps it on the already-built `notifications`
module and `platform` port, adds **no** table, and triggers none of the deferred infrastructure ADRs
(§10).

## 5. Core Entities and Domain Changes

**One enum value** in `src/modules/notifications/domain/notification-types.ts`:

| Type | Change |
| --- | --- |
| `NotificationType` | gains `"reply_posted"` → `"content_hidden" \| "report_resolved" \| "report_dismissed" \| "reply_posted"` |

No other type, repository method, store, schema, or table changes. The `notifications.type` column is a
plain `text` with no check constraint (§9), so a new value needs **no migration**.

The notification produced for a reply:

| Field | Value |
| --- | --- |
| `recipientId` | each recipient derived from the thread (§6) |
| `type` | `"reply_posted"` |
| `title` | `"New reply in a discussion you're part of"` |
| `body` | `"Someone replied to a community thread you're part of. Open it to catch up."` |
| `href` | `/community/<threadId>` — the visible thread page |
| `dedupeKey` | `reply_posted:<replyId>` — one notification per reply per recipient |
| `destination` | resolved by the composition root via identity, delivery-only, never persisted |

Notes:

- **A reply notification is a record of an event, not a copy of the reply.** Like every existing
  notification, it carries a title, a body, and an `href`; it never stores the reply's `body`, the
  replier's identity, or the thread's text. The body is authored by the producer (§7).
- **`dedupeKey` is the reply, not the recipient.** The idempotency identity is the pair
  `(recipientId, dedupeKey)`; keying on `reply_posted:<replyId>` means each recipient gets at most one
  row for a given reply, while two different recipients each get their own row.
- **No new field, no new table.** The producer reuses `CreateNotificationInput`, `createNotification`,
  the `notifications` table, and the delivery fan-out exactly as shipped.

## 6. API Contracts

No endpoint is added. One existing endpoint changes **behaviour only** (its request and response shapes
are unchanged).

### 6.1 Changed endpoint (behaviour only; shape unchanged)

- `POST /api/community/threads/[id]/replies` ([api-contracts.md](api-contracts.md) §4.22) — on a
  successful `201`, the route additionally creates a `reply_posted` notification for each recipient.
  The response (`{ "reply": { … } }`, `201`) is **unchanged**, and the notify step can never fail the
  response (§7).

**Recipient derivation** (in the composition-root producer, after the reply commits):

1. Read the thread with its **visible** replies (`getThread(threadId)` — the member read, which already
   hides moderated replies).
2. `recipients = distinct([ thread.authorId, ...replies.map(r => r.authorId) ])`.
3. Remove the **replier** (`actorId`) — self-suppression.
4. Create one notification per remaining recipient.

Because the just-created reply is itself a visible reply, it appears in step 1; its author is the
replier and is removed in step 3, so the arithmetic holds whether or not the storage read is
read-after-write.

### 6.2 Error codes

None added. The reply route keeps `COMMUNITY_THREAD_NOT_FOUND` (404), `COMMUNITY_THREAD_LOCKED` (409),
`COMMUNITY_VALIDATION_FAILED` (400), and `AUTH_UNAUTHORIZED` (401); the notification path introduces no
new code because it is best-effort and swallows its own failures (§7).

## 7. Authorization Model

- **The reply keeps its existing gate.** The producer runs *after* the already-authorized `createReply`
  (an authenticated member writing to a visible, unlocked thread); a rejected reply never reaches the
  notify step, so reply notifications expose no new write path.
- **A notification never fails its producer.** The reply is committed before the notify step runs, and
  the step is fully best-effort: a failure to read the thread, to persist, or to send is logged and
  swallowed. Reversing this — letting a notification failure fail a reply — is forbidden (§3, §12).
- **The replier is silent.** A member is never notified about their own reply: the recipient set
  excludes the replier, and the shared `notify` guard (`actorId === recipientId`) suppresses any
  accidental self-match.
- **A notification carries no reply text and no replier identity.** The body is authored by the
  producer from the event only; the reply's `body`, the replier's id/name, and any moderation note are
  never copied in. The link points at the visible thread.
- **The inbox stays owner-only and unchanged.** Every notifications read/write remains scoped to the
  session's member id; this slice adds no notifications endpoint and cannot widen that scope.
- **Recipients are derived from public thread structure.** The recipient set is the thread author and
  the authors of prior *visible* replies — the same members whose ids the community read already
  exposes as reply authors on the thread page — so the producer leaks nothing a member could not see.
- **Delivery is server-side only.** Channels and gateway credentials remain server-only.
- **Composition root.** The reply route resolves the actor with the existing
  `app/api/community/community-actor.ts` and calls the composition-root producer; `community` and
  `notifications` never import each other (they are joined only in `app/**`).

## 8. Module Placement and Dependencies

```
src/modules/notifications/
  domain/    notification-types.ts            (change: + "reply_posted" in NotificationType)
app/
  api/community/notify-producers.ts           (rename of notify-moderation.ts; + notifyNewReply)
  api/community/threads/[id]/replies/route.ts (change: call notifyNewReply after createReply)
  api/community/moderation/threads/[id]/route.ts  (change: import path only, from the renamed file)
  api/community/moderation/replies/[id]/route.ts  (change: import path only, from the renamed file)
  api/community/moderation/reports/[id]/route.ts  (change: import path only, from the renamed file)
```

- **No new module, no new edge.** `notifications` keeps its single `platform` edge; `community` keeps
  its existing edges. The producer is joined solely at the composition root, exactly as the shipped
  moderation producers are ([module-boundaries.md](module-boundaries.md) §6 rule 4).
- **The composition-root helper is renamed for honesty.** The file that owns "after a community write,
  notify the right members" currently houses three moderation producers; adding a reply producer makes
  the name `notify-moderation.ts` inaccurate, so it is renamed to `notify-producers.ts` and the three
  existing imports are repointed. It keeps the same shape: `community` **types** in, identity and
  notifications public functions out, every failure logged and swallowed.
- **The producer resolves the thread through community's public read.** To derive recipients the
  helper calls community's exported `getThread(threadId)` — the member read, which returns the thread
  and only its **visible** replies. It is the composition root, so importing two modules' public
  surfaces is allowed here; the helper imports community **types** for its parameters and the read for
  the lookup, and neither module imports the other.
- **No client island, no nav change, no middleware change.** The inbox list (`notification-list.tsx`)
  is type-agnostic and renders the new notifications unchanged; `/notifications` and its routes are
  untouched. This slice adds **no** client-boundary or route-protection change.
- **The destination resolver is reused.** The helper calls identity's existing
  `getNotificationDestinationById` and passes the resolved `NotificationDestination` as delivery-only
  data, exactly as the shipped producers do.

## 9. Persistence and Migration

**None.** This slice adds no table, column, index, or migration:

- the `notifications.type` column is a plain `text` with **no check constraint**
  (`migrations/20261128200000_create_notifications.cjs`), so `"reply_posted"` stores without a schema
  change;
- the idempotency guarantee already exists — the unique index
  `notifications_recipient_dedupe_uidx` on `(recipient_id, dedupe_key)` — and applies to the new type
  unchanged;
- the in-memory store and the PostgreSQL repository are type-agnostic and need no change.

Delivery semantics are exactly the shipped ones (`notifications-slice.md` §9.2): persist first, then
deliver best-effort through the resolved channels, and **only when the row was newly created**, so a
retried reply neither re-notifies nor re-sends.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; a notification is text.
- **`ADR-005` (Redis)** — no new caching or rate limiting; the inbox is durable and delivery reuses the
  existing channels.
- **`ADR-006` (Qdrant)** — no semantic search; the inbox remains a recency scan.
- **`ADR-007` (offline)** — replies and notifications are online-only.
- **`ADR-008`** — no calendar or scheduled behaviour; every reply notifies immediately (batching is
  deferred, §4).

Uses only `ADR-004` (PostgreSQL — the already-created `notifications` table) and the already-built
`notifications`, `community`, `identity`, and `platform` code.

## 11. Testing Plan (`§7.3`)

- **Unit (recipients):** for a thread with author A and prior visible replies by B and C, a reply by D
  notifies A, B, and C and **not** D; a reply by A notifies B and C and **not** A; a member who is both
  the author and a prior replier is notified **once**; a hidden prior reply's author is **not** a
  recipient.
- **Unit (service, reused):** `createNotification` with `type: "reply_posted"` and
  `dedupeKey: reply_posted:<id>` stores a row and delivers; a second call with the same
  `(recipientId, dedupeKey)` returns the same row, reports `created: false`, and sends nothing; a
  channel rejection is swallowed.
- **Integration (route):** `POST /api/community/threads/[id]/replies` returns the **unchanged** `201`
  body and creates a notification for the author and each prior participant; the replier's own inbox
  stays empty for their reply; a second identical reply request (distinct reply id) notifies again but
  a retried *same* reply id (via the store's idempotent create) does not; a reply to a **locked** or
  **hidden** thread creates none (the reply is rejected first); the `log`-channel double records a
  delivered message (`getLastNotificationMessageForTesting`).
- **Integration (producer failure):** the reply response is still `201` and unchanged when the channel
  `send` rejects.
- **Component:** the `/notifications` inbox renders a `reply_posted` notification with its link and no
  component change; a guest is redirected as today.
- **Manual:** run with `NOTIFICATION_CHANNEL_DRIVER=log` and `NOTIFICATIONS_STORAGE_DRIVER=memory`;
  register three members; A starts a thread, B replies (A is notified), C replies (A and B are
  notified); confirm each inbox shows the reply outcome, the replier is never notified about their own
  reply, the server log shows the delivered messages, and no body contains the reply text or a name.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Reply notifications are the **highest-volume** type and could feel like spam | Medium | The slice sends exactly **one** row per recipient per reply (unique key, §9) and only on first insert; the recipient set is derived and de-duplicated (§6); batching and opt-out are named follow-ups (§4) |
| A notification **leaks the reply text or the replier's identity** | Medium | The body is authored by the producer from the event only; the reply's `body` and the replier's id/name are never copied in; the link points at the visible thread (§5, §7); a test asserts the stored body omits them |
| A notification failure **fails the reply** | **High** | The notify step runs after the reply commits and is fully best-effort — read, persist, and send failures are logged and swallowed; a test throws in the channel and asserts the reply response is unchanged (§7, §11) |
| A retried reply **double-notifies** recipients | Medium | The unique key on `(recipient_id, dedupe_key)` with `dedupeKey = reply_posted:<replyId>` makes a retried reply a no-op, and delivery happens only on the first insert (§5, §9) |
| The recipient read **loads every reply** of the thread | Low | The producer uses the existing member read `getThread`, which returns the visible thread and its replies; reply counts are small for this community, and the read is already the page read (§8); a cheaper header read is a documented option if the load ever matters |
| A member is **notified about their own reply** | Low | The recipient set excludes the replier and the shared `notify` guard suppresses a self-match (§7) |
| A member is notified about a reply on a thread they no longer see | Low | Recipients are derived from the thread's **visible** replies plus the author, so a member whose only reply was hidden is not re-noticed; the `href` always points at the visible thread (§6) |
| The new enum value drifts from the database comment | Low | The `type` column has no check constraint, so a value change is code-only (§9); data-models.md records the new value |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Recipients — the thread author *and* prior participants.** A new reply notifies the thread's
   author and the authors of the thread's prior **visible** replies, excluding the replier. The set is
   de-duplicated, so a member who is both the author and a prior replier is notified once. (An
   author-only rule was the alternative; the owner chose the author-plus-participants model.)
2. **Message — a neutral outcome and a link.** The notification says someone replied and links to the
   thread; it never includes the reply text or the replier's name, matching the existing types, which
   never copy member content.
3. **Self-reply — suppressed.** A member replying to their own thread (or to a thread they are a
   participant in) is never notified about their own reply, as the moderation producers suppress
   self-notification.
4. **Presentation — the generic inbox card.** Reply notifications use the existing inbox card with no
   per-type label, icon, or component change; a type-aware presentation is a follow-up.
5. **Reuse — no new module, table, migration, endpoint, page, island, or configuration.** The slice
   adds one `NotificationType` value and one composition-root producer and reuses the shipped
   notifications module, `notifications` table, `/notifications` inbox, endpoints, channels, and driver
   selection unchanged.
6. **Delivery — the inbox *and* the existing channels, best-effort.** Each notification is stored for
   the inbox and delivered through the existing `platform` channels (SMS/email, or `log` in dev/test),
   only on the first insert, with every failure logged and swallowed.
7. **Producer wiring — a composition-root helper.** A `notifyNewReply` producer joins `community` and
   `notifications` at the composition root; the helper file is renamed `notify-producers.ts` to cover
   both its moderation and reply producers, and the two modules never import each other.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (§4.22's reply-create
behaviour note), [data-models.md](data-models.md) (the new `NotificationType` value),
[module-boundaries.md](module-boundaries.md) (the reply producer wiring and the helper rename),
[system-overview.md](system-overview.md) (the reply delivery step in the request lifecycle), and the
[index](README.md) entry are updated; the notifications slice's §4 deferred "reply notifications" item
is annotated as **partly resolved** (reply notifications are now produced; verification-decision
notifications remain deferred); and the slice status plus the index entry are flipped to `Implemented`.
No migration is added (§9), and no [configuration.md](../configuration.md) or
[.env.example](../../.env.example) change is required.

## 15. Recommended Implementation Order

On acceptance: the `NotificationType` value (`"reply_posted"`) → the composition-root producer
(rename `notify-moderation.ts` → `notify-producers.ts` and repoint the three moderation imports; add
`notifyNewReply` deriving the recipient set through `getThread`, with the self-suppression guard and
best-effort isolation) → the reply route wiring (call `notifyNewReply` after `createReply` commits, the
response unchanged) → **tests → docs update.**
