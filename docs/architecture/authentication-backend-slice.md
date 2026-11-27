# Authentication Backend Slice

## Purpose

This document defines the bootstrap backend authentication slice for Okkhor.

The current implementation exists to provide:

- phone-number-first account identity
- password-based credential validation for the server-backed phase
- JWT access and refresh token issuance
- protected route enforcement for restricted application surfaces
- password reset and session invalidation flows

This slice now supports pluggable persistence so the auth module can stay CI-safe in bootstrap mode while moving toward production infrastructure.

Current runtime behavior:

- `memory` driver for tests and explicitly requested non-durable local execution
- `PostgreSQL` driver when `DATABASE_URL` is present or `AUTH_STORAGE_DRIVER=postgres`
- a missing `DATABASE_URL` outside tests is a hard failure, not a silent fallback
- schema is managed through `node-pg-migrate`, not repository startup DDL

## Design Alignment

The implementation aligns with:

- `ADR-009` phone-first identity direction
- NBU UX guidance in `docs/architecture/nbu-ux-and-phone-first-identity.md`
- modular monolith boundaries already established in the repository

## Core Entities

### User Profile

- primary identifier: `phoneNumber`
- profile fields: `displayName`, `locale`, `roles`
- lifecycle fields: `createdAt`, `updatedAt`, `lastLoginAt`, `passwordUpdatedAt`

### Session Token Model

- `access token`: short-lived JWT stored in `httpOnly` cookie
- `refresh token`: longer-lived JWT stored in `httpOnly` cookie
- refresh sessions are stored server-side using a hash of the refresh token
- refresh rotation revokes the previous session record and issues a new token pair

### Credential Model

- password hash stored with `bcryptjs`
- password policy:
  - minimum 8 characters
  - at least 1 letter
  - at least 1 number
- phone numbers are normalized to Bangladesh `+880` format

## API Endpoints

### `POST /api/auth/register`

- creates a new account
- validates `phoneNumber`, `displayName`, `password`, `locale`, and `roles`
- returns sanitized user data and sets access/refresh cookies

### `POST /api/auth/login`

- validates phone number and password
- returns sanitized user data and sets access/refresh cookies

### `POST /api/auth/logout`

- revokes the current refresh session if present
- clears both auth cookies

### `POST /api/auth/refresh`

- validates the refresh token cookie
- rotates the refresh session
- issues a new access/refresh pair

### `GET /api/auth/session`

- validates the access token cookie
- returns the authenticated user and current session id

### `POST /api/auth/password-reset/request`

- accepts a phone number
- generates a time-limited reset token
- returns a preview token in this bootstrap phase for testability

### `POST /api/auth/password-reset/confirm`

- accepts reset token and new password
- updates password hash
- revokes all active sessions for the affected user

## Route Protection

Middleware currently protects:

- `/community`
- `/scholar-verify`

Unauthenticated requests are redirected to `/auth?next=...`.

## Persistence Drivers

### Memory Driver

- used for `NODE_ENV=test`
- selected explicitly with `AUTH_STORAGE_DRIVER=memory` for non-durable local work
- no longer a fallback for a missing `DATABASE_URL`
- preserves the fast bootstrap and CI path

### PostgreSQL Driver

- the default through `AUTH_STORAGE_DRIVER=postgres`
- activates automatically when `DATABASE_URL` is available unless `AUTH_STORAGE_DRIVER=memory`
- a missing `DATABASE_URL` outside tests is a hard failure rather than a silent fallback
- persists users, sessions, and password reset records across process restarts
- expects migrations to create and version these tables before app startup:
  - `auth_users`
  - `auth_sessions`
  - `auth_password_resets`
- tracks applied versions in `schema_migrations`

## Migration Operations

- migration tool: `node-pg-migrate`
- apply pending migrations: `npm run db:migrate`
- roll back the latest migration: `npm run db:migrate:down`
- roll back and re-apply the latest migration: `npm run db:migrate:redo`
- create a new versioned migration: `npm run db:migrate:create -- migration-name`

This aligns the auth slice with the handbook rule that migrations run before app startup and production schema changes never happen outside the migration workflow.

## PostgreSQL Full-Link Verification

Local PostgreSQL validation now uses `npm run db:verify:postgres`.

The verification workflow checks:

- network-level connectivity to the configured `DATABASE_URL`
- required table presence after migration application
- privilege compliance for auth tables and migration tracking
- CRUD operations across auth users, sessions, and reset records
- transaction rollback correctness
- pool reuse behavior under the configured connection settings

## Frontend Session Orchestration

Protected UI surfaces now use a client-side session workflow:

1. call `GET /api/auth/session`
2. if access token lookup fails, call `POST /api/auth/refresh`
3. retry `GET /api/auth/session`
4. if refresh still fails, redirect to `/auth?next=...`

This gives the current bootstrap app:

- protected workspace restoration after reload
- visible authenticated identity state inside `Community` and `Scholar Verify`
- explicit logout from protected surfaces
- a direct continue path from `/auth` when a valid session already exists

The `/auth` gateway now also:

- sanitizes `next` destinations so only safe internal paths are used after sign-in
- attempts refresh-based recovery on the auth page before asking the user to sign in again
- auto-redirects restored sessions to the requested protected route
- hands OTP demo completion into the credential-backed panel by pre-filling the verified phone number

## Error Handling

Structured auth errors are returned with explicit codes:

- `AUTH_VALIDATION_FAILED`
- `AUTH_USER_EXISTS`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_UNAUTHORIZED`
- `AUTH_TOKEN_INVALID`
- `AUTH_RESET_INVALID`

Unknown failures return a generic `AUTH_UNKNOWN` response.

## Security Review

### Implemented Protections

- `httpOnly` cookies for access and refresh tokens
- `sameSite=lax` cookie policy
- refresh token hashing before server-side storage
- password hashing via `bcryptjs`
- session revocation on logout
- session revocation after password reset
- route protection middleware for restricted pages
- normalized phone validation to reduce credential ambiguity

### Bootstrap Risks and Mitigations

- **Migration drift or skipped migration execution**
  - risk: PostgreSQL-backed runtime fails if the app starts against an unmigrated schema
  - mitigation: run `npm run db:migrate` before startup in every environment and use `npm run db:verify:postgres` during local validation

- **Fallback JWT secret**
  - risk: development fallback secret is unsafe for production
  - mitigation: set `AUTH_JWT_SECRET` in every deployed environment before release

- **Reset token preview response**
  - risk: preview token must never be exposed in production-grade delivery
  - mitigation: replace with SMS or trusted out-of-band delivery before production launch

- **Access-token-only middleware validation**
  - risk: if the access token expires before the client refreshes, users are redirected to auth
  - mitigation: the auth gateway now retries refresh and restores the session when the refresh cookie is still valid; edge-safe refresh delegation remains a next-phase enhancement

- **Unsanitized post-auth redirect targets**
  - risk: unvalidated `next` values can create redirect abuse or navigation loops
  - mitigation: all auth-page redirects now pass through safe internal path validation with a protected fallback destination

## Recommended Next Step

Extend the persistence slice toward full production infrastructure:

- Redis-backed session acceleration and revocation fan-out where justified
- SMS/OTP provider integration for proof-of-possession flows
- audited secret management for JWT key rotation
