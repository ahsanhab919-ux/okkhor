# Member Reporting Slice

- Status: `Implemented` (twelfth product slice; decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [community-moderation-slice.md](community-moderation-slice.md) (the moderation tools and
  admin-queue pattern this extends, and the slice that deferred reporting), [community-slice.md](community-slice.md)
  (the discussion surface being reported), [scholar-verification-slice.md](scholar-verification-slice.md)
  (the admin review-queue pattern)

## 1. Purpose

The moderation slice gave administrators the power to **act** on community content — hide, restore,
lock — but nothing tells them **where to look**. An administrator can only find a rule-breaking
thread or reply by browsing the community, so the moderation tools are reactive and depend on a
moderator noticing the problem themselves. §13 decision 4 of
[community-moderation-slice.md](community-moderation-slice.md) recorded the gap plainly: "Member
reporting is out of scope. No flag/report path ships in this slice; a report queue needs its own
table, member write path, and triage rules, and is deferred as a candidate future slice."

This document is the design/architecture note and Definition of Ready for the **twelfth product
slice — member reporting** — which closes that gap with two halves:

- a **member write path**: any authenticated member can report a visible thread or reply, with a
  reason and an optional detail;
- a **moderator triage queue**: an administrator opens `/admin/community/reports`, sees the open
  reports with the reported content, hides the item using the **existing** moderation use cases,
  and closes each report as resolved or dismissed with an optional note.

It is a **single-module slice**: it extends `community` only. It introduces **no new module, no new
infrastructure, and no new cross-module edge**. It adds one table, one domain entity
(`CommunityReport`), three use cases, two small client islands, and one admin surface — and it reuses
the hide/restore machinery the moderation slice already shipped rather than duplicating it.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member flags rule-breaking content; an administrator sees every open report in one queue, hides the content if warranted, and closes the report — so moderation is driven by members' signals instead of a moderator's browsing (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the community slice's tables, repository, and services (already built); the moderation slice's hide/restore use cases and admin queue (already built, reused); the identity session/roles (already built); no new infrastructure (§10) |
| Risk level understood | **Medium** — it is a small, additive slice, but it adds a member *write* path to content moderation and a new store of member-supplied data, so the idempotency rule, the reporter-privacy rule, and the "reports never auto-hide" rule must each be explicit and tested (§7, §12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member reading a thread or a reply finds something that breaks the rules, picks a
reason, and reports it. An administrator opens `/admin/community/reports` and sees every open report
— the reported item, the reason, and where it sits — newest first. The administrator hides the
content with the same control they already use, then closes the report as resolved (action taken) or
dismissed (no action needed), optionally leaving a note. The reported member is never told who
reported them, and nothing is hidden until a moderator decides to hide it.

Acceptance criteria:

- [ ] An authenticated member can report a **visible** thread or reply with a `reason` and an
      optional `detail`; the report is stored with `status: "open"`.
- [ ] Reporting is **role-free** (learners and scholars alike), exactly like posting.
- [ ] A member's second report for the **same item** is **idempotent**: no new row is created, and
      the existing report is returned unchanged.
- [ ] A report for an **unknown or hidden** target returns the same `404` a member read would, so a
      report never discloses moderated content.
- [ ] An administrator can list the open reports and close each one as `resolved` or `dismissed`,
      recording `resolvedBy`, `resolvedAt`, and an optional `resolutionNote`.
- [ ] The report queue shows the reported **content** and lets the administrator hide/restore it
      through the existing moderation endpoints; closing a report does **not** by itself change the
      content's visibility.
- [ ] A report **never** hides content on its own — content stays visible until a moderator acts
      (§13 decision 3).
- [ ] The **reporter's identity is moderator-only**: it is returned only from the moderation
      endpoints and never from a member-facing read.
- [ ] Non-administrators receive `403 COMMUNITY_FORBIDDEN` from every report-triage use case, and
      `/admin/community/reports` renders a restricted screen rather than the queue.
- [ ] The migration creates `community_reports` with a working `down`; the in-memory store mirrors
      the table.
- [ ] Unit tests cover the schemas, the idempotency rule, the target-visibility rule, the triage
      authorization, and the reporter-privacy rule; integration tests cover the routes and the
      migration.

## 4. Scope

**In scope:**

- a `CommunityReport` domain entity (`reason`, `status`, optional `detail`, and triage metadata)
- a member write path: report a thread or a reply (role-free, idempotent per member per item)
- a moderator triage queue at `/admin/community/reports` (open reports newest first)
- closing a report as `resolved` or `dismissed` with an optional note
- inline hide/restore of the reported item, reusing the **existing** moderation use cases
- member report controls on the thread page (for the thread and for each reply)
- one additive migration creating `community_reports`

**Explicitly out of scope (deferred):**

- **auto-hiding on a report threshold** — reports queue for human review only; a report never hides
  content by itself, so there is no brigading lever (§13 decision 3)
- **notifications** — neither the reporter nor the reported member is emailed or messaged about a
  report or its outcome; the platform notification port is not wired here
- **a per-member report rate limit** — flooding is bounded by the one-report-per-item rule (§13
  decision 4); a time-based throttle would add ephemeral state (`ADR-005`) and is deferred, as the
  community slice also deferred rate limiting
- **account-level sanctions (suspend/ban)** — triage acts on a report; a sanction workflow is a
  separate, member-level feature
- **reporting research items** — this slice is the discussion surface only; extending reporting to
  `content` would cross a module boundary and is a separate slice (§13 decision 1)
- **an appeals flow** or a member-visible report history ("your report was reviewed")
- **editing or deleting a report** — a report is an append-only record; only its status changes
- **re-opening a closed report** — closing is final; a member's single report per item is created
  once (the unique key), and a new concern is a new conversation, not a reopened row

Keeping the slice to one table, one entity, and one admin surface keeps it on `ADR-004` plus the
already-built community module and triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/community/domain/community-types.ts`:

| Type | Fields |
| --- | --- |
| `ReportTargetType` | `"thread" \| "reply"` |
| `ReportStatus` | `"open" \| "resolved" \| "dismissed"` |
| `ReportReason` | `"spam" \| "harassment" \| "misinformation" \| "off-topic" \| "other"` |
| `CommunityReport` | `{ id; reporterId; targetType; targetId; reason; detail?; status; createdAt; resolvedBy?; resolvedAt?; resolutionNote? }` |
| `CreateReportInput` | `{ targetType: ReportTargetType; targetId: string; reason: ReportReason; detail?: string }` |
| `ResolveReportInput` | `{ action: "resolve" \| "dismiss"; note?: string }` |
| `ReportQueueEntry` | `{ report: CommunityReport; thread: CommunityThread; reply?: CommunityReply }` — a report plus the content it points at, so the queue can render it (a thread report carries only `thread`; a reply report carries `thread` and `reply`) |

Repository additions to `CommunityRepository`:

| Method | Contract |
| --- | --- |
| `createReport(report)` | Insert unless a report already exists for `(reporterId, targetType, targetId)`; return the stored report (the new one, or the pre-existing one) — **idempotent**, mirroring the library slice's `saveItem` |
| `getReportById(id)` | A single report, or `undefined` |
| `listReports(options)` | Reports filtered by `status?`, `createdAt` descending then `id` descending, truncated to `limit` |
| `updateReport(report)` | Persist the triage columns (`status`, `resolvedBy`, `resolvedAt`, `resolutionNote`) for an existing report id |

The in-memory `CommunityStore` gains a `reports: Map<string, CommunityReport>`.

Notes:

- **A report is a record, not a moderation action.** `CommunityReport` carries no reference to
  `ModerationState`; hiding the item is a separate, already-audited moderation write (§7). The two
  facts — "this was reported" and "this was hidden" — are kept distinct on purpose.
- **`reporterId` is moderator-only.** Like `moderatedBy`, it is stripped before any member-facing
  response is shaped, so a member can never learn who reported them (§7).
- **The reporter's own report is stable.** Re-reporting returns the existing row, so the write path is
  safe to retry and cannot be used to inflate a queue.
- **`targetId` is a bare id with no foreign key**, exactly as `author_id` and `moderated_by` are
  stored: a single polymorphic column cannot carry two FKs, and the module's convention is to store
  bare member/content ids as `text`.

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the standard
error envelope). The member write path sits beside the member community routes; triage sits under the
existing `/api/community/moderation/**` namespace. **The triage endpoints require the `admin` role;
the report endpoint requires only an authenticated session.**

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `POST` | `/api/community/reports` | A member reports a thread or reply | session |
| `GET` | `/api/community/moderation/reports` | The report queue (`status` filter, default `open`) | `admin` |
| `POST` | `/api/community/moderation/reports/[id]` | Close a report (`resolve` \| `dismiss`) | `admin` |

### 6.1 `POST /api/community/reports`

- **Request:** `{ "targetType": "thread", "targetId": "…", "reason": "spam", "detail": "…" }` —
  `reason` is one of the five verbs; `detail` is optional (≤ 1000 chars).
- **Success** `200`: `{ "report": { "…CommunityReport…" } }` — the new report, or the caller's
  pre-existing report for the same item (idempotent).
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_REPORT_TARGET_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 6.2 `GET /api/community/moderation/reports`

- **Query:** `status` (`open` \| `resolved` \| `dismissed`; default `open`), `limit` (default `20`,
  clamped to `[1, 50]` — the same clamp as the other community lists).
- **Success** `200`: `{ "entries": [ { "report": { "…CommunityReport…" }, "thread": { "…CommunityThread…" },
  "reply": { "…CommunityReply…" }? } ] }` — open reports newest first, each with the reported content.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 6.3 `POST /api/community/moderation/reports/[id]`

- **Request:** `{ "action": "resolve", "note": "…" }` — `action` is `resolve` or `dismiss`; `note` is
  optional (≤ 500 chars, the same bound as the moderation note).
- **Success** `200`: `{ "report": { "…CommunityReport…" } }` — the closed report.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_REPORT_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 6.4 Changed endpoints

The member community endpoints are **unchanged**; a report is a separate write and does not alter any
existing read. The existing moderation endpoints
([api-contracts.md](api-contracts.md) §4.31–§4.32) are reused as-is by the report queue for the inline
hide/restore.

### 6.5 Error codes

New codes, whose executable source of truth is
`src/modules/community/domain/community-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `COMMUNITY_REPORT_TARGET_NOT_FOUND` | 404 | The reported thread or reply is unknown **or hidden** — the same response a member read gives |
| `COMMUNITY_REPORT_NOT_FOUND` | 404 | Report id is unknown |

`COMMUNITY_VALIDATION_FAILED`, `COMMUNITY_FORBIDDEN`, `COMMUNITY_THREAD_NOT_FOUND`, and
`COMMUNITY_UNKNOWN` are reused unchanged.

## 7. Authorization Model

- **Reporting is a member right, role-free.** `createReport` requires only an authenticated actor
  (`resolveCommunityActor`), like `createThread`/`createReply`; the community module adds **no new
  permission** and `community-authorization.ts` is unchanged.
- **Triage is an administrator power.** `listModerationReports` and `resolveReport` assert the
  existing `canModerate(roles)` in the **application layer** (`assertCanModerate`), not only in the UI
  (`ADR-001`), and the report routes return `403`, never the data.
- **A report never acts.** The write path creates a record only; it does not call a moderation use
  case. Hiding content is always an explicit, separately-attributed `moderateThread`/`moderateReply`
  call (§13 decision 3).
- **The reporter is private.** `reporterId` (and `resolvedBy`/`resolutionNote`) are returned only
  from `/api/community/moderation/**`; a member-facing read never carries them, so a reported member
  cannot identify the reporter.
- **A report cannot disclose hidden content.** `createReport` treats an unknown **or hidden** target
  as not found (`COMMUNITY_REPORT_TARGET_NOT_FOUND`, `404`) — the same rule the member thread read
  uses (`community-moderation-slice.md` §7), so the report path is not an oracle for moderated items.
- **Idempotency is enforced in the data layer.** A unique key on
  `(reporter_id, target_type, target_id)` (§9) makes a duplicate report a no-op at the database,
  not only in the service.
- **Edge gate.** `/admin/community/reports` lives under `/admin/community/**`, already covered by the
  `/admin/:path*` middleware matcher — **no matcher change is needed**; the `admin` rule is applied
  server-side by the existing `app/admin/community/layout.tsx`.
- **Composition root.** The report routes resolve the actor with the existing
  `app/api/community/community-actor.ts`; the member island renders only when `getCommunityViewer()`
  returns a viewer. The community module imports identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/community/
  domain/         community-types.ts          (+ CommunityReport and report types, repository additions,
                                               CommunityStore.reports)
                  community-schemas.ts        (+ createReportSchema, resolveReportSchema)
                  community-errors.ts         (+ COMMUNITY_REPORT_TARGET_NOT_FOUND,
                                               COMMUNITY_REPORT_NOT_FOUND)
  application/    community-service.ts        (+ createReport, listModerationReports, resolveReport)
  infrastructure/ community-store.ts          (+ reports map, idempotent create, list/update)
                  postgres-community-repository.ts (same, in SQL)
  ui/             report-controls.tsx         (new: member "use client" island — report a thread/reply)
                  report-triage-controls.tsx  (new: admin "use client" island — resolve/dismiss)
                  moderation-controls.tsx     (reused on the queue for the inline hide/restore)
app/
  api/community/reports/route.ts                     (new: POST — the member report write)
  api/community/moderation/reports/route.ts          (new: GET — the report queue)
  api/community/moderation/reports/[id]/route.ts     (new: POST — triage)
  admin/community/reports/page.tsx                   (new: the report queue, under the admin gate)
  admin/community/page.tsx                           (change: a link to the report queue)
  community/[id]/page.tsx                            (change: report controls on the thread + each reply)
migrations/20261128190000_create_community_reports.cjs   (new: the community_reports table)
```

- **No new module.** Reports are community data, so the entity, schemas, repository methods, and use
  cases all live in the existing `community` module, exactly as moderation did
  ([module-boundaries.md](module-boundaries.md)).
- **No new cross-module edge.** The community module still depends on `platform` only and imports
  identity **types only**; the composition root resolves the actor and the viewer as it already does.
- **The queue reuses the admin chrome and the queue card.** `/admin/community/reports` sits under the
  existing `app/admin/community/layout.tsx` gate and reuses the `archive-card`/`ProtectedWorkspaceShell`
  markup the moderation queue uses, so the two admin surfaces look like one console. The queue item
  renders the reported content and reuses `moderation-controls.tsx` for the inline hide/restore rather
  than reimplementing it.
- **Two new client islands.** `report-controls.tsx` (member) and `report-triage-controls.tsx` (admin)
  are tiny `"use client"` leaves (`useState` + one POST each), joining the client inventory
  ([server-vs-client-components.md](server-vs-client-components.md) §5). The thread page and the
  report queue stay server components.
- **`publicNavItems` is not changed.** Reporting is an action available on the existing community
  pages, and the queue is an admin surface reached from `/admin/community` — neither is a member nav
  entry.

## 9. Persistence and Migration

New migration `migrations/20261128190000_create_community_reports.cjs` (kebab-case config,
`single-transaction: true`, with a working `down` that drops the table):

### 9.1 `community_reports` — new table

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `reporter_id` | `text` | not null |
| `target_type` | `text` | not null (`thread` \| `reply`) |
| `target_id` | `text` | not null |
| `reason` | `text` | not null |
| `detail` | `text` | nullable |
| `status` | `text` | not null, default `open` |
| `created_at` | `text` | not null |
| `resolved_by` | `text` | nullable |
| `resolved_at` | `text` | nullable |
| `resolution_note` | `text` | nullable |

**Indexes:**

- `community_reports_reporter_target_uidx` — **unique** on `(reporter_id, target_type, target_id)`;
  this is the idempotency guarantee (§7) and the reason a duplicate report is a no-op.
- `community_reports_status_created_at_idx` — on `(status, created_at desc, id desc)`; the queue reads
  `where status = $1 order by created_at desc, id desc limit $2`.

- Every column is **new** (a brand-new table), so the migration rewrites no existing row and adds no
  locks beyond the `create table`.
- `reporter_id`, `target_id`, and `resolved_by` store bare ids as `text` with **no cross-table foreign
  key**, matching `author_id`/`moderated_by`; `target_id` is polymorphic and cannot carry a single FK.
- **No driver-selection change.** Reports ride the existing
  `COMMUNITY_STORAGE_DRIVER=auto|memory|postgres`; `docs/configuration.md` and `.env.example` are
  **not** touched.

**Queries:**

- **Idempotent insert:** `insert … on conflict (reporter_id, target_type, target_id) do nothing`, then
  select the row for `(reporter_id, target_type, target_id)` and return it — so the caller always gets
  the stored report whether it was just created or already existed.
- **Queue:** `select … from community_reports where status = $1 order by created_at desc, id desc
  limit $2`.
- **Triage:** `update community_reports set status = $1, resolved_by = $2, resolved_at = $3,
  resolution_note = $4 where id = $5`.

The in-memory path mirrors all three: `reports: Map<string, CommunityReport>` keyed by id, an
idempotent `createReport` that scans for `(reporterId, targetType, targetId)` before inserting, and
`listReports`/`updateReport`.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; a report is text.
- **`ADR-005` (Redis)** — no rate limiting, throttling, or cache; idempotency is a unique key in
  PostgreSQL, and the in-memory store is process-local. Nothing new is ephemeral.
- **`ADR-006` (Qdrant)** — no semantic search; the queue is a recency scan.
- **`ADR-007` (offline)** — reporting and triage are online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL — one new table) and the already-built community module.

## 11. Testing Plan (`§7.3`)

- **Unit (schemas):** `createReportSchema` accepts the five reasons and rejects an unknown reason, an
  unknown `targetType`, a missing `targetId`, and an over-long `detail`; `resolveReportSchema` accepts
  `resolve`/`dismiss` only and bounds the note.
- **Unit (service):** `createReport` stores an `open` report for a visible target; a second report by
  the same member for the same item returns the **same** report and adds no row; a report for an
  unknown target and for a **hidden** target both raise `COMMUNITY_REPORT_TARGET_NOT_FOUND`;
  `listModerationReports` returns `403` for a non-admin and the open reports for an admin;
  `resolveReport` sets `status`/`resolvedBy`/`resolvedAt`/`resolutionNote` and returns `403` for a
  non-admin, `COMMUNITY_REPORT_NOT_FOUND` for an unknown id; a member response never carries
  `reporterId`.
- **Unit (memory store):** the idempotent `createReport`, the status filter on `listReports`, and
  `updateReport`.
- **Integration (routes):** `401` unauthenticated on `POST /api/community/reports`; the member happy
  path (report → queue shows it for an admin → resolve → it leaves the open queue); `200` with the
  same report on a duplicate report; `404` on an unknown target; `403` for a non-admin on both triage
  routes; `400` on an unknown action; `404` on an unknown report id. The migration `up`/`down` against
  PostgreSQL, including the unique key rejecting a duplicate insert.
- **Component:** the thread page renders the report control for a signed-in member and not for a
  guest; the report island posts and confirms; `/admin/community/reports` renders the restricted
  screen for a non-admin and the queue for an admin; the triage island closes a report and the inline
  hide still works through the reused moderation control.
- **Manual:** register a member and an admin; as the member report a thread and a reply; as the admin
  open the queue, hide the reported reply, resolve that report, and dismiss the other; confirm the
  member's view drops the hidden reply and that no member surface shows the reporter.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| A report is used to **brigade** content out of view | **High** | A report never hides anything by itself (§13 decision 3); content leaves member view only through an explicit, attributed moderator action, so a coordinated report cannot suppress content |
| A single member floods the queue with repeats | **High** | The unique key on `(reporter_id, target_type, target_id)` (§9) makes a repeat a no-op and is enforced in the data layer, not only the service (§7) |
| The reporter is exposed to the reported member | **High** | `reporterId` is returned only from the moderation endpoints and stripped from every member-facing response (§7); a test asserts a member read never carries it |
| Reporting becomes an oracle for **hidden** content | Medium | `createReport` returns `COMMUNITY_REPORT_TARGET_NOT_FOUND` for a hidden target, identical to the member thread read, so the path cannot distinguish hidden from absent (§7) |
| The report path is mistaken for a moderation action | Medium | `CommunityReport` is deliberately separate from `ModerationState`; hiding is a distinct call using the existing use cases, and the acceptance criteria state it explicitly (§3, §5) |
| The new table or its indexes break the existing community reads | Low | The table is brand-new and nothing existing is altered; the unique and status indexes are additive; the existing community tests must still pass unchanged |
| The admin queue is reachable by a signed-in non-admin | Medium | The existing `app/admin/community/layout.tsx` gate applies, and every triage use case asserts `canModerate` (`ADR-001`); the routes return `403`, not the data |
| Duplicate-semantics surprise (a dismissed item cannot be re-reported) | Low | Documented as intended (§4): a member's one report per item is created once; the unique key makes repeat reports return the existing row |

## 13. Resolved Decisions

> The product decisions below were confirmed with the owner before this note was merged; this is the
> resolved form of the Definition of Ready.

1. **Reportable content — threads and replies.** A member may report any visible community thread or
   reply, with a reason and an optional detail. Reporting stays within the `community` module; research
   items are explicitly out of scope.
2. **Triage — resolve/dismiss with inline hide.** Closing a report records a decision
   (`resolved` | `dismissed`) with an optional note, and the queue lets the administrator hide or
   restore the reported item **through the existing moderation use cases**. Closing a report is
   separate from hiding content, so both facts are recorded independently.
3. **No auto-hide.** A report only queues for human review; content stays visible until a moderator
   acts. This removes the brigading lever and preserves the moderation slice's reversible-hide
   guarantee.
4. **One report per member per item.** A member's repeat report on the same item is idempotent — the
   existing report is returned and no new row is created — enforced by a unique key in the data layer.
   Flooding is bounded by this rule rather than by a time-based throttle (which would add ephemeral
   state, `ADR-005`).

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the new
`POST /api/community/reports`, the report queue, the triage endpoint, and the two new error codes),
[data-models.md](data-models.md) (the `CommunityReport` types, the `community_reports` table, the
repository methods, and the in-memory store), [module-boundaries.md](module-boundaries.md) (the report
files and the two new islands, and the "no new module/cross-module edge" note),
[system-overview.md](system-overview.md) (the member report path and the admin reports surface), and
[server-vs-client-components.md](server-vs-client-components.md) (the `report-controls.tsx` and
`report-triage-controls.tsx` islands) are updated; the migration is added with a working `down`; and
the slice status plus the [index](README.md) entry are flipped to `Implemented`. The
moderation slice's §13 decision 4 (reporting deferred) is marked **resolved** by this slice.
`configuration.md` and `.env.example` are **not** touched — no driver or env var is added.

## 15. Recommended Implementation Order

On acceptance: migration (create `community_reports`) → domain (`CommunityReport` and the report types
→ the two error codes → `createReportSchema`/`resolveReportSchema` → the repository additions and
`CommunityStore.reports`) → infrastructure (memory store: idempotent `createReport`, `getReportById`,
`listReports`, `updateReport`, then the PostgreSQL repository in the same order) → application
(`createReport` with the target-visibility rule → `listModerationReports` → `resolveReport`) → routes
(`/api/community/reports`, `/api/community/moderation/reports`, `/api/community/moderation/reports/[id]`)
→ the member report controls on `app/community/[id]/page.tsx` → `/admin/community/reports` (the queue,
reusing the admin gate and `moderation-controls.tsx`) → the link from `/admin/community` → tests →
docs update. Follow the order used by the community-moderation and topic-browse slices
([community-moderation-slice.md](community-moderation-slice.md) §15).
