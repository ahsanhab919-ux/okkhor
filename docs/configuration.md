# Configuration Reference

## Local Environment Bootstrap

1. Copy `.env.example` to `.env.local`.
2. Set a real `AUTH_JWT_SECRET`.
3. Set `AUTH_STORAGE_DRIVER=postgres` (the example default) for durable work; use `memory` only for non-durable local work.
4. Set `CONTENT_STORAGE_DRIVER=postgres` (the example default) for durable content; use `memory` only for non-durable local work.
5. Set `VERIFICATION_STORAGE_DRIVER=postgres` (the example default) for durable scholar-verification applications; use `memory` only for non-durable local work.
6. Set `COMMUNITY_STORAGE_DRIVER=postgres` (the example default) for durable community threads and replies; use `memory` only for non-durable local work.
7. Set `SEARCH_STORAGE_DRIVER=postgres` (the example default) for durable discovery search; use `memory` only for non-durable local work.
8. Set `LIBRARY_STORAGE_DRIVER=postgres` (the example default) for durable per-member saved items ("My Library"); use `memory` only for non-durable local work.
9. AI summarization is optional locally. Leave `AI_SUMMARY_DRIVER=auto` and set `GEMINI_API_KEY` to exercise the Gemini provider, or set `AI_SUMMARY_DRIVER=fake` to run the deterministic offline provider. Without a key, `auto` returns `AI_UNAVAILABLE` (503) when a publish tries to summarize.
10. Set `DATABASE_URL` to your local PostgreSQL instance.
11. Run `npm run db:migrate` before `npm run dev`.
12. Optionally run `npm run db:seed:content` to insert illustrative research items into `content_items`.
13. Redis is optional. To exercise the Redis path locally, start it (see below) and leave `EPHEMERAL_STORAGE_DRIVER=auto` with `REDIS_URL` set. Without `REDIS_URL` the application falls back to in-memory ephemeral state.

## Local PostgreSQL

`infrastructure/docker-compose.yml` provisions a local PostgreSQL instance that matches the `DATABASE_URL` example below.

- start: `docker compose -f infrastructure/docker-compose.yml up -d`
- stop: `docker compose -f infrastructure/docker-compose.yml down`
- stop and delete data: `docker compose -f infrastructure/docker-compose.yml down -v`

The instance listens on `localhost:5432` with database `okkhor`, user `postgres`, and password `postgres`. Data lives in the `okkhor-postgres-data` volume, so it survives `down` and container restarts.

## Local Redis

`infrastructure/docker-compose.yml` also provisions a local Redis instance that matches the `REDIS_URL` example below. It is optional: the application runs without it.

- start: `docker compose -f infrastructure/docker-compose.yml up -d redis`
- stop: `docker compose -f infrastructure/docker-compose.yml down`

The instance listens on `localhost:6379`. Persistence is deliberately disabled (no RDB snapshots, no AOF), because Redis holds cache and ephemeral state only and is never the source of truth (`ADR-005`).

## Ephemeral State

Ephemeral state is reached through one boundary in `src/modules/platform/infrastructure/ephemeral-store.ts`. Every key class it serves is short-lived, reconstructible, or safe to drop, and losing the store must degrade behaviour rather than lose data.

Key convention: every key is namespaced `okkhor:<class>:<name>[:<hashed-identifier>]`. Identifiers that could carry personal data, such as a client address, are hashed before they reach a key so raw values never appear in the keyspace or in logs.

| Key class | Namespace | TTL | Invalidation |
| --- | --- | --- | --- |
| Auth rate-limit counter (login) | `okkhor:ratelimit:auth:login:<hash>` | `300s` | automatic expiry; window budget is `10` attempts |
| Auth rate-limit counter (register) | `okkhor:ratelimit:auth:register:<hash>` | `3600s` | automatic expiry; window budget is `5` attempts |
| Auth rate-limit counter (password reset) | `okkhor:ratelimit:auth:password-reset:<hash>` | `3600s` | automatic expiry; window budget is `5` attempts |

TTL defaults are set on first write and are never extended on later writes, so a counter window always closes a fixed interval after it started. No manual invalidation is required; every key class expires on its own and is safe to lose at any time.

## Variables

### `AUTH_JWT_SECRET`

- required for non-demo environments
- signs access and refresh tokens

### `AUTH_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `CONTENT_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- selects the `content` module's repository only; it is independent of `AUTH_STORAGE_DRIVER`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `VERIFICATION_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- selects the `verification` module's repository only; it is independent of `AUTH_STORAGE_DRIVER` and `CONTENT_STORAGE_DRIVER`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `COMMUNITY_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- selects the `community` module's repository only; it is independent of `AUTH_STORAGE_DRIVER`, `CONTENT_STORAGE_DRIVER`, and `VERIFICATION_STORAGE_DRIVER`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `SEARCH_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- selects the `search` module's read-only repository only; it is independent of `AUTH_STORAGE_DRIVER`, `CONTENT_STORAGE_DRIVER`, `VERIFICATION_STORAGE_DRIVER`, and `COMMUNITY_STORAGE_DRIVER`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository (which projects the content and community memory stores) and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `LIBRARY_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `postgres`
- selects the `library` module's repository only; it is independent of `AUTH_STORAGE_DRIVER`, `CONTENT_STORAGE_DRIVER`, `VERIFICATION_STORAGE_DRIVER`, `COMMUNITY_STORAGE_DRIVER`, and `SEARCH_STORAGE_DRIVER`
- `postgres` forces the PostgreSQL repository and requires `DATABASE_URL`; this is the example default
- `memory` forces the in-memory repository and is only valid for local, non-durable work and tests
- `auto` uses `memory` when `NODE_ENV=test`, and PostgreSQL when `DATABASE_URL` is present
- outside tests, `auto` or `postgres` without a `DATABASE_URL` fails loudly instead of falling back to `memory`

### `AI_SUMMARY_DRIVER`

- supported values: `auto`, `fake`, `gemini`
- selects the `summarization` module's provider (there is no repository or store)
- `fake` forces the deterministic offline provider (no network); useful for local work and tests
- `gemini` forces the Google Gemini provider and requires `GEMINI_API_KEY`
- `auto` (the default) uses `fake` when `NODE_ENV=test`, `gemini` when `GEMINI_API_KEY` is present, and otherwise fails with `AI_UNAVAILABLE` (503) when a publish tries to summarize
- independent of the storage drivers above; only scholars/admins can trigger a summarization call (on publish)

### `GEMINI_API_KEY`

- the Google Gemini API key used by the `gemini` provider
- read only in `src/modules/summarization/infrastructure/gemini-summary-provider.ts`
- when unset, `AI_SUMMARY_DRIVER=auto` returns `AI_UNAVAILABLE` (503) for a publish that needs a summary

### `GEMINI_MODEL`

- the Gemini model id passed to `generateContent`
- default: `gemini-2.0-flash`

### `AI_SUMMARY_TIMEOUT_MS`

- how long a single summarization call may run before it is aborted
- default: `15000`
- an aborted or failed call surfaces as `AI_SUMMARY_FAILED` (502) and the publish is rejected

### `DATABASE_URL`

- PostgreSQL connection string for migrations and runtime queries
- local example: `postgres://postgres:postgres@localhost:5432/okkhor`

### `DB_POOL_MAX`

- maximum PostgreSQL connections per application process
- default: `10`

### `DB_POOL_IDLE_TIMEOUT_MS`

- how long idle pooled connections stay open
- default: `10000`

### `DB_POOL_CONNECTION_TIMEOUT_MS`

- maximum wait time for opening a new PostgreSQL connection
- default: `5000`

### `DB_POOL_MAX_USES`

- maximum reuse count per connection before recycling
- default: `7500`

### `EPHEMERAL_STORAGE_DRIVER`

- supported values: `auto`, `memory`, `redis`
- `redis` forces the Redis-backed ephemeral store and requires `REDIS_URL`
- `memory` forces the in-memory ephemeral store; state is process-local and not shared across instances
- `auto` (the default) uses `memory` when `NODE_ENV=test`, Redis when `REDIS_URL` is present, and `memory` otherwise
- Redis is optional: the application runs with or without it, and falls back to `memory` when `REDIS_URL` is unset

### `REDIS_URL`

- Redis connection string for the ephemeral store (cache, rate-limit counters, and short-lived state)
- local example: `redis://localhost:6379`
- never the source of truth; unset it to run without Redis

## Migration Operations

- apply migrations: `npm run db:migrate`
- roll back one migration: `npm run db:migrate:down`
- roll back and re-apply the latest migration: `npm run db:migrate:redo`
- create a new migration: `npm run db:migrate:create -- migration-name`
- seed illustrative content items: `npm run db:seed:content` (upserts the `content` module's sample rows; re-runnable)

## PostgreSQL Full-Link Verification

- ensure `.env.local` points to a running PostgreSQL instance
- run `npm run db:migrate`
- run `npm run db:verify:postgres`

The verification script checks:

- network-level connectivity
- required table presence
- table privileges
- CRUD operations
- transaction rollback behavior
- pool reuse behavior
