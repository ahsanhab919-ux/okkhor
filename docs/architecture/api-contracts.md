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
  with status `500`.
- **Validation:** request bodies are validated with Zod schemas in
  `src/modules/identity/domain/auth-schemas.ts`. The first validation issue message becomes
  the `AUTH_VALIDATION_FAILED` message (`400`).

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
| `AUTH_RATE_LIMITED` | 429 | Rate-limit budget exceeded |
| `AUTH_UNKNOWN` | 500 | Unhandled failure (fallback) |

The executable source of truth for the codes is
`src/modules/identity/domain/auth-errors.ts`; this table must be kept in sync with it.

## 7. Route Protection (non-API)

The edge middleware (`middleware.ts`) gates page routes, not API routes:

- matchers: `/community/:path*`, `/scholar-verify/:path*`
- behaviour: verify `okkhor_access` at the edge; on missing/invalid token redirect to
  `/auth?next=<original-path>`.

## 8. Client Usage

Browser helpers live in `src/modules/identity/client/session-client.ts`:

- `fetchSession()` → `GET /api/auth/session`
- `refreshSession()` → `POST /api/auth/refresh` (returns boolean)
- `ensureSession()` → `fetchSession()`, and on failure `refreshSession()` then retry
- `logoutSession()` → `POST /api/auth/logout`

All calls use `credentials: "include"` so the httpOnly cookies are sent.
