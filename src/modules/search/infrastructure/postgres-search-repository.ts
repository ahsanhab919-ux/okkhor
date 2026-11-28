import { Pool } from "pg";

import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";
import type { SearchDocument, SearchQuery, SearchRepository } from "@/src/modules/search/domain/search-types";

type PostgresResearchRow = {
  id: string;
  title: string;
  abstract: string;
  summary_bn: string;
  tags: string[];
  author_id: string | null;
  created_at: string;
};

type PostgresThreadRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  author_id: string;
  created_at: string;
};

declare global {
  var __okkhorSearchPool: Pool | undefined;
  var __okkhorPostgresSearchRepository: SearchRepository | undefined;
}

function getPool() {
  if (!globalThis.__okkhorSearchPool) {
    globalThis.__okkhorSearchPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorSearchPool;
}

/** A `%token%` pattern with LIKE metacharacters escaped, so a token is a literal substring. */
function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function mapResearchRow(row: PostgresResearchRow): SearchDocument {
  return {
    kind: "research",
    id: row.id,
    title: row.title,
    body: `${row.abstract} ${row.summary_bn}`.trim(),
    tags: row.tags,
    authorId: row.author_id || undefined,
    createdAt: row.created_at,
  };
}

function mapThreadRow(row: PostgresThreadRow): SearchDocument {
  return {
    kind: "thread",
    id: row.id,
    title: row.title,
    body: row.body,
    tags: [row.category],
    authorId: row.author_id || undefined,
    createdAt: row.created_at,
  };
}

async function searchResearch(pool: Pool, query: SearchQuery): Promise<SearchDocument[]> {
  const values: unknown[] = [];
  const conditions: string[] = ["status = 'published'"];

  for (const token of query.tokens) {
    values.push(likePattern(token));
    const placeholder = `$${values.length}`;

    conditions.push(
      `(title ILIKE ${placeholder} OR abstract ILIKE ${placeholder} OR summary_bn ILIKE ${placeholder} OR tags::text ILIKE ${placeholder})`,
    );
  }

  if (query.tags && query.tags.length > 0) {
    values.push(JSON.stringify(query.tags));
    conditions.push(`tags @> $${values.length}::jsonb`);
  }

  if (query.authorId) {
    values.push(query.authorId);
    conditions.push(`author_id = $${values.length}`);
  }

  values.push(query.limit);

  const result = await pool.query<PostgresResearchRow>(
    `
      SELECT id, title, abstract, summary_bn, tags, author_id, created_at
      FROM content_items
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map(mapResearchRow);
}

async function searchThreads(pool: Pool, query: SearchQuery): Promise<SearchDocument[]> {
  const values: unknown[] = [];
  // Hidden threads are a moderator action: they are never searchable, matching the community
  // read path (`community-moderation-slice.md` §5).
  const conditions: string[] = ["moderation_state = 'visible'"];

  for (const token of query.tokens) {
    values.push(likePattern(token));
    const placeholder = `$${values.length}`;

    conditions.push(`(title ILIKE ${placeholder} OR body ILIKE ${placeholder} OR category ILIKE ${placeholder})`);
  }

  if (query.category) {
    values.push(query.category);
    conditions.push(`category = $${values.length}`);
  }

  if (query.authorId) {
    values.push(query.authorId);
    conditions.push(`author_id = $${values.length}`);
  }

  values.push(query.limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<PostgresThreadRow>(
    `
      SELECT id, title, body, category, author_id, created_at
      FROM community_threads
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map(mapThreadRow);
}

function createPostgresSearchRepository(pool: Pool): SearchRepository {
  return {
    async searchDocuments(query) {
      const includesResearch = query.kind !== "thread" && !(query.tags && query.tags.length > 0);
      const includesThreads = query.kind !== "research" && !query.category;

      const [research, threads] = await Promise.all([
        includesResearch ? searchResearch(pool, query) : Promise.resolve<SearchDocument[]>([]),
        includesThreads ? searchThreads(pool, query) : Promise.resolve<SearchDocument[]>([]),
      ]);

      return [...research, ...threads].slice(0, query.limit);
    },
  };
}

export function getPostgresSearchRepository(): SearchRepository {
  if (!globalThis.__okkhorPostgresSearchRepository) {
    globalThis.__okkhorPostgresSearchRepository = createPostgresSearchRepository(getPool());
  }

  return globalThis.__okkhorPostgresSearchRepository;
}
