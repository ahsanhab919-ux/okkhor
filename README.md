# Okkhor

Okkhor powers Journal Club Asia, a knowledge platform focused on research comprehension for South Asian learners.

## Repository Status

- Visibility: public
- Default branch: `main`
- Stack baseline: `Next.js App Router`, `TypeScript`, `Vitest`, `GitHub Actions`
- Architecture direction: `Modular Monolith`
- UI baseline: `Okkhor premium archive landing`, `Community Hub`, `Scholar verification flow`

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and verify the health endpoint at `http://localhost:3000/api/health`.

## Primary Routes

- `/` - premium archive landing and scholar conversion surface
- `/auth` - phone-number-first UI plus credential-backed backend auth flow
- `/community` - discussion-led community hub, now middleware-protected
- `/scholar-verify` - multi-step scholar verification credentials flow, now middleware-protected
- `/api/health` - runtime health endpoint

## Authentication Slice

- Identity baseline: `phone-number-first`
- Backend credential path: `phone + password`
- Session model: `JWT access cookie + JWT refresh cookie`
- Persistence drivers: `memory` by default, `PostgreSQL` automatically when `DATABASE_URL` is configured
- Schema management: `node-pg-migrate` versioned migrations with rollback support
- Frontend session behavior: `session lookup -> refresh retry -> protected workspace restore`
- Auth gateway behavior: `safe next-path validation -> auth-page refresh recovery -> redirect to requested protected route`
- Password reset: `request` and `confirm` endpoints included
- Architecture reference: `docs/architecture/authentication-backend-slice.md`
- Configuration reference: `docs/configuration.md`

## Environment Notes

- copy `.env.example` to `.env.local` before local PostgreSQL validation
- `AUTH_STORAGE_DRIVER=auto` keeps tests and zero-config local runs on the in-memory driver
- `AUTH_STORAGE_DRIVER=postgres` requires `DATABASE_URL`
- run `npm run db:migrate` before using the PostgreSQL-backed auth path
- run `npm run db:verify:postgres` to validate connectivity, privileges, CRUD, rollback, and pool reuse

## Validation Commands

```bash
npm run db:migrate
npm run db:verify:postgres
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

## Repository Standards

- Engineering process: `ENGINEERING_HANDBOOK.md`
- Contribution workflow: `CONTRIBUTING.md`
- Branch protection policy: `docs/standards/BRANCH_PROTECTION_RULES.md`
- Execution trace: `REPOSITORY_INFRA_EXECUTION_LOG.md`
