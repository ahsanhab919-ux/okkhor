# Scholar Verification Slice

- Status: `Implemented` (Definition of Ready accepted — decisions recorded in §13; shipped)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (read path),
  [content-authoring-slice.md](content-authoring-slice.md) (write path; consumes the `scholar` role)

## 1. Purpose

`/scholar-verify` has shipped since the platform scaffold as a **static placeholder**: a
four-step credentials form whose fields and step rail are hard-coded mocks
(`src/modules/experience/site-content.ts`), with no persistence and no review. The authoring
slice already gates `/studio` behind the `scholar`/`admin` roles, but nothing in the product
*grants* `scholar` — today it can only be set at registration or by direct database edit.

This document is the design/architecture note and Definition of Ready for the **third product
slice — scholar verification** — which turns that placeholder into a real workflow: an
authenticated user submits a credentials application, an administrator reviews it, and
approval grants the `scholar` role. It closes the loop opened by the authoring slice.

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A learner applies for scholar status through the product; an admin approves; the user then gains authoring access (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the identity slice's session/roles and access-token model (already built); the content authoring slice (already built, consumes the role); no new infrastructure (§10) |
| Risk level understood | **Medium** — a new fully-layered module, a new table, the first role-granting write path, and the first admin-only surface (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Establish the platform's trust boundary. A signed-in user assembles a credentials
application at `/scholar-verify`; an administrator reviews the queue and approves or rejects
it; on approval the applicant receives the `scholar` role and can therefore reach the
authoring studio. Scholar status is earned through an auditable, reviewed path rather than
self-declaration.

Acceptance criteria:

- [ ] A signed-in user can create and edit a **draft** application at `/scholar-verify` and
      submit it for review.
- [ ] A submitted application is immutable by the applicant until it is rejected.
- [ ] An administrator can list submitted applications and approve or reject one, recording a
      review note.
- [ ] **Approval grants the applicant the `scholar` role** (idempotent), so they subsequently
      gain `/studio` access; rejection leaves roles unchanged and lets the applicant resubmit.
- [ ] Non-admins cannot list or decide applications: unauthenticated requests return `401`,
      authenticated non-admins return `403`.
- [ ] Invalid payloads return `400` with the standard error envelope.
- [ ] A `scholar_verifications` table stores the application via a migration with a working
      `down`; evidence is text plus optional URLs (no binary storage).
- [ ] The `/scholar-verify` page reflects the real application state (no hard-coded fields),
      and an admin review surface exists.
- [ ] Unit tests cover the schemas, the state machine, and the role rule; integration tests
      cover the routes, the role grant, and the migration.

## 4. Scope

**In scope:**

- a new `verification` module with the standard layers
- an application state machine: `draft → submitted → approved | rejected` (rejected → submitted)
- the `scholar_verifications` table and its migration
- applicant endpoints (read/save/submit own application) and admin endpoints (list/decide)
- granting the `scholar` role on approval, through identity's public surface
- wiring `/scholar-verify` to real data and adding an admin review surface
- an admin route gate (`/admin/**`) in the edge middleware plus a server-side admin check

**Explicitly out of scope (deferred):**

- certificate/binary uploads (needs `ADR-003` / R2; evidence is text + URLs for now)
- automated or third-party credential verification
- revocation of the `scholar` role and re-review cycles beyond reject → resubmit
- notifications (in-app or SMS/email) when an application changes state
- a general admin console (only the verification queue ships here)
- per-field evidence validation against external sources

Keeping the slice to text evidence and a single review hop keeps it on `ADR-004` only and
triggers none of the deferred infrastructure ADRs (§10).

## 5. Core Entities and Domain Changes

New module types in `src/modules/verification/domain/verification-types.ts`:

| Type | Fields |
| --- | --- |
| `VerificationStatus` | `"draft" \| "submitted" \| "approved" \| "rejected"` |
| `VerificationDegree` | `degreeType`, `institution`, `year`, `evidenceUrl?` |
| `VerificationAffiliation` | `role`, `organization`, `since`, `evidenceUrl?` |
| `ScholarVerification` | `id`, `applicantId`, `status`, `displayName`, `degrees[]`, `affiliations[]`, `portfolio`, `specializations[]`, `languages[]`, `reviewNote?`, `reviewedBy?`, `submittedAt?`, `reviewedAt?`, `createdAt`, `updatedAt` |
| `SaveVerificationInput` | the applicant-editable fields, plus optional `status` (`draft` \| `submitted`) |
| `DecideVerificationInput` | `status` (`approved` \| `rejected`), `reviewNote?`, optional `updatedAt` concurrency token |
| `VerificationActor` | `{ id: string; roles: UserRole[] }` (identity types only) |
| `VerificationRepository` | `getByApplicantId`, `getById`, `listByStatus`, `create`, `updateIfUnchanged` |

Notes:

- One application per user (`UNIQUE(applicant_id)`); resubmitting after a rejection updates the
  same row and clears the prior `reviewNote`.
- The four UI steps map onto fields: **Identity** → `displayName` (prefilled from the profile),
  **Credentials** → `degrees` / `affiliations` / `portfolio`, **Specialization** →
  `specializations` / `languages`, **Verification** → `status` / `reviewNote`.
- The state machine is enforced in the application layer; illegal transitions (e.g. editing a
  `submitted` application, or a decision on a `draft`) throw `VERIFICATION_CONFLICT` (409).

### 5.1 Identity changes

The identity module gains one public application function so a role can be granted through its
documented surface (see [module-boundaries.md](module-boundaries.md) §7):

```
grantUserRole(actor: VerificationActor, userId: string, role: UserRole): Promise<UserProfile>
```

It throws `AUTH_FORBIDDEN` (403) unless the actor holds `admin`, and is **idempotent** — adding
a role the user already has is a no-op. No identity storage change is required (`roles` is
already a `jsonb` array).

## 6. API Contracts

Endpoints follow [api-contracts.md](api-contracts.md) conventions (Node runtime, JSON, the
standard error envelope). Applicant endpoints act on the **caller's own** application, so no id
appears in the path.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/verification/application` | Read the caller's application | authenticated |
| `POST` | `/api/verification/application` | Create the caller's draft application | authenticated |
| `PATCH` | `/api/verification/application` | Save the draft, or submit it (`status: "submitted"`) | authenticated |
| `GET` | `/api/verification/applications` | List applications for review (`?status=`) | `admin` |
| `GET` | `/api/verification/applications/[id]` | Read one application | `admin` |
| `PATCH` | `/api/verification/applications/[id]` | Approve or reject (`status`, `reviewNote?`) | `admin` |

### 6.1 `PATCH /api/verification/application`

- **Request:** any subset of `displayName`, `degrees`, `affiliations`, `portfolio`,
  `specializations`, `languages`, plus `status` (`draft` \| `submitted`) and `updatedAt` (the
  concurrency token the client last read).
- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`. Submitting stamps
  `submittedAt`.
- **Errors:** `VERIFICATION_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `VERIFICATION_APPLICATION_NOT_FOUND` (404), `VERIFICATION_CONFLICT` (409 — the application is
  not a `draft`, or `updatedAt` is stale).

### 6.2 `PATCH /api/verification/applications/[id]`

- **Request:** `{ "status": "approved" | "rejected", "reviewNote": "…", "updatedAt": "…" }`.
- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`. Approving stamps
  `reviewedAt` / `reviewedBy`, **and grants the applicant the `scholar` role**.
- **Errors:** `VERIFICATION_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `VERIFICATION_FORBIDDEN` (403 — non-admin), `VERIFICATION_APPLICATION_NOT_FOUND` (404),
  `VERIFICATION_CONFLICT` (409 — the application is not `submitted`).

### 6.3 Error codes

New codes, whose executable source of truth is
`src/modules/verification/domain/verification-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `VERIFICATION_VALIDATION_FAILED` | 400 | Request body failed schema validation |
| `VERIFICATION_FORBIDDEN` | 403 | Authenticated user lacks the required role |
| `VERIFICATION_APPLICATION_NOT_FOUND` | 404 | No application for the caller/id |
| `VERIFICATION_CONFLICT` | 409 | Illegal state transition or stale write |
| `VERIFICATION_UNKNOWN` | 500 | Unhandled failure (fallback) |

## 7. Authorization Model

- **Applicant side.** Any authenticated user may read/save/submit **their own** application;
  there is no path segment to guess, so ownership is implicit in the session.
- **Review side.** Only `admin` may list or decide applications. Enforced in the verification
  application layer (throws `VERIFICATION_FORBIDDEN`), never only in the UI (`ADR-001`).
- **Role grant.** `grantUserRole` independently re-checks `admin` inside identity, so the
  privilege check is not delegated solely to the caller.
- **Composition root.** The acting user is resolved in `app/**` (as in the authoring slice) and
  passed in as `{ id, roles }`; the verification module imports identity **types only**.

## 8. Module Placement and Dependencies

```
src/modules/verification/
  domain/         verification-types.ts      (entities, inputs, repository type)
                  verification-errors.ts     (VERIFICATION_* codes)
                  verification-schemas.ts    (Zod save/decide schemas)
                  verification-authorization.ts (canReview / canApply)
                  verification-state.ts      (allowed-transition rule)
  application/    verification-service.ts    (getMyApplication, saveMyApplication,
                                              submit/decide, listForReview, GRANT on approve)
  infrastructure/ verification-repository.ts (driver selector)
                  verification-store.ts      (in-memory repository)
                  postgres-verification-repository.ts
  api/            verification-http.ts       (response/error shaping)
  ui/             verification-form.tsx       (new: "use client" applicant island)
                  verification-review.tsx     (read views for the admin queue)
```

- `verification` depends on `platform` (shared Postgres pool config) and imports identity
  **types only**, plus identity's public `grantUserRole` through the composition root.
- `app/verification/**` (applicant), `app/admin/verifications/**` (review), and
  `app/api/verification/**` compose the module.
- `/scholar-verify` is rewritten to load the caller's application server-side and render the
  applicant island; hard-coded mock fields are removed from `site-content.ts` where superseded.

## 9. Persistence and Migration

New migration `migrations/<timestamp>_create_scholar_verifications.cjs` (kebab-case config,
`single-transaction: true`, with a working `down`):

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `applicant_id` | `text` | not null, **unique** (one application per user) |
| `status` | `text` | not null, default `draft` |
| `display_name` | `text` | not null |
| `degrees` | `jsonb` | not null, default `[]` |
| `affiliations` | `jsonb` | not null, default `[]` |
| `portfolio` | `text` | not null, default `''` |
| `specializations` | `jsonb` | not null, default `[]` |
| `languages` | `jsonb` | not null, default `[]` |
| `review_note` | `text` | nullable |
| `reviewed_by` | `text` | nullable |
| `submitted_at` | `text` | nullable |
| `reviewed_at` | `text` | nullable |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |

Indexes: `scholar_verifications_applicant_id_idx` (unique, enforces one-per-user) and
`scholar_verifications_status_submitted_at_idx` on `(status, submitted_at)` for the review
queue. `applicant_id` / `reviewed_by` store user ids as bare `text` without a cross-module
foreign key, matching the authorship columns added in the authoring slice. Driver selection
mirrors the established pattern: `VERIFICATION_STORAGE_DRIVER=auto|memory|postgres`.

**Optimistic concurrency.** `update` performs a conditional write
(`UPDATE … WHERE id = $1 AND updated_at = $2`); a non-matching row becomes
`VERIFICATION_CONFLICT` (409), mirroring the authoring slice. The in-memory store enforces the
same rule.

**Role-grant ordering.** Approval is a two-step composition in `app/**`: transition the
application, then `grantUserRole`. Because the grant is idempotent and approval state is the
source of truth, a failed grant is safely retried; the design notes this non-atomic edge in §12.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no binary uploads; evidence is text plus URLs.
- **`ADR-005` (Redis)** — no new ephemeral state; submissions are not rate-limited in this slice.
- **`ADR-006` (Qdrant)** — no semantic search.
- **`ADR-007` (offline)** — verification is online-only.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses only `ADR-004` (PostgreSQL), already implemented.

## 11. Testing Plan (`§7.3`)

- **Unit:** Zod schemas (required fields, defaults, URL handling); the transition rule
  (`draft → submitted → approved | rejected`, resubmit); `canReview`/`canApply`; the service —
  submit stamps `submittedAt`, editing a submitted application throws `409`, approval stamps
  `reviewedAt`/`reviewedBy`; the memory repository (`getByApplicantId`, `listByStatus`,
  `updateIfUnchanged`).
- **Integration:** the applicant routes (`401` unauthenticated; create → save → submit; `400`
  validation; `409` illegal transition); the admin routes (learner `403`; admin lists
  `submitted`; approve → the applicant's stored roles include `scholar`; reject → unchanged);
  migration `up`/`down` against PostgreSQL.
- **Component:** `/scholar-verify` renders the real application state (draft vs submitted) and
  hides editing once submitted; the admin queue lists submitted applications for an admin and is
  inaccessible to a non-admin.
- **Manual:** register a learner, complete and submit the application at `/scholar-verify`,
  confirm `/studio` still blocks them; approve as an admin, refresh the session, and confirm
  `/studio` now opens.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| Role grant is not atomic with the status change | Medium | Idempotent `grantUserRole`; approval state is the source of truth; safe to retry; documented here |
| Granting a role is a privilege-escalation surface | High | Review is admin-only and enforced in the application layer; `grantUserRole` re-checks `admin`; tests cover the `403` paths |
| Role changes are invisible until the token refreshes (roles are JWT claims) | Medium | Documented behaviour: access tokens carry roles for their 15-minute life; the applicant gains `scholar` on the next refresh or re-login (§3 manual step) |
| Text-only evidence is easy to fake | Medium | Human review plus required, linkable evidence; automated checks and uploads deferred (§4) |
| Scope creep into a general admin console or notifications | Medium | §4 out-of-scope list |
| New module drifts from the layering rules | Medium | Copy the `identity`/`content` structure; keep identity imports to types in the module and wire grants in `app/**` (§8) |

## 13. Resolved Decisions

1. **Module — a new `verification` module.** Credentials and review are a distinct bounded
   context; identity stays authentication-only. The module imports identity types only; the role
   grant is identity's public surface, invoked from `app/**`.
2. **Evidence — text plus optional URLs.** No binary storage in this slice, so `ADR-003` (R2)
   stays deferred.
3. **Review — admin-only, and approval grants `scholar`.** Approval closes the loop with the
   authoring slice; rejection is non-destructive and allows resubmission.
4. **UI — applicant flow plus an admin review surface.** `/scholar-verify` is wired to real
   data; a new admin-gated `/admin/verifications` hosts the review queue.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) and
[data-models.md](data-models.md) are updated for the new surface; the new error codes are
registered; the middleware matcher list is updated; and rollout/rollback (migration `up`/`down`)
is documented.

## 15. Recommended Implementation Order

On acceptance: migration → domain (types, schemas, errors, authorization, state rule) →
application (save/submit/decide use cases) → infrastructure (memory, then PostgreSQL
conditional update) → identity `grantUserRole` (+ its tests) → routes → applicant
`/scholar-verify` wiring → `/admin/verifications` review surface → tests → docs update. Follow
the order used by the authoring slice ([content-authoring-slice.md](content-authoring-slice.md) §15).
