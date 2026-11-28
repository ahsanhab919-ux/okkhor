# Password Reset Delivery Slice

- Status: `Implemented` (eleventh product slice — decisions recorded in §13)
- Related ADRs: `ADR-001`, `ADR-004`, `ADR-005`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [authentication-backend-slice.md](authentication-backend-slice.md) (the reset flow and
  the flagged preview risk), [member-profile-slice.md](member-profile-slice.md) (the `/profile` surface
  this slice extends with the account email), [nbu-ux-and-phone-first-identity.md](nbu-ux-and-phone-first-identity.md)
  and `ADR-009` (phone-first identity)

## 1. Purpose

Password reset works end to end — a request mints a record with a hashed token, and a confirm call
verifies the token, updates the password, and revokes every session
([auth-service.ts](../../src/modules/identity/application/auth-service.ts) `requestPasswordReset` /
`confirmPasswordReset`). But the token never *reaches the member*: it is returned to the caller in the
HTTP response as `resetTokenPreview` and the UI prefills it, a temporary handoff that the auth slice
explicitly flagged as unsafe for production ("preview token must never be exposed in production-grade
delivery … replace with SMS or trusted out-of-band delivery before production launch",
[authentication-backend-slice.md](authentication-backend-slice.md) §209–211; `api-contracts.md` §4.6:
"Delivery of the token is not yet implemented (no SMS/email channel)").

So the feature is *complete but unusable in production*: any caller who knows a phone number can mint a
reset token for that account and read it from the response. This slice closes that hole by delivering the
reset code over real channels (SMS and email) and by removing the production response handoff.

Delivering by email requires an email address, and identity does **not** store one today — `UserProfile`
has no email field, registration collects only a phone number, and there are no `email` references in the
module. So this slice also adds an **optional email** to the account (captured at registration and
editable by the owner on `/profile`), which is what makes the email channel reachable for existing and new
members alike.

This document is the design/architecture note and Definition of Ready for the **eleventh product slice —
password reset delivery channel** — which delivers:

- a **notification channel** abstraction (a port + driver selection) in `platform`, with `log`, `sms`, and
  `email` implementations;
- delivery wired into `requestPasswordReset`, sending the code by SMS and, when the account has one, by
  email — instead of the HTTP response;
- a **short numeric reset code** in place of the 48-character hex token, so the code is typeable on a
  phone;
- **rate limiting on the confirm endpoint** (the new short code needs a brute-force floor);
- an **optional account email** — captured at registration, editable by the owner on `/profile`, and
  stored in a new nullable `auth_users` column.

It is a **cross-cutting infrastructure slice**: the channel port lives in `platform` (the existing leaf
dependency for cross-cutting infrastructure, mirroring `getEphemeralStore`) and is consumed by the
`identity` reset use case. It introduces **no new module, no new domain entity, and no new HTTP *reset*
endpoint** (one small profile endpoint is added for the email edit, §6).

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A member who forgot their password receives a short reset code on their phone (and by email when one is on file) and can reset without the code ever appearing in an HTTP response (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | PostgreSQL (adopted, `ADR-004`); the identity reset flow and `auth_users` table (already built); the `platform` ephemeral store (already built, reused for the confirm rate limit); outbound SMS/email gateways (operator-supplied configuration; not code dependencies) |
| Risk level understood | **Medium** — it changes the reset token format, changes the request-endpoint response, adds a code-brute-force surface, and adds an account field; each is a bounded, testable change, and the anti-enumeration property is preserved by §7 and §12 |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** A member taps "Forgot password", enters their phone number, and receives a short numeric
reset code by SMS — and by email too if their account has an email address. They enter the code and a new
password and are signed out everywhere. The code never appears in any HTTP response in production. A
member (or attacker) who does not control the phone number or email cannot complete a reset.

Acceptance criteria:

- [ ] `POST /api/auth/password-reset/request` still returns `accepted: true` with a neutral message for
      **every** phone number (existing or not), so account existence is not disclosed.
- [ ] When the account exists, the reset code is delivered through the configured channels: **SMS always**
      (to the account phone), and **email too whenever the account has an email**. The response does
      **not** include the code in production.
- [ ] The reset code is a **6-digit numeric code** — typeable on a feature phone — not a 48-character hex
      string.
- [ ] `POST /api/auth/password-reset/confirm` accepts the 6-digit code, still single-use and time-boxed
      (`PASSWORD_RESET_MAX_AGE_SECONDS`, 15 minutes), and still revokes all sessions on success.
- [ ] The confirm endpoint is rate-limited so a 6-digit code cannot be brute-forced within its lifetime.
- [ ] A delivery failure in **any** channel does **not** change the neutral request response (no
      enumeration oracle), does not stop the other channel, and is logged server-side.
- [ ] The code preview is available **only** under the dev/test `log` channel and only outside production;
      the UI no longer prefills a code from a production response.
- [ ] Registration accepts an **optional** email (validated) and stores it; the owner can **view and
      change** their email on `/profile`; another member never sees it on `/u/[id]`.
- [ ] The channel set is selected by a driver variable with the same shape as the other providers
      (`auto | log | sms | email | sms+email`), so tests and local work run with no network call and no
      gateway credentials.
- [ ] Unit tests cover the channel selection and each channel; the code generation/validation; the
      delivery-failure path; the email capture and edit. Integration tests cover the request → deliver →
      confirm round trip through the `log` channel and the email-setting round trip.

## 4. Scope

**In scope:**

- a `NotificationChannel` port in `platform` plus `log`, `sms`, and `email` implementations and a driver
  selector that fans out to the configured channels
- a 6-digit numeric reset code (generation, hashing, and confirm validation) replacing the hex token
- delivery of the code from `requestPasswordReset` through the channels
- a confirm-endpoint rate limit (reusing the existing `enforceAuthRateLimit`)
- an **optional account email**: a nullable `auth_users.email` column (migration), an optional email in
  the registration schema and form, an owner-only email view/edit on `/profile` (one small endpoint + one
  island)
- removal of the production `resetTokenPreview` handoff; a dev-only preview under the `log` channel
- the `auth` UI update (show "code sent" guidance instead of prefilling a token)

**Explicitly out of scope (deferred):**

- **email verification** — the captured email is not verified (no confirmation link) in this slice; it is
  a recovery contact, so an unverified address is acceptable and verification is a follow-up slice
- **email as a login identifier or a unique key** — email stays optional, non-unique, and secondary; this
  slice does not add email login, and two accounts may share an address (no uniqueness violation to
  handle). `ADR-009` keeps phone number the primary identifier
- **a general-purpose notification service** for other domains (verification decisions, moderation
  notices, reply notifications) — the port is built to be reusable, but only password reset consumes it
  in this slice (**partly resolved** by the [notifications slice](notifications-slice.md), which reuses
  the same port for moderation and report outcomes; verification-decision notices remain unbuilt)
- **delivery receipts, retries, or a delivery-status table** — each send is fire-and-forget with a
  server-side log; no new persistence
- **vendor-specific SMS/email SDKs** — the concrete providers are generic HTTPS gateway calls so any
  operator can be wired without a code change (§13 decision 5)
- **MFA / step-up authentication**, **OTP-based login**, and **password change while signed in** —
  separate flows
- **localization of the message body** — a single templated string this slice; multilingual notification
  copy is a follow-up

## 5. Core Entities and Domain Changes

No new domain *entity* and no change to `PasswordResetRecord`'s shape (it still stores a hash and an
expiry). One field is added to the user, plus the notification types.

**`platform` — the notification port** (`src/modules/platform/domain/notification-types.ts`):

| Type | Fields |
| --- | --- |
| `NotificationDestination` | `{ phoneNumber: string; email?: string }` — the recipient's contact points |
| `NotificationMessage` | `{ destination: NotificationDestination; subject: string; body: string }` |
| `NotificationChannel` | `{ kind: "sms" \| "email" \| "log"; send(message: NotificationMessage): Promise<void> }` — a channel skips itself when its required contact point is missing (email channel needs `destination.email`) |

**`identity` — the account email and the reset code:**

- `UserProfile` and `UserRecord` gain an optional `email?: string`
  (`src/modules/identity/domain/auth-types.ts`); `PublicProfile` is **unchanged** (it still excludes
  contact details, so `/u/[id]` never renders an email — [member-profile-slice.md](member-profile-slice.md) §5)
- `registrationSchema` gains an optional validated `email`
- the reset **code** becomes a 6-digit numeric string, generated with a cryptographically secure random
  source; `passwordResetConfirmSchema.token` changes to the code's exact shape; the *hash input* changes
  from the hex token to the numeric code (the record shape is unchanged)

Notes:

- **The port is identity-agnostic on purpose.** `platform` does not import `identity`, and the message
  carries only contact points and text, so the same port can serve a future verification or moderation
  notification without a new abstraction (`ADR-001`; §8).
- **The code and the email are stored safely.** Only the code's hash is stored, exactly as today; the
  plaintext code exists only in the delivery call. The email is a normal account field returned only to
  its owner.
- **No new error type surfaces to the caller from delivery.** A delivery failure is swallowed into the
  neutral request response and logged; the only new caller-facing error is the confirm rate limit (§6).

## 6. API Contracts

**One small endpoint is added; one endpoint's response changes; one gains a limit.**

- **New** `PATCH /api/auth/profile` — the owner-only email edit. Request `{ "email": "member@example.com" }`
  (or `{ "email": "" }` to clear it), session-checked from `okkhor_access`; success returns the updated
  `UserProfile`. Errors: `AUTH_UNAUTHORIZED` (401), `AUTH_VALIDATION_FAILED` (400). No role requirement.
- `POST /api/auth/password-reset/request` — **the response shape becomes conditional on the channel.** In
  all environments it returns the neutral `{ accepted: true, message }`. The `resetTokenPreview` and
  `expiresAt` fields are returned **only** under the `log` channel and **only** when
  `NODE_ENV !== "production"` — the dev/test affordance that keeps local work and tests working without a
  gateway. Under the real channels (and in production generally) the response never contains the code.
- `POST /api/auth/password-reset/confirm` — shapes unchanged except `token` is now the 6-digit code; the
  endpoint gains `AUTH_RATE_LIMITED` (429) as a possible error, reusing the existing envelope and the
  existing `enforceAuthRateLimit` helper.

[api-contracts.md](api-contracts.md) gains the `PATCH /api/auth/profile` section, is corrected at §4.6
(the "delivery not yet implemented" note is replaced by the delivery behaviour), and §4.7 gains the 429
error and the new token shape.

## 7. Authorization Model

- **Delivery is server-side only.** The code is sent by the server through the channels; it is never
  rendered, returned, or reachable from the browser in production. The confirm step remains the only way
  to consume it.
- **Anti-enumeration is preserved.** The request endpoint returns the same neutral response for an unknown
  phone number, an account whose delivery failed, and a successful send. Delivery failures are logged
  server-side, never reflected in the response, so the response cannot be used to test whether an account
  exists (§12).
- **The 6-digit code is protected by three bounds** (the reason the code can be short): it lives
  `PASSWORD_RESET_MAX_AGE_SECONDS` (15 minutes), it is single-use (`usedAt`), and the confirm endpoint is
  rate-limited per client so the code space cannot be exhausted inside the window (§9).
- **The email is owner-only.** `PATCH /api/auth/profile` re-checks the session and edits only the caller's
  own record; `PublicProfile` (rendered by both `/profile` and `/u/[id]`) still excludes the email, so
  another member's profile page never reveals it ([member-profile-slice.md](member-profile-slice.md) §7).
- **A successful reset still revokes every active session** for the user, unchanged
  ([auth-service.ts](../../src/modules/identity/application/auth-service.ts) `confirmPasswordReset`).
- **No client exposure of the channel.** The driver and gateway credentials are server-only; the `auth`
  UI island learns only "a code was sent", never the code (outside the dev-only preview).

## 8. Module Placement and Dependencies

```
src/modules/platform/
  domain/notification-types.ts             (new: NotificationDestination, NotificationMessage, NotificationChannel)
  infrastructure/notification-channel.ts   (new: driver selector + fan-out — NOTIFICATION_CHANNEL_DRIVER)
  infrastructure/log-notification-channel.ts     (new: log + recorded-message test double)
  infrastructure/sms-notification-channel.ts     (new: HTTPS gateway call, timeout + error)
  infrastructure/email-notification-channel.ts   (new: HTTPS gateway call, timeout + error; skips without an email)
src/modules/identity/
  domain/auth-types.ts                     (change: UserProfile/UserRecord gain `email?`)
  domain/auth-schemas.ts                   (change: registration `email?`; confirm `token` shape)
  domain/auth-codes.ts                     (new: 6-digit code generation + length constant)
  infrastructure/auth-store.ts             (change: persist email on the in-memory user)
  infrastructure/postgres-auth-repository.ts (change: read/write the `email` column)
  application/auth-service.ts              (change: deliver in requestPasswordReset; setEmail use case; validate the code)
  application/auth-rate-limit.ts           (change: add the confirm scope)
  api/auth-http.ts                         (change: the profile-update response shaping, if needed)
  ui/credential-auth-panel.tsx             (change: optional email on register; "code sent" reset guidance)
  ui/email-settings-form.tsx               (new client island: set/clear the owner's email on /profile)
migrations/20261128180000_add_user_email.cjs     (new: nullable `auth_users.email`, reversible)
app/
  api/auth/profile/route.ts                (new: PATCH — the owner-only email edit)
  profile/page.tsx                         (change: render the owner's email + the email-settings island)
```

- **No new module.** A notification channel is cross-cutting infrastructure, so its port lives in
  `platform` — the established leaf dependency for cross-cutting concerns (the ephemeral store already
  lives there, and `identity` already imports `platform` for it). This mirrors the
  member-profile/topic-browse "no new module" discipline ([module-boundaries.md](module-boundaries.md)).
- **The dependency direction is unchanged.** `identity → platform` already exists
  (`auth-rate-limit.ts` imports `getEphemeralStore`); this slice adds one more `platform` import, not a new
  edge. `platform` imports neither `identity` nor any domain module.
- **Driver selection mirrors the existing providers.** `NOTIFICATION_CHANNEL_DRIVER =
  auto | log | sms | email | sms+email` (`src/modules/summarization/infrastructure/summary-provider.ts` is
  the precedent). `auto` resolves to `log` under test, else to every channel whose gateway is configured;
  explicit values force the set. The selector returns the resolved `NotificationChannel[]`, and the
  identity use case sends through all of them (per-channel failures isolated, §9).
- **One new client island.** `email-settings-form.tsx` is a tiny `"use client"` leaf on `/profile`
  (`useState` + one PATCH), so it joins the client inventory alongside the existing
  `credential-auth-panel.tsx` ([server-vs-client-components.md](server-vs-client-components.md) §5).

## 9. Persistence, Queries, and Delivery Semantics

**One additive migration, one new column; no new table.**

| Change | Detail |
| --- | --- |
| `migrations/20261128180000_add_user_email.cjs` | `pgm.addColumn("auth_users", { email: { type: "text" } })` — nullable, additive, reversible (`down` drops it); existing rows backfill to `NULL` with no rewrite |

- `email` is **not unique** and **not indexed**: it is a secondary recovery contact, not an identifier
  (§4), so there is no uniqueness violation to handle and no lookup path to index. `auth_users` reads are
  by `id`/`phone_number`, unchanged.
- No reset-table change: `getPasswordResetByTokenHash` still selects by `token_hash`; only the plaintext
  that is hashed changes (hex token → 6-digit code). The confirm rate limit is an ephemeral counter, not a
  table.
- **Delivery semantics.** `requestPasswordReset` builds the message (code + expiry in the body, a subject
  for email) and sends it through the resolved channels. The **SMS** channel sends to the account phone;
  the **email** channel sends to `destination.email` and **skips silently when it is absent**. Each
  channel's send is wrapped independently, so a failure in one is logged and does not stop the other, and
  never changes the response (§7).

**Configuration (new; this slice *does* touch `.env.example` and `docs/configuration.md`):**

| Variable | Meaning | Default |
| --- | --- | --- |
| `NOTIFICATION_CHANNEL_DRIVER` | `auto \| log \| sms \| email \| sms+email` | `auto` |
| `NOTIFICATION_SMS_WEBHOOK_URL` | the HTTPS gateway the `sms` channel POSTs to | — |
| `NOTIFICATION_SMS_API_KEY` | bearer credential for the SMS gateway | — |
| `NOTIFICATION_SMS_SENDER` | sender id/name the SMS gateway presents | — |
| `NOTIFICATION_SMS_TIMEOUT_MS` | per-send timeout for SMS | `10000` |
| `NOTIFICATION_EMAIL_WEBHOOK_URL` | the HTTPS gateway the `email` channel POSTs to | — |
| `NOTIFICATION_EMAIL_API_KEY` | bearer credential for the email gateway | — |
| `NOTIFICATION_EMAIL_FROM` | the `From` address the email gateway presents | — |
| `NOTIFICATION_EMAIL_TIMEOUT_MS` | per-send timeout for email | `10000` |

- Each provider posts a small JSON body (`{ to, from|sender, subject?, body }`) with a bearer header and
  aborts on timeout, mirroring `gemini-summary-provider.ts` (no new dependency, no vendor SDK).
- `auto` resolves to `log` under `NODE_ENV=test` **and** when no gateway is configured outside production;
  otherwise it resolves to the channels whose gateway URL is present (`sms`, `email`, or both). In
  production with nothing configured, a send fails and is swallowed into the neutral response (§7) rather
  than breaking the endpoint.

The in-memory path is trivial: the `log` channel records the last message on `globalThis` (with a
`reset…ForTesting()` hook) so unit and integration tests assert delivery without a network call; the
in-memory user store simply carries the new `email` field.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media; the messages are text.
- **`ADR-005` (Redis)** — no new caching; the confirm rate limit reuses the existing ephemeral store, and
  the `log` channel needs no store at all.
- **`ADR-006` (Qdrant)** — no discovery or ranking.
- **`ADR-007` (offline)** — reset is an online-only flow.
- **`ADR-008`** — no calendar or scheduling behaviour.

Uses `ADR-004` (PostgreSQL — one nullable column), `ADR-005` (the existing ephemeral store for the confirm
limit), and `ADR-009` (phone-first → SMS primary, email secondary) plus the already-built identity and
`platform` modules.

## 11. Testing Plan (`§7.3`)

- **Unit (channel):** the driver selector resolves `log`/`sms`/`email`/`sms+email`/`auto` correctly
  (including `auto` under `NODE_ENV=test` and the "no gateway configured" branch); the `log` channel
  records the message; the email channel **skips** a destination without an email; the `sms`/`email`
  channels post the expected body/headers and surface a timeout as a send failure.
- **Unit (identity):** code generation produces a 6-digit numeric code; `requestPasswordReset` calls the
  channels for an existing account and **not at all** for an unknown one; a channel rejection is swallowed
  so the response stays neutral, and a failure in one channel does not prevent the other; `setEmail`
  validates and persists; `confirmPasswordReset` accepts a valid code, rejects a used/expired/unknown
  code, and still revokes sessions.
- **Integration:** request → `log`-channel delivery → confirm round trip succeeds; the request response
  carries no code under the real channels; the confirm endpoint returns `AUTH_RATE_LIMITED` after the
  window budget is spent; `PATCH /api/auth/profile` sets and clears the email and rejects a bad address.
- **Component:** the `auth` panel shows "code sent" guidance and does not prefill a code from a production
  response (it may prefill under the dev preview); the register form accepts an optional email; the
  `/profile` email island shows and updates the email; `/u/[id]` never renders an email.
- **Manual:** run with `NOTIFICATION_CHANNEL_DRIVER=log`, request a reset for a known number, read the code
  from the server log, and complete the reset; set an email on `/profile`, request again, and confirm the
  email send is attempted (gateway log) while the response still carries no code.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- |--- |
| A delivery failure (or the missing-gateway branch) becomes an account-existence oracle | **High** | The request response is identical for unknown account, failed delivery, and successful send; delivery failures are logged server-side only (§7); a test asserts the response shape is invariant |
| The 6-digit code is brute-forced within its 15-minute window | **High** | The confirm endpoint is rate-limited per client, the code is single-use, and the window is short — three bounds, added in this slice (§7, §9); without the limit the change ships as a downgrade |
| The production response keeps leaking `resetTokenPreview` | **High** | The preview is gated on the `log` channel **and** `NODE_ENV !== "production"`; a test asserts the real-channel response contains no code (§6, §11) |
| The new nullable column or the optional email breaks registration/login | Medium | The column is additive and nullable with no uniqueness constraint; the field is optional end to end; the auth flow is covered by the existing tests plus the new ones (§9) |
| Email is unverified, so a typo'd or attacker-set address misdelivers a reset | Medium | Accepted and documented: the email is a secondary recovery contact (§4) and SMS is always sent to the verified phone, so reset never depends on email alone; verification is a follow-up slice |
| A misconfigured production channel silently breaks resets | Medium | The failure is logged loudly server-side and the neutral response is preserved; `docs/configuration.md` documents the required variables, and a startup/readiness check is noted as a follow-up (§4) |
| Changing the token shape breaks the existing confirm contract or the UI | Medium | The confirm schema and the panel are updated in the same slice; a test covers the new code shape end to end |
| `platform` grows a domain concern | Low | The port is a small, identity-agnostic leaf type; no domain logic moves into `platform` (§8) |
| The email edit endpoint is abused to change another member's email | Low | The endpoint edits only the session's own user and re-checks the session (§7); it is covered by an authorization test |

## 13. Resolved Decisions

> The product/architecture decisions below were confirmed with the owner before this note was merged; this
> is the resolved form of the Definition of Ready.

1. **Scope — password-reset delivery on a reusable port.** Deliver this slice's target (password reset)
   and build the channel as a generic `platform` port for later reuse, rather than a broad notification
   system now. (The "only password reset consumes the port" limitation is **partly resolved** by the
   [notifications slice](notifications-slice.md), which reuses the same port for moderation and report
   outcomes; reply and verification notifications remain deferred.)
2. **Channels — SMS *and* email.** SMS is the primary channel (phone-first, `ADR-009`) and is always sent
   to the account phone; email is sent as well whenever the account has an email. Both are wired in this
   slice.
3. **Code format — a 6-digit numeric code,** replacing the 48-character hex token, so it is typeable on a
   feature phone; secured by the single-use, 15-minute, and confirm-rate-limit bounds.
4. **Confirm rate limit — added in this slice.** A short code requires a brute-force floor, so the confirm
   endpoint gains a rate limit rather than shipping the shorter code unprotected.
5. **Providers — generic HTTPS gateways.** The `sms` and `email` channels each POST a documented JSON body
   to `NOTIFICATION_SMS_WEBHOOK_URL` / `NOTIFICATION_EMAIL_WEBHOOK_URL`, so any operator can be wired
   without code (no vendor SDK, no new dependency).
6. **Dev handoff — the preview stays only under the `log` channel outside production.** Local work and
   tests keep working; production responses never carry the code.
7. **Abstraction home — `platform`, not a new module.** The channel is cross-cutting infrastructure and
   `identity` already depends on `platform`; no new module or cross-module edge.
8. **Email capture — an optional account email is added in this slice.** Because email delivery needs an
   address and identity stores none, the slice adds a nullable `auth_users.email`, an optional email at
   registration, and an owner-only view/edit on `/profile` (one endpoint + one island). Email stays
   optional, non-unique, and unverified, and is never shown on another member's `/u/[id]`.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md) (the new
`PATCH /api/auth/profile` section, §4.6's delivery behaviour, and §4.7's new 429 and token shape),
[configuration.md](../configuration.md) (the nine new variables) and [.env.example](../../.env.example)
(the same variables) are updated; [data-models.md](data-models.md) records the `email` column, the
registration/confirm schema changes, and the `platform` channel reads (no reset-table change);
[module-boundaries.md](module-boundaries.md) records the new `platform` port and the one-way edge;
[system-overview.md](system-overview.md) notes the delivery step, and
[server-vs-client-components.md](server-vs-client-components.md) adds the `email-settings-form.tsx` island
to the client inventory; the migration is added with a working `down`; the authentication-backend-slice's
preview risk is marked resolved; and the slice status plus the [index](README.md) entry are flipped to
`Implemented`.

## 15. Recommended Implementation Order

On acceptance: the `auth_users.email` migration → the `platform` notification types → the `log` channel →
the `sms` channel → the `email` channel → the driver selector/fan-out (`getNotificationChannels`) → the
identity email field (types, store, postgres repo) → the registration schema + form email → the identity
6-digit code generator + constant → the confirm schema change → wire delivery into `requestPasswordReset`
(neutral response on failure, per-channel isolation) → the confirm rate-limit scope → the `setEmail` use
case + `app/api/auth/profile/route.ts` → the `/profile` email display + `email-settings-form.tsx` island →
`api-contracts.md` / `configuration.md` / `.env.example` updates → the `auth` panel change → tests → the
remaining docs update. Follow the order used by the ai-summarization and library slices
([ai-summarization-slice.md](ai-summarization-slice.md) §15, [library-slice.md](library-slice.md) §15).
