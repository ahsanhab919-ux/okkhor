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
  codes (see §4.19–§4.22 and §6), and the library endpoints with their own `LIBRARY_*`
  codes (see §4.25–§4.27 and §6).
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
    "roles": ["learner"]
  }
  ```

  `phoneNumber` is normalized to the `+880` form before storage; `locale` defaults to
  `bn-BD`; `roles` defaults to `["learner"]`. `password` must be ≥ 8 characters with at least
  one letter and one number.

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

  When the account exists, the response additionally includes `resetTokenPreview` and
  `expiresAt`. **Delivery of the token is not yet implemented** (no SMS/email channel); the
  preview is the current handoff mechanism.

- **Errors:** `AUTH_VALIDATION_FAILED` (400), `AUTH_RATE_LIMITED` (429).

### 4.7 `POST /api/auth/password-reset/confirm`

- **Request:** `{ "token": "…", "newPassword": "newsecret123" }` (`token` ≥ 16 chars).
- **Success** `200`: `{ "success": true, "message": "Password updated successfully." }`.
- **Side effects:** the password hash and `passwordUpdatedAt` are updated, the reset token is
  marked used, and **all active sessions for the user are revoked**.
- **Errors:** `AUTH_RESET_INVALID` (400 — unknown, used, or expired token),
  `AUTH_VALIDATION_FAILED` (400).

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
  when a further page exists.
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
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_THREAD_NOT_FOUND` (404),
  `COMMUNITY_UNKNOWN` (500).

### 4.22 `POST /api/community/threads/[id]/replies`

Add a reply to a thread. Requires an authenticated session (any role).

- **Request:** `{ "body": "…" }` (required, 1–10000). `authorId` is stamped from the session;
  the parent thread must exist.
- **Success** `201`: `{ "reply": { "…CommunityReply…" } }`.
- **Errors:** `AUTH_UNAUTHORIZED` (401), `COMMUNITY_VALIDATION_FAILED` (400),
  `COMMUNITY_THREAD_NOT_FOUND` (404 — unknown parent thread), `COMMUNITY_UNKNOWN` (500).

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

## 5. Rate Limiting

Applied to `register`, `login`, and `password-reset/request`. The client identifier is the
first hop of `x-forwarded-for`, falling back to `x-real-ip`, falling back to the constant
`"unknown"`. Identifiers are SHA-256 hashed before being used as a key, so raw addresses
never enter the keyspace.

| Scope | Limit | Window |
| --- | --- | --- |
| `login` | 10 | 300 s |
| `register` | 5 | 3600 s |
| `passwordResetRequest` | 5 | 3600 s |

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
| `COMMUNITY_THREAD_NOT_FOUND` | 404 | Thread id is unknown |
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

## 7. Route Protection (non-API)

The edge middleware (`middleware.ts`) gates page routes, not API routes:

- matchers: `/search/:path*`, `/community/:path*`, `/scholar-verify/:path*`, `/studio/:path*`, `/admin/:path*`, `/library/:path*`
- behaviour: verify `okkhor_access` at the edge; on missing/invalid token redirect to
  `/auth?next=<original-path>`.

`/studio` is additionally gated server-side by role: the layout resolves the session and
renders the authoring UI only for `scholar`/`admin`, otherwise a restricted notice
(see [content-authoring-slice.md](content-authoring-slice.md) §7).

`/admin/verifications` is likewise gated server-side by role: the layout renders the review
queue only for `admin`, otherwise a restricted notice (see
[scholar-verification-slice.md](scholar-verification-slice.md)).

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

## 8. Client Usage

Browser helpers live in `src/modules/identity/client/session-client.ts`:

- `fetchSession()` → `GET /api/auth/session`
- `refreshSession()` → `POST /api/auth/refresh` (returns boolean)
- `ensureSession()` → `fetchSession()`, and on failure `refreshSession()` then retry
- `logoutSession()` → `POST /api/auth/logout`

All calls use `credentials: "include"` so the httpOnly cookies are sent.
