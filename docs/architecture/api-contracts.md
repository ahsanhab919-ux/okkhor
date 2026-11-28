# API Contracts

- Status: `Active`
- Related ADR: `ADR-002`
- Owner: `Engineering Lead`

## 1. Purpose

Define the HTTP contract of the application: every route the app exposes, its request and
response shape, its cookies, its status codes, and its error envelope. Client code, tests,
and future frontends should be able to integrate against this document without reading the
route files.

## 2. Conventions

- **Base path:** all routes live under `app/api/**` and are served by Next.js route handlers
  with `runtime = "nodejs"` (except the edge middleware, which is not an API route).
- **Content type:** requests and responses are `application/json`. Handlers call
  `request.json()` directly, so a malformed body surfaces as an unexpected failure.
- **Authentication:** access is carried by the `okkhor_access` httpOnly cookie. The cookie is
  set on register/login/refresh and cleared on logout/refresh-failure. No `Authorization`
  header is used.
- **Error envelope:** every handled failure returns

  ```json
  { "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid phone number or password." } }
  ```

  Unhandled failures return `{ "error": { "code": "AUTH_UNKNOWN", "message": "Unexpected authentication failure." } }`
  with status `500`. The content endpoints reuse the same envelope with their own `CONTENT_*`
  codes (see §4.9–§4.12 and §6), the verification endpoints with their own `VERIFICATION_*`
  codes (see §4.13–§4.18 and §6), the community endpoints with their own `COMMUNITY_*`
  codes (see §4.19–§4.22 and §4.29–§4.32 and §6), and the library endpoints with their own
  `LIBRARY_*` codes (see §4.25–§4.27 and §6).
- **Validation:** request bodies are validated with Zod schemas in
  `src/modules/identity/domain/auth-schemas.ts`. The first validation issue message becomes
  the `AUTH_VALIDATION_FAILED` message (`400`). Content writes use
  `src/modules/content/domain/content-schemas.ts`, where the same rule yields
  `CONTENT_VALIDATION_FAILED` (`400`); verification writes use
  `src/modules/verification/domain/verification-schemas.ts`, yielding
  `VERIFICATION_VALIDATION_FAILED` (`400`); community writes use
  `src/modules/community/domain/community-schemas.ts`, yielding
  `COMMUNITY_VALIDATION_FAILED` (`400`); library writes use
  `src/modules/library/domain/library-schemas.ts`, yielding
  `LIBRARY_VALIDATION_FAILED` (`400`).

## 3. Cookie Contract

| Cookie | Value | Max-Age | Flags |
| --- | --- | --- | --- |
| `okkhor_access` | JWT access token (`type: "access"`) | 900 s (15 min) | `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/` |
| `okkhor_refresh` | Opaque JWT refresh token (`type: "refresh"`) | 604800 s (7 days) | `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/` |

Both cookies are written by `setAuthCookies` and cleared by `clearAuthCookies` in
`src/modules/identity/api/auth-http.ts`. Clearing sets the value to `""` with `Max-Age=0`.

## 4. Endpoints

### 4.1 `POST /api/auth/register`

Create a phone-first account and start a session.

- **Request**

  ```json
  {
    "phoneNumber": "01712345678",
    "displayName": "Rahim Uddin",
    "password": "secret123",
    "locale": "bn-BD",
    "roles": ["learner"],
    "email": "rahim@example.com"
  }
  ```

  `phoneNumber` is normalized to the `+880` form before storage; `locale` defaults to
  `bn-BD`; `roles` defaults to `["learner"]`. `password` must be ≥ 8 characters with at least
  one letter and one number. `email` is **optional** (validated when present, ≤ 160 chars, an
  empty string is treated as no email); it is a secondary recovery contact, not an identifier —
  it is not unique and never appears in `PublicProfile` (`password-reset-delivery-slice.md` §5).

- **Success** `200`

  ```json
  {
    "user": { "id": "…", "phoneNumber": "+8801712345678", "displayName": "Rahim Uddin",
              "locale": "bn-BD", "roles": ["learner"], "createdAt": "…",
              "updatedAt": "…", "passwordUpdatedAt": "…", "lastLoginAt": "…" },
    "tokenMeta": { "accessExpiresAt": "…", "refreshExpiresAt": "…" }
  }
  ```

  Sets both auth cookies. The raw tokens are **never** returned in the body.

- **Errors:** `AUTH_VALIDATION_FAILED` (400), `AUTH_USER_EXISTS` (409),
  `AUTH_RATE_LIMITED` (429).

### 4.2 `POST /api/auth/login`

- **Request:** `{ "phoneNumber": "01712345678", "password": "secret123" }`
- **Success** `200`: same shape as register (`user` + `tokenMeta`), sets both cookies.
- **Errors:** `AUTH_INVALID_CREDENTIALS` (401 — returned for both unknown phone and wrong
  password), `AUTH_VALIDATION_FAILED` (400), `AUTH_RATE_LIMITED` (429).
- **Side effects:** rotates the session — a new session row is created and the user's
  `lastLoginAt`/`updatedAt` are updated.

### 4.3 `POST /api/auth/refresh`

Rotates the refresh token. Body is ignored; the refresh token is read from the cookie.

- **Success** `200`: same shape as register/login, sets both cookies.
  The presented refresh token is revoked and a new session is issued.
- **Errors:** `AUTH_UNAUTHORIZED` (401, `"Refresh token is required."`) when no cookie is
  present; `AUTH_UNAUTHORIZED` / `AUTH_TOKEN_INVALID` (401) otherwise.
- **On any error:** both cookies are cleared.

### 4.4 `POST /api/auth/logout`

Idempotent. Body ignored; the refresh token is read from the cookie.

- **Success** `200`: `{ "success": true }`. Both cookies are cleared. Revokes the session if
  the refresh token is still valid; succeeds silently otherwise.

### 4.5 `GET /api/auth/session`

Resolve the current user from the access-token cookie.

- **Request:** no body. Uses `okkhor_access`.
- **Success** `200`:

  ```json
  { "user": { "…UserProfile…" }, "sessionId": "…" }
  ```

- **Errors:** `AUTH_UNAUTHORIZED` (401) when the cookie is missing, the token is invalid, or
  the user no longer exists.

### 4.6 `POST /api/auth/password-reset/request`

- **Request:** `{ "phoneNumber": "01712345678" }`
- **Success** `200`. Always `accepted: true` to avoid disclosing whether an account exists:

  ```json
  { "accepted": true, "message": "If the account exists, a reset instruction has been issued." }
  ```

  When the account exists, a **6-digit numeric reset code** is minted (stored only as a SHA-256
  hash) and **delivered out of band**: always over SMS to the account phone, and over email too
  whenever the account has an email. The response is **identical** whether the account is
  unknown, the delivery failed, or the send succeeded — so it cannot be used to test account
  existence. A per-channel failure is logged server-side and never stops the other channel
  (`password-reset-delivery-slice.md` §7, §9).

  The `resetTokenPreview` and `expiresAt` fields are returned **only** under the dev/test `log`
  channel **and only** when `NODE_ENV !== "production"` — the local-work affordance. Under the
  real channels (and in production generally) the response never contains the code.

  ```json
  { "accepted": true, "message": "If the account exists, a reset instruction has been issued.",
    "resetTokenPreview": "194270", "expiresAt": "…" }
  ```

  Delivery is selected by `NOTIFICATION_CHANNEL_DRIVER`
  (`auto | log | sms | email | sms+email`); see [configuration.md](../configuration.md).

- **Errors:** `AUTH_VALIDATION_FAILED` (400), `AUTH_RATE_LIMITED` (429).

### 4.7 `POST /api/auth/password-reset/confirm`

- **Request:** `{ "token": "194270", "newPassword": "newsecret123" }` — `token` is the
  **6-digit numeric reset code** (exactly `\d{6}`).
- **Success** `200`: `{ "success": true, "message": "Password updated successfully." }`.
- **Side effects:** the password hash and `passwordUpdatedAt` are updated, the reset code is
  marked used, and **all active sessions for the user are revoked**.
- **Errors:** `AUTH_RESET_INVALID` (400 — unknown, used, or expired code),
  `AUTH_VALIDATION_FAILED` (400), `AUTH_RATE_LIMITED` (429 — the confirm endpoint is
  rate-limited so the short code cannot be brute-forced within its lifetime; see §5).

### 4.8 `GET /api/health`

- **Success** `200`:

  ```json
  {
    "name": "Okkhor", "status": "ok", "architecture": "modular-monolith",
    "defaultLocale": "bn-BD", "summary": "…", "timestamp": "…"
  }
  ```

- Sets `Cache-Control: no-store`. No auth required.

### 4.9 `GET /api/content/items`

List published research items (content read path), newest first. Public — no auth required.

- **Query:** `?limit=&cursor=`
  - `limit` — page size, default `20`, clamped to `[1, 50]`.
  - `cursor` — opaque keyset cursor returned as `nextCursor` by a previous page.
- **Success** `200`:

  ```json
  {
    "items": [ { "…ResearchItem…" } ],
    "nextCursor": "…"
  }
  ```

  `nextCursor` is present only when a further page exists; omit it for the final page.
- **Errors:** `CONTENT_INVALID_CURSOR` (400) when `cursor` is malformed,
  `CONTENT_UNKNOWN` (500) for an unhandled failure. Draft items are never returned.

### 4.10 `GET /api/content/items/[id]`

Fetch one published research item by id. Public — no auth required.

- **Request:** `id` is the item UUID path segment.
- **Success** `200`: `{ "item": { "…ResearchItem…" } }`.
- **Errors:** `CONTENT_ITEM_NOT_FOUND` (404) when the id is unknown or the item is not
  published; `CONTENT_UNKNOWN` (500) for an unhandled failure.

### 4.11 `POST /api/content/items`

Create a research item (content write path). Requires an authenticated session with an author
role (`scholar` or `admin`) — see [content-authoring-slice.md](content-authoring-slice.md).

- **Request**

  ```json
  {
    "title": "…",
    "abstract": "…",
    "summaryBn": "…",
    "sourceLanguage": "en",
    "tags": ["…"],
    "sourceUrl": "…",
    "status": "draft"
  }
  ```

  `title` and `abstract` are required and non-empty; `summaryBn` is optional to save (a blank
  summary is generated on publish — see §4.24); `tags` defaults to `[]`; `sourceLanguage`
  defaults to `en`; `status` defaults to `draft` (`draft | published`). The creating user is
  stamped as `authorId` and `updatedBy`.

- **Success** `201`: `{ "item": { "…ResearchItem…" } }`. When the new item is `published`, the
  response additionally carries a transient `summary` block (§4.24) and `publishedAt` is stamped.
- **Errors:** `AUTH_UNAUTHORIZED` (401 — no/invalid session), `CONTENT_FORBIDDEN` (403 —
  authenticated non-author such as `learner`), `CONTENT_VALIDATION_FAILED` (400),
  `AI_SUMMARY_FAILED` (502) / `AI_UNAVAILABLE` (503) when publishing and summarization fails,
  `CONTENT_UNKNOWN` (500).

### 4.12 `PATCH /api/content/items/[id]`

Edit an existing research item and/or transition it (`draft → published`). Requires an
authenticated session with an author role (`scholar` or `admin`).

- **Request:** any subset of the create fields, plus `updatedAt` — the `updatedAt` the client
  last read, used as the optimistic-concurrency token.

  ```json
  { "title": "…", "status": "published", "updatedAt": "2026-11-28T10:00:00.000Z" }
  ```

- **Success** `200`: `{ "item": { "…ResearchItem…" } }`. The transition to `published` stamps
  `publishedAt` once (a later edit keeps the original value) and adds the transient `summary`
  block (§4.24). Every write stamps `updatedBy` and bumps `updatedAt`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `CONTENT_FORBIDDEN` (403), `CONTENT_VALIDATION_FAILED`
  (400), `CONTENT_ITEM_NOT_FOUND` (404 — unknown id), `CONTENT_CONFLICT` (409 — `updatedAt` did
  not match the stored version; the newer version is not overwritten), `AI_SUMMARY_FAILED` (502) /
  `AI_UNAVAILABLE` (503) when the edit publishes the item and summarization fails,
  `CONTENT_UNKNOWN` (500).

The read endpoints (§4.9, §4.10) are unchanged and stay public.

### 4.13 `GET /api/verification/application`

Return the caller's own scholar-verification application. Requires an authenticated session
(any role). See [scholar-verification-slice.md](scholar-verification-slice.md).

- **Request:** no body. Uses `okkhor_access`.
- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`, or
  `{ "application": null }` when the caller has not started an application.
- **Errors:** `AUTH_UNAUTHORIZED` (401 — no/invalid session), `VERIFICATION_UNKNOWN` (500).

### 4.14 `POST /api/verification/application`

Create the caller's application (a draft, or directly submitted when `status: "submitted"`).
One application per user.

- **Request**

  ```json
  {
    "displayName": "Dr. Nadia Islam",
    "degrees": [{ "degreeType": "PhD", "institution": "University of Dhaka", "year": "2018" }],
    "affiliations": [{ "role": "Associate Professor", "organization": "CRMH", "since": "2021" }],
    "portfolio": "…",
    "specializations": ["history of science"],
    "languages": ["bn", "en"],
    "status": "draft"
  }
  ```

  Every field is optional; `status` accepts only `draft | submitted` (default `draft`).
  Submitting requires a display name, at least one degree, and a portfolio.
- **Success** `201`: `{ "application": { "…ScholarVerification…" } }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `VERIFICATION_VALIDATION_FAILED` (400 — bad body or an
  incomplete submission), `VERIFICATION_CONFLICT` (409 — an application already exists),
  `VERIFICATION_UNKNOWN` (500).

### 4.15 `PATCH /api/verification/application`

Edit the caller's draft (or edit and resubmit a rejected one), or submit it
(`status: "submitted"`). Carries the `updatedAt` the client last read as the
optimistic-concurrency token.

- **Request:** any subset of the create fields, plus `updatedAt`.

  ```json
  { "portfolio": "…", "status": "submitted", "updatedAt": "2026-11-28T10:00:00.000Z" }
  ```

- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`. Any applicant write
  clears a previous review (`reviewNote`/`reviewedBy`/`reviewedAt`); a transition to
  `submitted` stamps `submittedAt`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `VERIFICATION_APPLICATION_NOT_FOUND` (404 — the caller
  has no application), `VERIFICATION_VALIDATION_FAILED` (400), `VERIFICATION_CONFLICT` (409 —
  the application is submitted/approved, or `updatedAt` did not match), `VERIFICATION_UNKNOWN`
  (500).

### 4.16 `GET /api/verification/applications`

The review queue. Requires an authenticated session with the `admin` role.

- **Query:** `?status=` — optional filter, one of `draft | submitted | approved | rejected`.
- **Success** `200`: `{ "applications": [ { "…ScholarVerification…" } ] }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `VERIFICATION_FORBIDDEN` (403 — authenticated
  non-admin), `VERIFICATION_VALIDATION_FAILED` (400 — unknown status filter),
  `VERIFICATION_UNKNOWN` (500).

### 4.17 `GET /api/verification/applications/[id]`

Fetch one application for review. Requires the `admin` role.

- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `VERIFICATION_FORBIDDEN` (403),
  `VERIFICATION_APPLICATION_NOT_FOUND` (404), `VERIFICATION_UNKNOWN` (500).

### 4.18 `PATCH /api/verification/applications/[id]`

Approve or reject a submitted application. Requires the `admin` role.

- **Request:** `{ "status": "approved" | "rejected", "reviewNote": "…", "updatedAt": "…" }`.
  `reviewNote` and `updatedAt` are optional; `status` is required.
- **Success** `200`: `{ "application": { "…ScholarVerification…" } }`. The reviewer and time are
  stamped (`reviewedBy`, `reviewedAt`). **On approval the route grants the applicant the
  `scholar` role** by calling identity's `grantUserRole` (the composition root in `app/**`);
  the grant is idempotent.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `VERIFICATION_FORBIDDEN` (403),
  `VERIFICATION_VALIDATION_FAILED` (400), `VERIFICATION_APPLICATION_NOT_FOUND` (404),
  `VERIFICATION_CONFLICT` (409 — the application is not `submitted`, or `updatedAt` did not
  match), `VERIFICATION_UNKNOWN` (500).

### 4.19 `GET /api/community/threads`

List discussion threads, newest first. Requires an authenticated session (any role). See
[community-slice.md](community-slice.md).

- **Query:** `?limit=&cursor=`
  - `limit` — page size, default `20`, clamped to `[1, 50]`.
  - `cursor` — opaque keyset cursor returned as `nextCursor` by a previous page.
- **Success** `200`:

  ```json
  {
    "threads": [ { "…CommunityThreadSummary…" } ],
    "nextCursor": "…"
  }
  ```

  Each summary is a `CommunityThread` plus a derived `replyCount`. `nextCursor` is present only
  when a further page exists. Threads moderated to `hidden` are omitted, and `replyCount` counts
  only visible replies ([community-moderation-slice.md](community-moderation-slice.md)).
- **Errors:** `AUTH_UNAUTHORIZED` (401 — no/invalid session), `COMMUNITY_INVALID_CURSOR` (400)
  when `cursor` is malformed, `COMMUNITY_UNKNOWN` (500).

### 4.20 `POST /api/community/threads`

Create a thread. Requires an authenticated session (any role).

- **Request**

  ```json
  { "title": "…", "body": "…", "category": "General" }
  ```

  `title` (1–200) and `body` (1–10000) are required and non-empty; `category` is optional
  (trimmed, 2–60) and defaults to `General`. The creating user is stamped as `authorId` from
  the session — the body never supplies it.
- **Success** `201`: `{ "thread": { "…CommunityThread…" } }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_VALIDATION_FAILED` (400),
  `COMMUNITY_UNKNOWN` (500).

### 4.21 `GET /api/community/threads/[id]`

Read one thread with its replies (chronological, oldest first). Requires an authenticated
session (any role).

- **Request:** `id` is the thread UUID path segment.
- **Success** `200`: `{ "thread": { "…CommunityThread…" }, "replies": [ { "…CommunityReply…" } ] }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_THREAD_NOT_FOUND` (404 — also returned when the
  thread is moderated to `hidden`, indistinguishable from an unknown thread),
  `COMMUNITY_UNKNOWN` (500). Hidden replies and the moderator audit fields are never returned to a
  member read.

### 4.22 `POST /api/community/threads/[id]/replies`

Add a reply to a thread. Requires an authenticated session (any role).

- **Request:** `{ "body": "…" }` (required, 1–10000). `authorId` is stamped from the session;
  the parent thread must exist.
- **Success** `201`: `{ "reply": { "…CommunityReply…" } }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_VALIDATION_FAILED` (400),
  `COMMUNITY_THREAD_NOT_FOUND` (404 — unknown or hidden parent thread),
  `COMMUNITY_THREAD_LOCKED` (409 — the thread is locked), `COMMUNITY_UNKNOWN` (500).
- **Side effect:** on a successful `201`, the route creates a `reply_posted` notification for the
  thread's author and the authors of its prior visible replies, excluding the replier
  ([reply-notifications-slice.md](reply-notifications-slice.md)). It is best-effort — the `201`
  response is unchanged even if a notification cannot be stored or delivered — and the notification
  carries no reply text and no replier identity.

### 4.23 `GET /api/search`

Unified keyword/metadata search over published research items and community threads. Requires
an authenticated session (any role). See [discovery-slice.md](discovery-slice.md).

- **Query:** `?q=&kind=&tag=&category=&author=&sort=&limit=`
  - `q` — required; trimmed, 1–120 characters. Every whitespace-separated token must appear
    (case-insensitively) in a document's title, body, or tag/category text.
  - `kind` — `all` (default) \| `research` \| `thread`.
  - `tag` — research-tag filter (restricts to research items).
  - `category` — community-category filter (restricts to threads).
  - `author` — an author id; narrows both research items and threads to that member.
  - `sort` — `relevance` (default) \| `newest`.
  - `limit` — default `20`, clamped to `[1, 50]`.
- **Success** `200`:

  ```json
  { "hits": [ { "…SearchHit…" } ], "total": 12 }
  ```

  Each hit is `{ kind, id, title, excerpt, tags, authorId?, createdAt, href, score }`. `href` is
  `/content/[id]` for research and `/community/[id]` for threads. `total` is the match count
  before the `limit` truncation.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `SEARCH_VALIDATION_FAILED` (400), `SEARCH_UNKNOWN` (500).

### 4.24 AI summarization on publish

Summarization has **no dedicated endpoint**. It runs inside the authoring writes
(§4.11, §4.12) when the write publishes the item, so it is reachable only through the
scholar/admin-gated authoring path. See
[ai-summarization-slice.md](ai-summarization-slice.md).

- **Trigger:** a publish transition — `POST` creating a `published` item, or `PATCH` moving a
  `draft` (or non-published item) to `published`. An edit to an already-published item does **not**
  regenerate.
- **Behaviour:** the item's `title` and `abstract` are sent to the configured summarization
  provider ([configuration.md](../configuration.md) → `AI_SUMMARY_DRIVER`), which returns an
  English summary and a Bangla (`bn-BD`) summary. The **Bangla** summary is persisted into the
  item's `summaryBn` **only when the author left it blank** — the author's own text always wins.
  The English summary is **never** persisted.
- **Success:** the publish response adds an optional transient block:

  ```json
  {
    "item": { "…ResearchItem with a non-empty summaryBn…" },
    "summary": { "summaryEn": "…", "summaryBn": "…" }
  }
  ```

  `summary` is present whenever the write published the item. A client may ignore it; only the
  English preview is lost. The `summaryBn` inside `summary` is the provider's output and may
  differ from the persisted `item.summaryBn` when the author's text was kept.
- **Failure:** if the provider call fails or returns an unusable response, the write is not
  attempted and the item stays as it was (a draft). The response is `502`/`503` with the codes
  below. A published item therefore always carries a non-empty `summaryBn`.
- **Schema relaxation:** `summaryBn` is optional to **save** (a draft stores `""`) and required to
  **publish**; a `published` item with an empty `summaryBn` is rejected with
  `CONTENT_VALIDATION_FAILED` (400).
- **Errors:** `AI_SUMMARY_FAILED` (502), `AI_UNAVAILABLE` (503), `AI_UNKNOWN` (500).

### 4.25 `GET /api/library`

List the caller's saved research items, hydrated to full research items, newest-saved first.
Requires an authenticated session (any role). See [library-slice.md](library-slice.md).

- **Query:** `?limit=`
  - `limit` — page size, default `20`, clamped to `[1, 50]`.
- **Success** `200`:

  ```json
  { "items": [ { "item": { "…ResearchItem…" }, "savedAt": "2026-11-28T10:00:00.000Z" } ], "total": 3 }
  ```

  Each entry pairs the hydrated research item with the save time. The composition root
  hydrates each saved `itemId` through the content module; a save whose item is no longer
  published (unpublished or deleted) is silently omitted, so `total` counts only the
  hydrated entries.
- **Errors:** `AUTH_UNAUTHORIZED` (401 — no/invalid session), `LIBRARY_VALIDATION_FAILED` (400),
  `LIBRARY_UNKNOWN` (500).

### 4.26 `POST /api/library/items`

Save a published research item to the caller's library. Requires an authenticated session
(any role).

- **Request:** `{ "itemId": "…" }` — `itemId` is a non-empty string (1–200 chars) naming a
  **published** research item. The published check is done at the composition root through the
  content module.
- **Success** `201`: `{ "item": { "userId": "…", "itemId": "…", "savedAt": "…" } }` — or `200`
  with the existing save when the item was already saved. The write is idempotent on
  `(userId, itemId)`, so a second save never creates a duplicate.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `LIBRARY_VALIDATION_FAILED` (400 — bad body),
  `LIBRARY_ITEM_NOT_FOUND` (404 — unknown or unpublished item), `LIBRARY_UNKNOWN` (500).

### 4.27 `DELETE /api/library/items/[id]`

Remove a saved item. Requires an authenticated session (any role).

- **Request:** `id` is the research-item id path segment.
- **Success** `200`: `{ "removed": true | false }` — idempotent; `false` when nothing was saved.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `LIBRARY_UNKNOWN` (500).

### 4.28 Member profile pages (no HTTP endpoint)

The member-profile slice adds **no** HTTP endpoint. `/profile` and `/u/[id]` are
server-rendered pages that read the existing public module surfaces in-process (identity
`getPublicProfile`, content `listPublishedItemsByAuthor`, community `listThreadsByAuthor`,
library `countSavedItems`) and never round-trip through the browser, so there is no new
contract to version here. See [member-profile-slice.md](member-profile-slice.md) and §7 for
how the pages are gated.

### 4.29 `GET /api/community/moderation/threads`

The moderator queue: discussion threads, newest first, **hidden ones included**. Requires an
authenticated session holding the `admin` role. See
[community-moderation-slice.md](community-moderation-slice.md).

- **Query:** `?limit=`
  - `limit` — page size, default `20`, clamped to `[1, 50]` (the same clamp as §4.19).
- **Success** `200`: `{ "threads": [ { "…CommunityThreadSummary…" } ] }` — each summary carries
  `moderationState` and `locked`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 4.30 `GET /api/community/moderation/threads/[id]`

Read one thread with **all** of its replies (hidden ones included, oldest first), plus the
moderator audit fields. Requires the `admin` role.

- **Request:** `id` is the thread UUID path segment.
- **Success** `200`:
  `{ "thread": { "…CommunityThread…" }, "replies": [ { "…CommunityReply…" } ] }`, with
  `moderatedBy`/`moderatedAt`/`moderationNote` present.
- **Errors:** `COMMUNITY_THREAD_NOT_FOUND` (404), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 4.31 `POST /api/community/moderation/threads/[id]`

Apply a thread moderation action. Requires the `admin` role.

- **Request:** `{ "action": "hide" | "restore" | "lock" | "unlock", "note": "…" }` — `action`
  is required; `note` is optional (trimmed, ≤ 500).
- **Success** `200`: `{ "thread": { "…CommunityThread…" } }` — the updated thread, with the
  action stamped as `moderatedBy`/`moderatedAt` (and `moderationNote` when supplied).
- **Behaviour:** on a `hide` action the route additionally notifies the thread's author through the
  `platform` channels (unless the moderator is the author); the response is **unchanged**, and the
  notification is created after the moderation write and is best-effort, so it can never fail the
  request. `restore`/`lock`/`unlock` notify no one. See
  [notifications-slice.md](notifications-slice.md) §6.4.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_THREAD_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 4.32 `POST /api/community/moderation/replies/[id]`

Apply a reply moderation action. Requires the `admin` role.

- **Request:** `{ "action": "hide" | "restore", "note": "…" }` — replies accept `hide` and
  `restore` only; `note` is optional (trimmed, ≤ 500).
- **Success** `200`: `{ "reply": { "…CommunityReply…" } }`.
- **Behaviour:** on a `hide` action the route additionally notifies the reply's author (unless the
  moderator is the author); the response is **unchanged**, and the notification is best-effort so it
  can never fail the request. `restore` notifies no one. See
  [notifications-slice.md](notifications-slice.md) §6.4.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_REPLY_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 4.33 `PATCH /api/auth/profile`

The owner-only account-email edit. Requires an authenticated session (any role); session-checked
from `okkhor_access`. See [password-reset-delivery-slice.md](password-reset-delivery-slice.md) §6.

- **Request:** `{ "email": "member@example.com" }` to set it, or `{ "email": "" }` to clear it.
  `email` is optional in the account and validated when present (≤ 160 chars); it is a secondary
  recovery contact, not an identifier — it is **not unique** and never appears in `PublicProfile`.
- **Success** `200`: `{ "user": { "…UserProfile…" } }` — the updated profile (with `email` present
  only when one is set).
- **Errors:** `AUTH_UNAUTHORIZED` (401 — no/invalid session), `AUTH_VALIDATION_FAILED` (400 — a
  malformed email).

### 4.34 `POST /api/community/reports`

A member reports a **visible** thread or reply. Requires an authenticated session (any role);
reporting is role-free, like posting. See
[member-reporting-slice.md](member-reporting-slice.md) §6.1.

- **Request:** `{ "targetType": "thread" | "reply", "targetId": "…", "reason": "…", "detail": "…" }`
  — `reason` is one of `spam`, `harassment`, `misinformation`, `off-topic`, `other`; `detail` is
  optional (trimmed, ≤ 1000).
- **Success** `200`: `{ "report": { "…CommunityReport…" } }` — the new report, or the caller's
  **pre-existing** report for the same item (idempotent: one report per member per item). The
  response always carries `status: "open"` for a new report.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_REPORT_TARGET_NOT_FOUND` (404 — the target is unknown **or** hidden, the same answer a
  member read gives), `COMMUNITY_UNKNOWN` (500).

### 4.35 `GET /api/community/moderation/reports`

The report queue: reports with the content they point at, newest first. Requires the `admin` role.
See [member-reporting-slice.md](member-reporting-slice.md) §6.2.

- **Query:** `?status=&limit=`
  - `status` — `open` | `resolved` | `dismissed`; default `open`.
  - `limit` — page size, default `20`, clamped to `[1, 50]`.
- **Success** `200`:
  `{ "entries": [ { "report": { "…CommunityReport…" }, "thread": { "…CommunityThread…" },
  "reply": { "…CommunityReply…" } } ] }` — `reply` is present only for a reply report. This is a
  moderator-only surface, so `report.reporterId` is present here and stripped from every
  member-facing response.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_UNKNOWN` (500).

### 4.36 `POST /api/community/moderation/reports/[id]`

Close a report as resolved or dismissed. Requires the `admin` role. Closing a report does **not**
change the reported content's visibility — hiding stays a separate moderation action (§4.31–§4.32).
See [member-reporting-slice.md](member-reporting-slice.md) §6.3.

- **Request:** `{ "action": "resolve" | "dismiss", "note": "…" }` — `action` is required; `note` is
  optional (trimmed, ≤ 500).
- **Success** `200`: `{ "report": { "…CommunityReport…" } }` — the closed report, with
  `status`/`resolvedBy`/`resolvedAt` (and `resolutionNote` when supplied).
- **Behaviour:** on a `resolve`/`dismiss` action the route additionally notifies the report's
  reporter (unless the moderator is the reporter); the response is **unchanged**, and the
  notification is best-effort so it can never fail the request. See
  [notifications-slice.md](notifications-slice.md) §6.4.
- **Errors:** `COMMUNITY_VALIDATION_FAILED` (400), `AUTH_UNAUTHORIZED` (401),
  `COMMUNITY_FORBIDDEN` (403), `COMMUNITY_REPORT_NOT_FOUND` (404), `COMMUNITY_UNKNOWN` (500).

### 4.37 `GET /api/notifications`

The caller's inbox, newest first. Requires an authenticated session (any role); owner-scoped to
that session's member. See [notifications-slice.md](notifications-slice.md) §6.1.

- **Query:** `?limit=` — page size, default `20`, clamped to `[1, 50]`.
- **Success** `200`: `{ "notifications": [ { "…Notification…" } ] }` — the caller's notifications,
  newest first.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_UNKNOWN` (500).

### 4.38 `POST /api/notifications/[id]/read`

Mark one of the caller's notifications read. Requires an authenticated session (any role);
owner-scoped. See [notifications-slice.md](notifications-slice.md) §6.2.

- **Request:** no body.
- **Success** `200`: `{ "notification": { "…Notification…" } }` — the notification with `readAt`
  set; repeated calls return the same read notification (idempotent).
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_NOT_FOUND` (404 — an unknown id **or** a
  notification that belongs to another member; the same response in both cases, so the path is not
  an existence oracle), `NOTIFICATION_UNKNOWN` (500).

### 4.39 `POST /api/notifications/read-all`

Mark every unread notification of the caller read. Requires an authenticated session (any role);
owner-scoped. See [notifications-slice.md](notifications-slice.md) §6.3.

- **Request:** no body.
- **Success** `200`: `{ "updated": 3 }` — the number of notifications marked read.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `NOTIFICATION_UNKNOWN` (500).

## 5. Rate Limiting

Applied to `register`, `login`, `password-reset/request`, and `password-reset/confirm`. The client
identifier is the first hop of `x-forwarded-for`, falling back to `x-real-ip`, falling back to the
constant `"unknown"`. Identifiers are SHA-256 hashed before being used as a key, so raw addresses
never enter the keyspace.

| Scope | Limit | Window |
| --- | --- | --- |
| `login` | 10 | 300 s |
| `register` | 5 | 3600 s |
| `passwordResetRequest` | 5 | 3600 s |
| `passwordResetConfirm` | 10 | 900 s (`PASSWORD_RESET_MAX_AGE_SECONDS`) |

The `passwordResetConfirm` window matches the reset code's lifetime, so a 6-digit code cannot be
brute-forced inside its validity ([password-reset-delivery-slice.md](password-reset-delivery-slice.md)
§7, §9).

Exceeding a budget returns `AUTH_RATE_LIMITED` (429). **Degradation rule:** if the ephemeral
store is unavailable, the request is allowed through (rate limiting must not fail the
request). See [data-models.md](data-models.md) §5.2 and `docs/configuration.md`.

## 6. Error Codes

| Code | Status | Meaning |
| --- | --- | --- |
| `AUTH_VALIDATION_FAILED` | 400 | Request body failed schema validation |
| `AUTH_USER_EXISTS` | 409 | Phone number already registered |
| `AUTH_INVALID_CREDENTIALS` | 401 | Unknown phone or wrong password |
| `AUTH_UNAUTHORIZED` | 401 | Missing/invalid session, user gone |
| `AUTH_TOKEN_INVALID` | 401 | Refresh token invalid |
| `AUTH_TOKEN_EXPIRED` | 401 | Token expired |
| `AUTH_RESET_INVALID` | 400 | Reset token unknown, used, or expired |
| `AUTH_FORBIDDEN` | 403 | Authenticated user lacks the required role (e.g. a non-admin role grant) |
| `AUTH_RATE_LIMITED` | 429 | Rate-limit budget exceeded |
| `AUTH_UNKNOWN` | 500 | Unhandled failure (fallback) |

The executable source of truth for the codes is
`src/modules/identity/domain/auth-errors.ts`; this table must be kept in sync with it.

The content endpoints use a parallel set of codes, whose executable source of truth is
`src/modules/content/domain/content-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `CONTENT_INVALID_CURSOR` | 400 | `cursor` query parameter is malformed |
| `CONTENT_VALIDATION_FAILED` | 400 | Write request body failed schema validation |
| `CONTENT_FORBIDDEN` | 403 | Authenticated user does not hold an author role |
| `CONTENT_ITEM_NOT_FOUND` | 404 | Id is unknown or the item is not published |
| `CONTENT_CONFLICT` | 409 | `updatedAt` did not match the stored version (stale write) |
| `CONTENT_UNKNOWN` | 500 | Unhandled failure (fallback) |

The verification endpoints use a parallel set of codes, whose executable source of truth is
`src/modules/verification/domain/verification-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `VERIFICATION_VALIDATION_FAILED` | 400 | Request body failed schema validation, or an incomplete submission |
| `VERIFICATION_FORBIDDEN` | 403 | Authenticated user does not hold the `admin` role |
| `VERIFICATION_APPLICATION_NOT_FOUND` | 404 | The caller has no application, or the id is unknown |
| `VERIFICATION_CONFLICT` | 409 | Duplicate application, a non-editable/non-reviewable state, or a stale write |
| `VERIFICATION_UNKNOWN` | 500 | Unhandled failure (fallback) |

The community endpoints use a parallel set of codes, whose executable source of truth is
`src/modules/community/domain/community-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `COMMUNITY_VALIDATION_FAILED` | 400 | Request body failed schema validation |
| `COMMUNITY_INVALID_CURSOR` | 400 | `cursor` query parameter is malformed |
| `COMMUNITY_FORBIDDEN` | 403 | Authenticated user does not hold the `admin` role |
| `COMMUNITY_THREAD_NOT_FOUND` | 404 | Thread id is unknown (or, on a member read, moderated to `hidden`) |
| `COMMUNITY_REPLY_NOT_FOUND` | 404 | Reply id is unknown |
| `COMMUNITY_REPORT_TARGET_NOT_FOUND` | 404 | The report target is unknown **or** hidden (the same answer a member read gives) |
| `COMMUNITY_REPORT_NOT_FOUND` | 404 | Report id is unknown |
| `COMMUNITY_THREAD_LOCKED` | 409 | A reply was attempted on a locked thread |
| `COMMUNITY_UNKNOWN` | 500 | Unhandled failure (fallback) |

The search endpoint uses a parallel set of codes, whose executable source of truth is
`src/modules/search/domain/search-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `SEARCH_VALIDATION_FAILED` | 400 | Query parameters failed schema validation (empty/over-long `q`, unknown `kind`/`sort`) |
| `SEARCH_UNKNOWN` | 500 | Unhandled failure (fallback) |

The AI summarization path (§4.24) uses a parallel set of codes, whose executable source of truth
is `src/modules/summarization/domain/summarization-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `AI_SUMMARY_FAILED` | 502 | The provider call failed or returned an empty/invalid summary |
| `AI_UNAVAILABLE` | 503 | Summarization is not configured (no provider credentials) |
| `AI_UNKNOWN` | 500 | Unhandled failure (fallback) |

The library endpoints (§4.25–§4.27) use a parallel set of codes, whose executable source of
truth is `src/modules/library/domain/library-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `LIBRARY_VALIDATION_FAILED` | 400 | Request body/query failed schema validation (missing `itemId`) |
| `LIBRARY_ITEM_NOT_FOUND` | 404 | The item to save does not exist or is not published |
| `LIBRARY_UNKNOWN` | 500 | Unhandled failure (fallback) |

The notifications endpoints (§4.37–§4.39) use a parallel set of codes, whose executable source of
truth is `src/modules/notifications/domain/notification-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `NOTIFICATION_NOT_FOUND` | 404 | The notification id is unknown **or** belongs to another member — the same response in both cases |
| `NOTIFICATION_UNKNOWN` | 500 | Unhandled failure (fallback) |

## 7. Route Protection (non-API)

The edge middleware (`middleware.ts`) gates page routes, not API routes:

- matchers: `/search/:path*`, `/community/:path*`, `/categories/:path*`, `/scholar-verify/:path*`, `/studio/:path*`, `/admin/:path*`, `/library/:path*`, `/notifications/:path*`, `/profile/:path*`
- behaviour: verify `okkhor_access` at the edge; on missing/invalid token redirect to
  `/auth?next=<original-path>`.

`/studio` is additionally gated server-side by role: the layout resolves the session and
renders the authoring UI only for `scholar`/`admin`, otherwise a restricted notice
(see [content-authoring-slice.md](content-authoring-slice.md) §7).

`/admin/verifications` is likewise gated server-side by role: the layout renders the review
queue only for `admin`, otherwise a restricted notice (see
[scholar-verification-slice.md](scholar-verification-slice.md)).

`/admin/community` is gated the same way: the layout renders the moderation queue only for
`admin`, otherwise a restricted notice, and every moderation use case asserts the rule again in
the application layer. The four moderation endpoints (§4.29–§4.32) on the `/admin/:path*`
matcher re-check the session defensively and return `COMMUNITY_FORBIDDEN` (403) to a
non-administrator (see [community-moderation-slice.md](community-moderation-slice.md)).

`/community`, `/community/new`, and `/community/[id]` are covered by the `/community/:path*`
matcher at the edge; the layout additionally resolves the session and renders the pages inside
the protected workspace chrome (see [community-slice.md](community-slice.md)). The community
endpoints (§4.19–§4.22) re-check the session defensively and return `AUTH_UNAUTHORIZED` (401)
without one — there is no role requirement.

`/search` is covered by the `/search/:path*` matcher at the edge; the layout additionally
resolves the session and renders the pages inside the protected workspace chrome. The
`GET /api/search` endpoint (§4.23) re-checks the session defensively and returns
`AUTH_UNAUTHORIZED` (401) without one. Because discovery is members-only, the search index
must never surface member-only community threads to anonymous visitors (`ADR-006`).

`/library` is covered by the `/library/:path*` matcher at the edge; the layout additionally
resolves the session and renders the page inside the protected workspace chrome. The three
library endpoints (§4.25–§4.27) re-check the session defensively and return `AUTH_UNAUTHORIZED`
(401) without one — there is no role requirement (any authenticated member may keep a library;
see [library-slice.md](library-slice.md)).

The `/content` and `/content/[id]` pages are **not** gated: the read path is intentionally
public (see `content-comprehension-slice.md`). The item detail page renders the `SaveItemButton`
island: an authenticated viewer gets the Save/Saved toggle, and an anonymous visitor gets a
sign-in affordance that returns to the item (`/auth?next=/content/[id]`).

`/profile` is covered by the `/profile/:path*` matcher at the edge; the layout additionally
resolves the session and renders the page inside the protected workspace chrome, and the page
re-checks the session and redirects to `/auth?next=/profile` without one
(see [member-profile-slice.md](member-profile-slice.md)). The `PATCH /api/auth/profile` endpoint
(§4.33), which edits the owner's account email, also re-checks the session from `okkhor_access`
and returns `AUTH_UNAUTHORIZED` (401) without one — it has no role requirement
([password-reset-delivery-slice.md](password-reset-delivery-slice.md) §7).

`/u/[id]` is intentionally **not** gated: a member's public footprint (display name, role
badge, member-since, and published items) is public, matching the public read path. The
members-only community-threads section is rendered only for a signed-in viewer; an anonymous
visitor gets a sign-in prompt (`/auth?next=/u/[id]`). An unknown id renders the route's
`not-found`. See [member-profile-slice.md](member-profile-slice.md) §7.

The browse surfaces split on audience. `/topics` (the browse index) and `/tags/[tag]`
(research by tag) are **not** gated: the research-tag reads are public, matching the public
read path, so the pages render for anonymous visitors too. Only the community-category
section of `/topics` is members-only: a signed-in viewer sees the category counts, an
anonymous visitor gets a sign-in prompt (`/auth?next=/topics`). `/categories/[category]`
(community threads by category) is covered by the `/categories/:path*` matcher at the edge;
the layout resolves the session and renders the page inside the protected workspace chrome,
and every category read filters `moderation_state = 'visible'` in the repository so a hidden
thread cannot leak through a count or list. There is **no new HTTP endpoint** for these
surfaces — they reuse the existing content/community modules' reads at the composition root
(see [topic-browse-slice.md](topic-browse-slice.md) §6–§7).

## 8. Client Usage

Browser helpers live in `src/modules/identity/client/session-client.ts`:

- `fetchSession()` → `GET /api/auth/session`
- `refreshSession()` → `POST /api/auth/refresh` (returns boolean)
- `ensureSession()` → `fetchSession()`, and on failure `refreshSession()` then retry
- `logoutSession()` → `POST /api/auth/logout`

All calls use `credentials: "include"` so the httpOnly cookies are sent.
