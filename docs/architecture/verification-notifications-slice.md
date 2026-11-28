# Verification Notifications Slice

- Status: `Proposed` (fifteenth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [notifications-slice.md](notifications-slice.md) (the module, table, endpoints,
  channels, and inbox this slice reuses unchanged — and the slice that deferred verification-decision
  notifications), [reply-notifications-slice.md](reply-notifications-slice.md) (the second producer,
  which established the composition-root helper shape and the "one row per recipient per event"
  idempotency pattern this slice follows), [scholar-verification-slice.md](scholar-verification-slice.md)
  (the approve/reject decision this slice produces from),
  [password-reset-delivery-slice.md](password-reset-delivery-slice.md) (the reusable `platform`
  notification port)

## 1. Purpose

The notifications slice wired the `platform` port into two surfaces and the reply-notifications slice
added a third; both deferred the last producer named in the password-reset slice's deferred list —
**verification-decision notifications** (`notifications-slice.md` §4): "the `verification` module's
approve/reject decision is the other producer named in that deferred list; it is deferred to its own
slice."

Two shipped surfaces are the direct consequence:

- **Approval is silent.** An administrator approves a member's scholar application, the `scholar`
  role is granted, and the applicant is never told. They discover the badge the next time they look.
- **Rejection is silent.** An administrator rejects a member's scholar application, and the applicant
  is never told — even though the rejection is the actionable case: the application is edited in place
  and resubmitted, which they can only do if they know the outcome and why.

This document is the design/architecture note and Definition of Ready for the **fifteenth product
slice — verification-decision notifications** — which wires a producer into the verification decision
path and reuses the shipped notifications machinery end to end:

- two new `NotificationType` values (`"verification_approved"`, `"verification_rejected"`) — no new
  entity, table, or column;
- one **composition-root producer** (`notifyVerificationDecision`) joining `verification` and
  `notifications`;
- delivery through the **existing** `platform` channels, persisted in the **existing** inbox, read at
  the **existing** `/notifications` page.

It is a **producer slice**, not a new-module slice. It adds two enum values, one composition-root
helper, one route change, and no endpoint, page, table, migration, island, or configuration variable.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member who applied for scholar verification is told the outcome — approval or rejection — in the persisted inbox and, when configured, by SMS/email, so a verification decision is no longer silent (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | The `notifications` module, table, endpoints, inbox, channels, and driver selection (already built, reused unchanged); the `verification` decision use case (`decideApplication`, already built, the producer); the identity destination resolver `getNotificationDestinationById` (already built); the existing outbound SMS/email gateways (operator-supplied configuration, not code) |
| Risk level understood | **Low** — the slice is additive and reuses audited machinery; it notifies exactly one member (the applicant) per decision, and the only subtlety is that a rejected application is edited in place and resubmitted, so the idempotency identity must be the **decision**, not the application (§5, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member submits a scholar application. An administrator approves it; the member opens
`/notifications` and sees "Your scholar verification was approved" with a link back to their
verification page, and — if the operator has configured SMS or email — also receives a message about
it. A rejection instead reads "Your scholar verification was rejected". A member is never notified
about their own decision, a notification never contains the review note, the reviewer's identity, or
any application content, and a member only ever sees their own inbox.

Acceptance criteria:

- [ ] Deciding a submitted application creates **one** notification for the applicant — a
      `verification_approved` on approval, a `verification_rejected` on rejection — and attempts an
      outbound delivery through the configured channels.
- [ ] The **reviewer is never notified** about their own decision (self-suppression, as the other
      producers do).
- [ ] Notifying is **idempotent per decision**: the dedupe identity is the application **and the
      decision time** (`verification_<status>:<applicationId>:<reviewedAt>`), so a retried identical
      decision neither re-notifies nor re-sends, while a **later** decision on the same application
      (a rejection, an edit, a resubmission, then a second decision) is a **new** decision and does
      notify again (§5, §9, §13 decision 3).
- [ ] A decision that is **rejected** (unknown application → `404`, non-`submitted` application or a
      stale `updatedAt` → `409`, validation → `400`, not an administrator → `403`) creates **no**
      notification — the producer runs only after the decision commits.
- [ ] A decision **never fails** because a notification could not be created or sent — the decision
      write and the notification are independent, and a delivery failure is logged, never thrown (§7).
- [ ] A notification **never** carries the review note, the reviewer's identity, or any application
      content — only a neutral outcome and a link to the applicant's verification page (§5, §7).
- [ ] The member inbox (`/notifications`, `GET /api/notifications`) renders verification
      notifications with **no component change** — the existing generic card (§13 decision 4).
- [ ] The channel set is selected by the **existing** `NOTIFICATION_CHANNEL_DRIVER` and stored by the
      **existing** `NOTIFICATIONS_STORAGE_DRIVER`, unchanged; no new channel, table, endpoint, page,
      island, or configuration variable is added.
- [ ] Unit tests cover the per-decision idempotency identity and self-suppression; integration tests
      cover the decision route producing a notification for the applicant on both outcomes while the
      response is unchanged, and creating none when the decision is rejected.
- [ ] Component tests confirm the inbox renders a verification notification with its link.

## 4. Scope

**In scope:**

- two new `NotificationType` values, `"verification_approved"` and `"verification_rejected"`, in the
  existing union
- one **composition-root producer** (`notifyVerificationDecision`) that joins `verification` and
  `notifications` without either module importing the other
- the recipient rule: the application's applicant, self-suppressed for the reviewer
- the decision route wiring — the notify step runs after `decideApplication` commits, best-effort
- a re-check that the existing inbox list renders the new types (it is type-agnostic)

**Explicitly out of scope (deferred):**

- **applicant-facing reasons** — the review note stays moderator-only; including it is a separate
  product/privacy decision and is not part of this slice
- **status-change notifications other than approve/reject** — saving a draft or submitting an
  application notifies no one (only a decision does)
- **a decision history or audit inbox** — the inbox records events, not a reviewable log; the
  application keeps its own `reviewedBy`/`reviewedAt`
- **preferences, muting, or per-type opt-out** — the applicant receives every decision notification
  this slice produces; a preference model is a follow-up
- **batching, digests, or scheduled summaries** — each decision sends immediately; batching needs a
  scheduler (`ADR-008`) and is deferred
- **push notifications / web push / native alerts** — the existing SMS/email/log channels only
- **delivery receipts, retries, or a delivery-status table** — each send is fire-and-forget with a
  server-side log, exactly as the shipped producers deliver
- **a live unread badge** — still deferred with the badge (`notifications-slice.md` §13 decision 4)
- **localization of the notification copy** — a single English template this slice

Keeping the slice to two enum values and one producer keeps it on the already-built `notifications`
module and `platform` port, adds **no** table, and triggers none of the deferred infrastructure ADRs
(§10).

## 5. Core Entities and Domain Changes

**Two enum values** in `src/modules/notifications/domain/notification-types.ts`:

| Type | Change |
| --- | --- |
| `NotificationType` | gains `"verification_approved"` and `"verification_rejected"` → `"content_hidden" \| "report_resolved" \| "report_dismissed" \| "reply_posted" \| "verification_approved" \| "verification_rejected"` |

No other type, repository method, store, schema, or table changes. The `notifications.type` column is a
plain `text` with no check constraint (§9), so the new values need **no migration**.

The notification produced for a decision:

| Field | Value |
| --- | --- |
| `recipientId` | `application.applicantId` |
| `type` | `"verification_approved"` or `"verification_rejected"` |
| `title` | `"Your scholar verification was approved"` / `"Your scholar verification was rejected"` |
| `body` | approval: `"An administrator approved your scholar verification. Your profile now shows the Scholar badge."` — rejection: `"An administrator reviewed your scholar verification and did not approve it. You can update and resubmit your application."` |
| `href` | `/scholar-verify` — the applicant's own verification page |
| `dedupeKey` | `verification_approved:<applicationId>:<reviewedAt>` / `verification_rejected:<applicationId>:<reviewedAt>` |
| `destination` | resolved by the composition root via identity, delivery-only, never persisted |

Notes:

- **A verification notification is a record of a decision, not a copy of the application.** Like every
  existing notification, it carries a title, a body, and an `href`; it never stores the `reviewNote`,
  the reviewer's identity, the application's degrees/affiliations, or the applicant's own answers. The
  body is authored by the producer (§7).
- **`dedupeKey` is the decision, not the application.** A member holds one application, and a rejected
  application is edited in place and resubmitted, so the same application id is decided more than
  once. Keying on `verification_<status>:<applicationId>:<reviewedAt>` makes each **decision** its own
  idempotency identity: a retried identical call is a no-op, and a fresh decision on the same
  application notifies again (`§13` decision 3). `reviewedAt` is stamped by `decideApplication` on
  every decision and is returned on the response.
- **No new field, no new table.** The producer reuses `CreateNotificationInput`, `createNotification`,
  the `notifications` table, and the delivery fan-out exactly as shipped.

## 6. API Contracts

No endpoint is added. One existing endpoint changes **behaviour only** (its request and response shapes
are unchanged).

### 6.1 Changed endpoint (behaviour only; shape unchanged)

- `PATCH /api/verification/applications/[id]` ([api-contracts.md](api-contracts.md) §4.18) — on a
  successful `200`, the route additionally creates a `verification_approved` or
  `verification_rejected` notification for the applicant. The response
  (`{ "application": { … } }`, `200`) is **unchanged**, and the notify step can never fail the
  response (§7).

**Recipient derivation** (in the composition-root producer, after the decision commits):

1. The decision response carries the full application, including its `applicantId`, `status`, and
   `reviewedAt`; the producer needs no extra read.
2. `recipient = application.applicantId`.
3. Remove the **reviewer** (`actorId`) — self-suppression (the shared `notify` guard also suppresses a
   self-match).
4. Create one notification for the remaining recipient.

### 6.2 Error codes

None added. The decision route keeps `AUTH_UNAUTHORIZED` (401), `VERIFICATION_FORBIDDEN` (403),
`VERIFICATION_VALIDATION_FAILED` (400), `VERIFICATION_APPLICATION_NOT_FOUND` (404),
`VERIFICATION_CONFLICT` (409), and `VERIFICATION_UNKNOWN` (500); the notification path introduces no
new code because it is best-effort and swallows its own failures (§7).

## 7. Authorization Model

- **The decision keeps its existing gate.** The producer runs *after* the already-authorized
  `decideApplication` (an administrator deciding a `submitted` application); a rejected decision never
  reaches the notify step, so verification notifications expose no new write path.
- **A notification never fails its producer.** The decision is committed before the notify step runs
  (and before the approval role grant), and the step is fully best-effort: a failure to persist or to
  send is logged and swallowed. Reversing this — letting a notification failure fail a decision — is
  forbidden (§3, §12).
- **The reviewer is silent.** A member is never notified about their own decision: the recipient is the
  applicant, and the shared `notify` guard (`actorId === recipientId`) suppresses any accidental
  self-match (an administrator deciding their own application).
- **A notification carries no review note and no reviewer identity.** The body is authored by the
  producer from the outcome only; the `reviewNote`, the reviewer's id, and the application's contents
  are never copied in. The link points at the applicant's own verification page.
- **The inbox stays owner-only and unchanged.** Every notifications read/write remains scoped to the
  session's member id; this slice adds no notifications endpoint and cannot widen that scope.
- **Delivery is server-side only.** Channels and gateway credentials remain server-only.
- **Composition root.** The decision route resolves the actor with the existing
  `app/api/verification/verification-actor.ts` and calls the composition-root producer;
  `verification` and `notifications` never import each other (they are joined only in `app/**`).

## 8. Module Placement and Dependencies

```
src/modules/notifications/
  domain/    notification-types.ts                 (change: + "verification_approved", + "verification_rejected")
app/
  api/verification/notify-producers.ts             (new: composition-root helper — notifyVerificationDecision)
  api/verification/applications/[id]/route.ts      (change: call notifyVerificationDecision after the decision)
```

- **No new module, no new edge.** `notifications` keeps its single `platform` edge; `verification`
  keeps its existing edges plus the same identity read the other producers use. The producer is joined
  solely at the composition root, exactly as the shipped moderation and reply producers are
  ([module-boundaries.md](module-boundaries.md) §6 rule 4).
- **A second composition-root helper, mirroring the community one.** `app/api/verification/`
  gains a `notify-producers.ts` with the same shape as `app/api/community/notify-producers.ts`
  (`reply-notifications-slice.md` §8): a `verification` **type** in, identity and notifications public
  functions out, every failure logged and swallowed, a shared `notify` guard suppressing
  self-notification. It does **not** need to read the application — the decision response already
  carries the applicant id and the decision time.
- **No client island, no nav change, no middleware change.** The inbox list (`notification-list.tsx`)
  is type-agnostic and renders the new notifications unchanged; `/notifications` and its routes are
  untouched. `/scholar-verify` is already a protected matcher and is only the notification's `href`.
- **The destination resolver is reused.** The helper calls identity's existing
  `getNotificationDestinationById` and passes the resolved `NotificationDestination` as delivery-only
  data, exactly as the shipped producers do.

## 9. Persistence and Migration

**None.** This slice adds no table, column, index, or migration:

- the `notifications.type` column is a plain `text` with **no check constraint**
  (`migrations/20261128200000_create_notifications.cjs`), so `"verification_approved"` and
  `"verification_rejected"` store without a schema change;
- the idempotency guarantee already exists — the unique index
  `notifications_recipient_dedupe_uidx` on `(recipient_id, dedupe_key)` — and applies to the new types
  unchanged; keying on the decision (§5) keeps it correct across re-decisions;
- the in-memory store and the PostgreSQL repository are type-agnostic and need no change.

Delivery semantics are exactly the shipped ones (`notifications-slice.md` §9.2): persist first, then
deliver best-effort through the resolved channels, and **only when the row was newly created**, so a
retried decision neither re-notifies nor re-sends.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; a notification is text.
- **`ADR-005` (Redis)** — no new caching or rate limiting; the inbox is durable and delivery reuses the
  existing channels.
- **`ADR-006` (Qdrant)** — no semantic search; the inbox remains a recency scan.
- **`ADR-007` (offline)** — decisions and notifications are online-only.
- **`ADR-008`** — no calendar or scheduled behaviour; every decision notifies immediately (batching is
  deferred, §4).

Uses only `ADR-004` (PostgreSQL — the already-created `notifications` table) and the already-built
`notifications`, `verification`, `identity`, and `platform` code.

## 11. Testing Plan (`§7.3`)

- **Unit (service, reused):** `createNotification` with `type: "verification_approved"` and
  `dedupeKey: verification_approved:<applicationId>:<reviewedAt>` stores a row and delivers; a second
  call with the same `(recipientId, dedupeKey)` returns the same row, reports `created: false`, and
  sends nothing; a **different** `reviewedAt` for the same application produces a **new** row (a
  re-decision notifies again); a channel rejection is swallowed.
- **Integration (route):** `PATCH /api/verification/applications/[id]` returns the **unchanged** `200`
  body and creates an `verification_approved` notification for the applicant on approval and a
  `verification_rejected` one on rejection; a rejected decision (unknown/non-submitted application)
  creates none; the applicant's inbox stays empty when the reviewer is the applicant; the `log`-channel
  double records a delivered message (`getLastNotificationMessageForTesting`).
- **Integration (producer failure):** the decision response is still `200` and unchanged when the
  channel `send` rejects.
- **Component:** the `/notifications` inbox renders a `verification_approved` notification with its
  link and no component change; a guest is redirected as today.
- **Manual:** run with `NOTIFICATION_CHANNEL_DRIVER=log` and `NOTIFICATIONS_STORAGE_DRIVER=memory`;
  a member submits a scholar application; an administrator rejects it and the applicant's inbox shows
  the rejection; the applicant edits and resubmits; the administrator approves it and the inbox shows
  the approval too (two notifications, one per decision); no body contains the review note or a name.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A re-decision on the **same application** is **silently dropped** by a per-application dedupe key | Medium | The dedupe identity is the **decision** — `verification_<status>:<applicationId>:<reviewedAt>` — so a resubmission's later decision notifies again while a retried identical call stays a no-op (§5, §9, §13 decision 3) |
| A notification **leaks the review note or the reviewer's identity** | Medium | The body is authored by the producer from the outcome only; the `reviewNote` and reviewer id are never copied in; the link points at the applicant's own page (§5, §7); a test asserts the stored body omits them |
| A notification failure **fails the decision** | **High** | The notify step runs after the decision (and the approval grant) commits and is fully best-effort — persist and send failures are logged and swallowed; a test throws in the channel and asserts the decision response is unchanged (§7, §11) |
| The applicant is **not the reviewer's own** but the guard misfires | Low | The recipient is the applicant; the shared `notify` guard suppresses only a genuine self-match (an administrator deciding their own application) (§7) |
| The copy for **approval and rejection** diverges from the decision | Low | Each `status` maps to one template in the producer; the type and the message are chosen together from the same value (§5) |
| The new enum values drift from the database comment | Low | The `type` column has no check constraint, so a value change is code-only (§9); data-models.md records the new values |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Recipients — the applicant, on both outcomes.** A decision notifies the application's applicant
   on **both** approval and rejection (two types: `verification_approved`, `verification_rejected`),
   excluding the reviewer. (A rejection-only rule was the alternative; the owner chose to notify both,
   mirroring the moderation/report producers.)
2. **Message — a neutral outcome and a link.** The notification states the outcome and links to
   `/scholar-verify`; it never includes the review note, the reviewer's identity, or the application's
   content, matching the existing types, which never copy member or moderator content.
3. **Idempotency — one notification per decision.** The dedupe identity is the application **plus the
   decision time** (`verification_<status>:<applicationId>:<reviewedAt>`), because a rejected
   application is edited in place and resubmitted. A retried identical decision is a no-op; a later
   decision on the same application notifies again. (A per-application key was the alternative; the
   owner chose per-decision so a resubmission is not silently dropped.)
4. **Presentation — the generic inbox card.** Verification notifications use the existing inbox card
   with no per-type label, icon, or component change; a type-aware presentation is a follow-up.
5. **Reuse — no new module, table, migration, endpoint, page, island, or configuration.** The slice
   adds two `NotificationType` values and one composition-root producer and reuses the shipped
   notifications module, `notifications` table, `/notifications` inbox, endpoints, channels, and driver
   selection unchanged.
6. **Delivery — the inbox *and* the existing channels, best-effort.** Each notification is stored for
   the inbox and delivered through the existing `platform` channels (SMS/email, or `log` in dev/test),
   only on the first insert, with every failure logged and swallowed.
7. **Producer wiring — a composition-root helper, mirroring the community one.**
   `app/api/verification/notify-producers.ts` exposes `notifyVerificationDecision`, joined at the
   composition root like `app/api/community/notify-producers.ts`; `verification` and `notifications`
   never import each other.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (§4.18's decision-side
behaviour note), [data-models.md](data-models.md) (the two new `NotificationType` values),
[module-boundaries.md](module-boundaries.md) (the verification producer wiring),
[system-overview.md](system-overview.md) (the decision delivery step in the request lifecycle), and the
[index](README.md) entry are updated; the notifications slice's §4 deferred "verification-decision
notifications" item is annotated as **resolved**; and the slice status plus the index entry are flipped
to `Implemented`. No migration is added (§9), and no [configuration.md](../configuration.md) or
[.env.example](../../.env.example) change is required.

## 15. Recommended Implementation Order

On acceptance: the two `NotificationType` values (`"verification_approved"`, `"verification_rejected"`)
→ the composition-root producer (`app/api/verification/notify-producers.ts` with
`notifyVerificationDecision`, deriving the recipient from the decision response, with the
self-suppression guard and best-effort isolation; the decision-time dedupe key) → the decision route
wiring (call `notifyVerificationDecision` after `decideApplication` and the approval grant commit, the
response unchanged) → **tests → docs update.**
