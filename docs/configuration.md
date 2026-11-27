# Configuration Reference

## Local Environment Bootstrap

1. Copy `.env.example` to `.env.local`.
2. Set a real `AUTH_JWT_SECRET`.
3. Set `AUTH_STORAGE_DRIVER=postgres` (the example default) for durable work; use `memory` only for non-durable local work.
4. Set `DATABASE_URL` to your local PostgreSQL instance.
5. Run `npm run db:migrate` before `npm run dev`.

## Local PostgreSQL

`infrastructure/docker-compose.yml` provisions a local PostgreSQL instance that matches the `DATABASE_URL` example below.

- start: `docker compose -f infrastructure/docker-compose.yml up -d`
- stop: `docker compose -f infrastructure/docker-compose.yml down`
- stop and delete data: `docker compose -f infrastructure/docker-compose.yml down -v`

The instance listens on `localhost:5432` with database `okkhor`, user `postgres`, and password `postgres`. Data lives in the `okkhor-postgres-data` volume, so it survives `down` and container restarts.

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

## Migration Operations

- apply migrations: `npm run db:migrate`
- roll back one migration: `npm run db:migrate:down`
- roll back and re-apply the latest migration: `npm run db:migrate:redo`
- create a new migration: `npm run db:migrate:create -- migration-name`

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
