# Data Models

- Status: `Active`
- Related ADRs: `ADR-004` (PostgreSQL), `ADR-005` (Redis)
- Owner: `Engineering Lead`

## 1. Purpose

Define the data the system owns: the domain types the code speaks in, the PostgreSQL schema
that persists them, the in-memory equivalent used in tests, and the optional ephemeral store.
This is the schema of record for the `auth_*` tables, `content_items`,
`scholar_verifications`, `community_threads`, and `community_replies`, and the contract every
repository implementation must satisfy.

## 2. Domain Types

Identity types are defined in `src/modules/identity/domain/auth-types.ts` (§2.1–§2.5),
content types in `src/modules/content/domain/content-types.ts` (§2.6), verification types
in `src/modules/verification/domain/verification-types.ts` (§2.7), and community types in
`src/modules/community/domain/community-types.ts` (§2.8). Types are the shared language;
storage is an implementation detail behind each module's repository interface
(`AuthRepository`, `ContentRepository`, `VerificationRepository`, `CommunityRepository`).

### 2.1 `UserProfile`

The publicly safe view of a user (no secrets).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID, primary key |
| `phoneNumber` | `string` | Normalized `+880…`, unique |
| `displayName` | `string` | 2–80 chars |
| `locale` | `string` | Defaults to `bn-BD` |
| `roles` | `("learner" \| "scholar" \| "admin")[]` | Defaults to `["learner"]` |
| `createdAt` | `string` (ISO) | |
| `updatedAt` | `string` (ISO) | |
| `lastLoginAt` | `string` (ISO), optional | Set on session creation |
| `passwordUpdatedAt` | `string` (ISO) | Set on register and password reset |

### 2.2 `UserRecord = UserProfile & { passwordHash: string }`

The stored form. `passwordHash` never leaves the application layer — `sanitizeUser()`
strips it before any value is returned to a route or a client.

### 2.3 `AuthSessionRecord`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID |
| `userId` | `string` | FK → `auth_users.id` |
| `refreshTokenHash` | `string` | SHA-256 of the refresh token (never the raw token) |
| `createdAt` | `string` (ISO) | |
| `expiresAt` | `string` (ISO) | Refresh-token lifetime |
| `revokedAt` | `string` (ISO), optional | Set on logout, refresh rotation, or password reset |

### 2.4 `PasswordResetRecord`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID |
| `userId` | `string` | FK → `auth_users.id` |
| `tokenHash` | `string` | SHA-256 of the reset token, unique |
| `createdAt` | `string` (ISO) | |
| `expiresAt` | `string` (ISO) | |
| `usedAt` | `string` (ISO), optional | Set on successful confirm |

### 2.5 Token claim types

`AccessTokenClaims` (`sub`, `sessionId`, `phoneNumber`, `roles`, `type: "access"`) and
`RefreshTokenClaims` (`sub`, `sessionId`, `type: "refresh"`) describe the JWT payloads. The
raw token values are only ever held in memory or in httpOnly cookies — persisted state keeps
the SHA-256 *hash* of the refresh token, and reset tokens are likewise only stored hashed.

### 2.6 `ResearchItem` (content)

The published research-comprehension unit. Defined in
`src/modules/content/domain/content-types.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID, primary key, used as the `/content/[id]` path segment |
| `title` | `string` | Source-language title |
| `abstract` | `string` | Source-language abstract |
| `summaryBn` | `string` | Bangla comprehension summary (the product value) |
| `sourceLanguage` | `string` | Abstract language, defaults to `en` |
| `tags` | `string[]` | Stored as `jsonb` |
| `status` | `"draft" \| "published"` | Only `published` items are listable/readable |
| `sourceUrl` | `string`, optional | External source link |
| `publishedAt` | `string` (ISO), optional | Keyset-pagination sort key |
| `authorId` | `string`, optional | Set on create; the authoring user (see `content-authoring-slice.md`) |
| `updatedBy` | `string`, optional | Set on create and every update |
| `createdAt` | `string` (ISO) | |
| `updatedAt` | `string` (ISO) | Doubles as the optimistic-concurrency token |

Related types: `ResearchItemStatus`, `ContentAuthor` (`{ id, roles }`), `CreateItemInput`,
`UpdateItemInput` (adds the optional `updatedAt` concurrency token), and `ContentRepository`
(`listPublishedItems`, `listItems`, `getPublishedItemById`, `getItemById`, `createItem`,
`updateItemIfUnchanged`). `listPublishedItems`/`getPublishedItemById` are the public read path
(published only); `listItems`/`getItemById` are the authoring path and return drafts too.
Pagination types: `ContentCursor = { publishedAt, id }`, `ListPublishedItemsOptions`,
`ListPublishedItemsResult`.

### 2.7 `ScholarVerification` (verification)

The scholar-verification application. Defined in
`src/modules/verification/domain/verification-types.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID, primary key |
| `applicantId` | `string` | The applying user; unique (one application per user) |
| `status` | `"draft" \| "submitted" \| "approved" \| "rejected"` | Applicant-editable while `draft`/`rejected`; reviewable while `submitted` |
| `displayName` | `string` | Public-facing name |
| `degrees` | `VerificationDegree[]` | Stored as `jsonb`; each `{ degreeType, institution, year, evidenceUrl? }` |
| `affiliations` | `VerificationAffiliation[]` | Stored as `jsonb`; each `{ role, organization, since, evidenceUrl? }` |
| `portfolio` | `string` | Selected publications / documentary work |
| `specializations` | `string[]` | Stored as `jsonb` |
| `languages` | `string[]` | Stored as `jsonb` |
| `reviewNote` | `string`, optional | Set on a decision; cleared on any applicant write |
| `reviewedBy` | `string`, optional | Admin id that decided the application |
| `submittedAt` | `string` (ISO), optional | Stamped on every transition to `submitted` |
| `reviewedAt` | `string` (ISO), optional | Stamped on a decision |
| `createdAt` | `string` (ISO) | |
| `updatedAt` | `string` (ISO) | Doubles as the optimistic-concurrency token |

Related types: `VerificationStatus`, `VerificationDegree`, `VerificationAffiliation`,
`VerificationActor` (`{ id, roles }`), `SaveVerificationInput` (all fields optional; `status`
restricted to `draft | submitted`), `DecideVerificationInput` (`status: approved | rejected`),
and `VerificationRepository` (`getByApplicantId`, `getById`, `listByStatus`, `create`,
`updateIfUnchanged`). The role rule (`canReview`, admins only) and the state rule
(`canApplicantEdit`, `canReviewStatus`) live in `verification-authorization.ts` and
`verification-state.ts`.

### 2.8 `CommunityThread` and `CommunityReply` (community)

The member-authored discussion thread and its replies. Defined in
`src/modules/community/domain/community-types.ts`.

`CommunityThread`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID, primary key, used as the `/community/[id]` path segment |
| `authorId` | `string` | The creating member, stamped from the session |
| `title` | `string` | 1–200 chars |
| `body` | `string` | 1–10000 chars |
| `category` | `string` | Free-text label (trimmed, 2–60), default `General` |
| `createdAt` | `string` (ISO) | List sort key |
| `updatedAt` | `string` (ISO) | |

`CommunityReply`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUID, primary key |
| `threadId` | `string` | The parent thread |
| `authorId` | `string` | The replying member, stamped from the session |
| `body` | `string` | 1–10000 chars |
| `createdAt` | `string` (ISO) | Reply sort key (ascending) |

Related types: `CommunityThreadSummary` (`CommunityThread & { replyCount }`, derived on the list
read), `CommunityThreadDetail` (`{ thread, replies }`), `CommunityActor` (`{ id, roles }`),
`CreateThreadInput`, `CreateReplyInput`, `CommunityCursor = { createdAt, id }`,
`ListThreadsOptions`, `ListThreadsResult`, and `CommunityRepository` (`listThreads`,
`getThreadById`, `createThread`, `listRepliesByThreadId`, `createReply`). `replyCount` is
derived, never stored — a correlated subquery in PostgreSQL, a scan over the replies map in
memory.

### 2.9 Search read model (search)

The discovery read model. These types are **derived** — nothing here is persisted; `search`
projects published research and community threads into a flat list at read time. Defined in
`src/modules/search/domain/search-types.ts`.

`SearchKind` = `"research" | "thread"`; `SearchSort` = `"relevance" | "newest"`.

`SearchDocument` (a projection of one `ResearchItem` or `CommunityThread`):

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `SearchKind` | Which source produced the row |
| `id` | `string` | Source row id |
| `title` | `string` | Scored field |
| `body` | `string` | Research: `abstract + summaryBn`; thread: `body`. Scored field |
| `tags` | `string[]` | Research tags, or the thread category. Scored field |
| `authorId` | `string?` | For the author filter |
| `createdAt` | `string` (ISO) | Sort key |

`SearchQuery` — what the repository receives: `{ tokens, kind?, tags?, category?, authorId?,
limit }`. `tokens` are lower-cased query words; the repository requires **every** token to
appear (AND), case-insensitively, in the title, body, or tag text.

`SearchCriteria` — the normalized query the service works with: `{ query, kind?, tag?,
category?, author?, sort, limit }`.

`SearchHit` — a scored `SearchDocument`: `{ kind, id, title, excerpt, tags, authorId?,
createdAt, href, score }`. `excerpt` is the body trimmed to 180 chars with a `…` suffix;
`href` is `/content/[id]` for research and `/community/[id]` for threads.

`SearchResult` = `{ hits: SearchHit[]; total: number }` — `hits` is the paginated slice,
`total` is the count before slicing.

`SearchRepository` = `{ searchDocuments(query: SearchQuery): Promise<SearchDocument[]> }`. The
in-memory implementation composes the content and community memory stores; the PostgreSQL
implementation runs an `ILIKE`-per-token query over `content_items` (`status = 'published'`)
and `community_threads`.

## 3. PostgreSQL Schema

The `auth_*` tables (§3.1–§3.3) are created by
`migrations/20260718222000_create_auth_identity_tables.cjs`; `content_items` (§3.4) by
`migrations/20261128090000_create_content_items.cjs`, with the authorship columns added by
`migrations/20261128100000_add_content_item_authorship.cjs` (see `content-authoring-slice.md`),
and `scholar_verifications` (§3.5) by
`migrations/20261128110000_create_scholar_verifications.cjs` (see
`scholar-verification-slice.md`), and `community_threads`/`community_replies` (§3.6–§3.7) by
`migrations/20261128120000_create_community_tables.cjs` (see `community-slice.md`).
Timestamps are stored as ISO-8601
`text` (not `timestamptz`) because the domain deals in ISO strings and SQLite-free
portability is preferred over database-side timezone arithmetic; `roles`, `tags`, `degrees`,
`affiliations`, `specializations`, and `languages` are `jsonb`.

### 3.1 `auth_users`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `phone_number` | `text` | not null, **unique** |
| `display_name` | `text` | not null |
| `locale` | `text` | not null |
| `roles` | `jsonb` | not null |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |
| `last_login_at` | `text` | nullable |
| `password_updated_at` | `text` | not null |
| `password_hash` | `text` | not null |

### 3.2 `auth_sessions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `user_id` | `text` | not null, FK → `auth_users(id)` `ON DELETE CASCADE` |
| `refresh_token_hash` | `text` | not null |
| `created_at` | `text` | not null |
| `expires_at` | `text` | not null |
| `revoked_at` | `text` | nullable |

Index: `auth_sessions_user_id_idx` on `user_id` (supports "revoke all sessions for a user").

### 3.3 `auth_password_resets`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `user_id` | `text` | not null, FK → `auth_users(id)` `ON DELETE CASCADE` |
| `token_hash` | `text` | not null, **unique** |
| `created_at` | `text` | not null |
| `expires_at` | `text` | not null |
| `used_at` | `text` | nullable |

### 3.4 `content_items`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `title` | `text` | not null |
| `abstract` | `text` | not null |
| `summary_bn` | `text` | not null |
| `source_language` | `text` | not null, default `en` |
| `tags` | `jsonb` | not null, default `[]` |
| `status` | `text` | not null, default `draft` |
| `source_url` | `text` | nullable |
| `published_at` | `text` | nullable |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |
| `author_id` | `text` | nullable (existing seeded rows predate authoring) |
| `updated_by` | `text` | nullable |

Index: `content_items_status_published_at_idx` on `(status, published_at)` to support the
list query. The list read is a keyset query — `WHERE status = 'published' ORDER BY
published_at DESC, id DESC` — with the cursor encoded as `"<publishedAt>|<id>"`. The
authoring view (`listItems`) reads every status ordered by `updated_at DESC, id DESC`.

### 3.5 `scholar_verifications`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `applicant_id` | `text` | not null |
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

Indexes: `scholar_verifications_applicant_id_idx` on `applicant_id` (**unique** — one
application per user, enforced at the database) and `scholar_verifications_status_submitted_at_idx`
on `(status, submitted_at)` to support the review queue. The queue reads
`WHERE status = $1 ORDER BY submitted_at DESC, id DESC`; there is no `applicant_id` FK to
`auth_users` (modules stay decoupled, and identity owns its own table).

### 3.6 `community_threads`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `author_id` | `text` | not null |
| `title` | `text` | not null |
| `body` | `text` | not null |
| `category` | `text` | not null, default `General` |
| `created_at` | `text` | not null |
| `updated_at` | `text` | not null |

Index: `community_threads_created_at_id_idx` on `(created_at, id)` to support the keyset list
(`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC`). The cursor is the same
`"<createdAt>|<id>"` codec used by the content read path.

### 3.7 `community_replies`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `thread_id` | `text` | not null |
| `author_id` | `text` | not null |
| `body` | `text` | not null |
| `created_at` | `text` | not null |

Index: `community_replies_thread_id_created_at_idx` on `(thread_id, created_at)` to support the
per-thread reply read (`WHERE thread_id = $1 ORDER BY created_at ASC, id ASC`). There is no
`thread_id`/`author_id` foreign key (matching the authorship and `applicant_id` columns —
modules stay decoupled).

### 3.8 Migration Operations

Managed by `node-pg-migrate` (config keys kebab-case, `single-transaction: true`). See
`docs/configuration.md` for commands. The auth migration's `down` drops the three tables in
dependent order (`auth_password_resets`, then the index, then `auth_sessions`, then
`auth_users`); the content migration's `down` drops the index, then `content_items`; the
authorship migration's `down` drops `author_id` and `updated_by`; the verification migration's
`down` drops both indexes, then `scholar_verifications`; the community migration's `down` drops
both indexes, then `community_replies`, then `community_threads`.

## 4. In-Memory Store

### 4.1 Identity store

Defined in `src/modules/identity/infrastructure/auth-store.ts`. `AuthStore` mirrors the
schema with four `Map`s:

| Map | Key → Value |
| --- | --- |
| `usersById` | `id` → `UserRecord` |
| `usersByPhone` | `phoneNumber` → `id` (the unique index) |
| `sessionsById` | `id` → `AuthSessionRecord` |
| `passwordResetById` | `id` → `PasswordResetRecord` |

`listSessionsByUserId` and `getPasswordResetByTokenHash` are linear scans over the maps,
which is correct at test scale. The store is cached on `globalThis` so hot reloads do not
lose data, and `resetAuthStoreForTesting()` replaces it between tests.

### 4.2 Content store

Defined in `src/modules/content/infrastructure/content-store.ts`. `ContentStore` holds a
single `items: Map<string, ResearchItem>` keyed by `id`. `listPublishedItems` filters to
`status === "published"`, sorts by `publishedAt`/`id` descending, applies the keyset cursor,
and slices to the requested limit; `getPublishedItemById` returns `undefined` for drafts or
unknown ids. The authoring methods mirror the read path: `listItems` returns every status
sorted by `updatedAt`/`id` descending, `getItemById` returns drafts too, and
`updateItemIfUnchanged` writes only when the stored `updatedAt` matches the expected value
(returning `false` otherwise, which the service turns into a `409`). Like the identity store
it is cached on `globalThis` (`__okkhorContentStore`) and replaced between tests by
`resetContentStoreForTesting()`.

### 4.3 Verification store

Defined in `src/modules/verification/infrastructure/verification-store.ts`.
`VerificationStore` holds a single `verifications: Map<string, ScholarVerification>` keyed by
`id`. `getByApplicantId` is a linear scan (correct at test scale), `listByStatus` filters by
`status` and sorts by `updatedAt`/`id` descending, and `updateIfUnchanged` writes only when the
stored `updatedAt` matches the expected value (returning `false` otherwise, which the service
turns into a `409`). Like the other stores it is cached on `globalThis`
(`__okkhorVerificationStore`) and replaced between tests by `resetVerificationStoreForTesting()`.

### 4.4 Community store

Defined in `src/modules/community/infrastructure/community-store.ts`. `CommunityStore` holds two
`Map`s keyed by `id`: `threads: Map<string, CommunityThread>` and
`replies: Map<string, CommunityReply>`. `listThreads` sorts by `createdAt`/`id` descending,
applies the keyset cursor, derives `replyCount` by scanning the replies map, and slices to the
requested limit (returning a `nextCursor` while a further page remains). `listRepliesByThreadId`
filters by `threadId` and sorts ascending. Like the other stores it is cached on `globalThis`
(`__okkhorCommunityStore`) and replaced between tests by `resetCommunityStoreForTesting()`.

### 4.5 Search read model (no store)

`search` has no store of its own. Its in-memory repository
(`src/modules/search/infrastructure/search-store.ts`) is a stateless projection: on each
`searchDocuments` call it reads `getMemoryContentRepository().listItems()` and
`getMemoryCommunityRepository().listThreads(...)`, filters them, and returns `SearchDocument`s.
It is cached on `globalThis` (`__okkhorMemorySearchRepository`) but holds no data, so it needs
no reset hook — resetting the content and community stores is enough.

## 5. Persistence Driver Selection

### 5.1 Auth repository

`src/modules/identity/infrastructure/auth-repository.ts` is the single decision point:

```
AUTH_STORAGE_DRIVER = auto | memory | postgres   (default: auto)
  memory   → memory repository
  postgres → postgres repository
  auto     → NODE_ENV === "test"        → memory
             else DATABASE_URL present  → postgres
             else                       → throw (misconfiguration)
```

Both implementations satisfy the `AuthRepository` interface (11 methods). Application code
never imports a concrete implementation — it calls `getAuthRepository()`.

### 5.2 Ephemeral store (rate-limit counters)

`src/modules/platform/infrastructure/ephemeral-store.ts` follows the same pattern for the
`ADR-005` boundary:

```
EPHEMERAL_STORAGE_DRIVER = auto | memory | redis   (default: auto)
  memory → in-process counters
  redis  → Redis INCR + EXPIRE
  auto   → NODE_ENV === "test"       → memory
           else REDIS_URL present    → redis
           else                      → memory
```

Unlike the auth repository, a missing Redis is **not** an error: the store is optional by
design, and losing it degrades behaviour (rate limits become per-instance and best-effort)
rather than losing durable data. The interface is intentionally tiny:
`increment(key, windowSeconds)`.

### 5.3 PostgreSQL connection

`src/modules/platform/infrastructure/postgres-config.ts` holds the shared pool config and
reads pool settings from the environment:
`DB_POOL_MAX` (default 10), `DB_POOL_IDLE_TIMEOUT_MS` (10 000),
`DB_POOL_CONNECTION_TIMEOUT_MS` (5 000), `DB_POOL_MAX_USES` (7 500), and
`allowExitOnIdle` in non-production.

### 5.4 Content repository

`src/modules/content/infrastructure/content-repository.ts` is the single decision point for
the `content` module, using its own driver variable:

```
CONTENT_STORAGE_DRIVER = auto | memory | postgres   (default: auto)
  memory   → memory repository
  postgres → postgres repository
  auto     → NODE_ENV === "test"        → memory
             else DATABASE_URL present  → postgres
             else                       → throw (misconfiguration)
```

Both implementations satisfy the `ContentRepository` interface. Application code calls
`getContentRepository()`; the driver is independent of `AUTH_STORAGE_DRIVER` so the two
modules can be pointed at different stores.

### 5.5 Verification repository

`src/modules/verification/infrastructure/verification-repository.ts` is the single decision
point for the `verification` module, using its own driver variable:

```
VERIFICATION_STORAGE_DRIVER = auto | memory | postgres   (default: auto)
  memory   → memory repository
  postgres → postgres repository
  auto     → NODE_ENV === "test"        → memory
             else DATABASE_URL present  → postgres
             else                       → throw (misconfiguration)
```

Both implementations satisfy the `VerificationRepository` interface. Application code calls
`getVerificationRepository()`; the driver is independent of `AUTH_STORAGE_DRIVER` and
`CONTENT_STORAGE_DRIVER`. The postgres `updateIfUnchanged` issues
`UPDATE … WHERE id = $1 AND updated_at = $n` and returns whether exactly one row matched.

### 5.6 Community repository

`src/modules/community/infrastructure/community-repository.ts` is the single decision point for
the `community` module, using its own driver variable:

```
COMMUNITY_STORAGE_DRIVER = auto | memory | postgres   (default: auto)
  memory   → memory repository
  postgres → postgres repository
  auto     → NODE_ENV === "test"        → memory
             else DATABASE_URL present  → postgres
             else                       → throw (misconfiguration)
```

Both implementations satisfy the `CommunityRepository` interface. Application code calls
`getCommunityRepository()`; the driver is independent of the other modules' drivers. The
postgres list read is a keyset query with a correlated subquery for `replyCount`, and writes use
`INSERT … ON CONFLICT (id) DO UPDATE`.

### 5.7 Search repository

`src/modules/search/infrastructure/search-repository.ts` is the single decision point for the
`search` module, using its own driver variable:

```
SEARCH_STORAGE_DRIVER = auto | memory | postgres   (default: auto)
  memory   → memory repository
  postgres → postgres repository
  auto     → NODE_ENV === "test"        → memory
             else DATABASE_URL present  → postgres
             else                       → throw (misconfiguration)
```

Both implementations satisfy the `SearchRepository` interface (a single `searchDocuments`
method). Application code calls `getSearchRepository()`; the driver is independent of the other
modules' drivers. Because `search` is read-only, the postgres implementation issues only
`SELECT`s — an `ILIKE`-per-token predicate ANDed together over `content_items`
(`status = 'published'`) and `community_threads`, with `tags @> $n::jsonb` for the research tag
filter and `category = $n` for the thread category filter.

## 6. Data Classification and Handling

| Data | Classification | Handling rule |
| --- | --- | --- |
| `password_hash` | secret | bcryptjs, 12 salt rounds; never returned |
| `refresh_token_hash` | secret-derived | SHA-256; raw token only in the cookie |
| `token_hash` (reset) | secret-derived | SHA-256; raw token only in the handoff preview |
| `phone_number` | personal | Stored normalized; hashed before use in any rate-limit key |
| Rate-limit identifiers | personal | SHA-256 before entering the keyspace |

Raw refresh/reset tokens and passwords are never written to durable storage, logs, or
response bodies (except the documented reset-token preview, which is a temporary handoff
until a delivery channel exists).

## 7. Lifecycle and Retention

- **Sessions** expire after the refresh-token window (7 days) and are revoked on logout,
  rotation, or password reset. There is **no automatic pruning job yet** — expired session
  rows remain until a cleanup task exists.
- **Password resets** expire after 15 minutes and are single-use (`used_at`); no pruning job
  yet.
- **Rate-limit counters** are TTL-bound in Redis (or window-bound in memory) and need no
  pruning.

Automatic retention jobs are future work, not a current behaviour.

## 8. Adding a New Table

1. Add a migration under `migrations/` (kebab-case config, `single-transaction: true`),
   including a matching `down`.
2. Add or extend the domain types in the owning module's `domain/`.
3. Extend the `AuthRepository`-style interface and **both** implementations (memory +
   postgres).
4. Add a unit test for the memory path and an integration test against PostgreSQL.
5. Update this document's schema tables and classification table.

## 9. References

- `migrations/20260718222000_create_auth_identity_tables.cjs` — schema of record
- `src/modules/identity/domain/auth-types.ts` — domain types
- `src/modules/identity/infrastructure/auth-store.ts` — in-memory store
- `src/modules/identity/infrastructure/postgres-auth-repository.ts` — SQL implementation
- `migrations/20261128090000_create_content_items.cjs` — `content_items` schema of record
- `migrations/20261128100000_add_content_item_authorship.cjs` — authorship columns
- `src/modules/content/domain/content-types.ts` — content domain types
- `src/modules/content/infrastructure/content-store.ts` — in-memory content store
- `src/modules/content/infrastructure/postgres-content-repository.ts` — content SQL implementation
- `migrations/20261128110000_create_scholar_verifications.cjs` — `scholar_verifications` schema of record
- `src/modules/verification/domain/verification-types.ts` — verification domain types
- `src/modules/verification/infrastructure/verification-store.ts` — in-memory verification store
- `src/modules/verification/infrastructure/postgres-verification-repository.ts` — verification SQL implementation
- `migrations/20261128120000_create_community_tables.cjs` — `community_threads`/`community_replies` schema of record
- `src/modules/community/domain/community-types.ts` — community domain types
- `src/modules/community/infrastructure/community-store.ts` — in-memory community store
- `src/modules/community/infrastructure/postgres-community-repository.ts` — community SQL implementation
- `docs/configuration.md` — connection env vars and migration commands
- `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
- `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
