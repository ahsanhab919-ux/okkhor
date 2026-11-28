import { Pool } from "pg";

import { getItemCursor } from "@/src/modules/content/domain/content-pagination";
import type { ContentRepository, ResearchItem, TagCount } from "@/src/modules/content/domain/content-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresContentItemRow = {
  id: string;
  title: string;
  abstract: string;
  summary_bn: string;
  source_language: string;
  tags: string[];
  status: string;
  source_url: string | null;
  published_at: string | null;
  author_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type PostgresTagCountRow = {
  tag: string;
  count: number;
};

declare global {
  var __okkhorContentPool: Pool | undefined;
  var __okkhorPostgresContentRepository: ContentRepository | undefined;
}

function mapContentItemRow(row: PostgresContentItemRow): ResearchItem {
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    summaryBn: row.summary_bn,
    sourceLanguage: row.source_language,
    tags: row.tags,
    status: row.status === "published" ? "published" : "draft",
    sourceUrl: row.source_url || undefined,
    publishedAt: row.published_at || undefined,
    authorId: row.author_id || undefined,
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool() {
  if (!globalThis.__okkhorContentPool) {
    globalThis.__okkhorContentPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorContentPool;
}

function createPostgresContentRepository(pool: Pool): ContentRepository {
  return {
    async listPublishedItems({ limit, cursor }) {
      const values: unknown[] = ["published"];
      let whereClause = "WHERE status = $1";

      if (cursor) {
        values.push(cursor.publishedAt, cursor.id);
        whereClause += " AND (published_at, id) < ($2, $3)";
      }

      values.push(limit + 1);

      const result = await pool.query<PostgresContentItemRow>(
        `SELECT * FROM content_items ${whereClause} ORDER BY published_at DESC, id DESC LIMIT $${values.length}`,
        values,
      );

      const rows = result.rows.map(mapContentItemRow);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];

      return {
        items,
        nextCursor: rows.length > limit && last ? getItemCursor(last) : undefined,
      };
    },
    async listItems() {
      const result = await pool.query<PostgresContentItemRow>(
        "SELECT * FROM content_items ORDER BY updated_at DESC, id DESC",
      );

      return result.rows.map(mapContentItemRow);
    },
    async getPublishedItemById(id) {
      const result = await pool.query<PostgresContentItemRow>(
        "SELECT * FROM content_items WHERE id = $1 AND status = 'published' LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapContentItemRow(result.rows[0]) : undefined;
    },
    async getPublishedItemsByIds(ids) {
      if (ids.length === 0) {
        return [];
      }

      const result = await pool.query<PostgresContentItemRow>(
        "SELECT * FROM content_items WHERE status = 'published' AND id = ANY($1::text[])",
        [ids],
      );
      const byId = new Map(result.rows.map((row) => {
        const item = mapContentItemRow(row);

        return [item.id, item] as const;
      }));

      return ids.flatMap((id) => {
        const item = byId.get(id);

        return item ? [item] : [];
      });
    },
    async listPublishedItemsByAuthor(authorId, { limit }) {
      const result = await pool.query<PostgresContentItemRow>(
        `
          SELECT * FROM content_items
          WHERE author_id = $1 AND status = 'published'
          ORDER BY published_at DESC, id DESC
          LIMIT $2
        `,
        [authorId, limit],
      );

      return result.rows.map(mapContentItemRow);
    },
    async listDistinctPublishedTags() {
      const result = await pool.query<PostgresTagCountRow>(
        `
          SELECT tag, count(*)::int AS count
          FROM content_items, jsonb_array_elements_text(tags) AS tag
          WHERE status = 'published'
          GROUP BY tag
          ORDER BY count DESC, tag ASC
        `,
      );

      return result.rows.map((row): TagCount => ({ tag: row.tag, count: row.count }));
    },
    async listPublishedItemsByTag(tag, { limit }) {
      const result = await pool.query<PostgresContentItemRow>(
        `
          SELECT * FROM content_items
          WHERE status = 'published' AND tags @> $1::jsonb
          ORDER BY published_at DESC, id DESC
          LIMIT $2
        `,
        [JSON.stringify([tag]), limit],
      );

      return result.rows.map(mapContentItemRow);
    },
    async getItemById(id) {
      const result = await pool.query<PostgresContentItemRow>(
        "SELECT * FROM content_items WHERE id = $1 LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapContentItemRow(result.rows[0]) : undefined;
    },
    async createItem(item) {
      await pool.query(
        `
          INSERT INTO content_items (
            id,
            title,
            abstract,
            summary_bn,
            source_language,
            tags,
            status,
            source_url,
            published_at,
            author_id,
            updated_by,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            abstract = EXCLUDED.abstract,
            summary_bn = EXCLUDED.summary_bn,
            source_language = EXCLUDED.source_language,
            tags = EXCLUDED.tags,
            status = EXCLUDED.status,
            source_url = EXCLUDED.source_url,
            published_at = EXCLUDED.published_at,
            author_id = EXCLUDED.author_id,
            updated_by = EXCLUDED.updated_by,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          item.id,
          item.title,
          item.abstract,
          item.summaryBn,
          item.sourceLanguage,
          JSON.stringify(item.tags),
          item.status,
          item.sourceUrl ?? null,
          item.publishedAt ?? null,
          item.authorId ?? null,
          item.updatedBy ?? null,
          item.createdAt,
          item.updatedAt,
        ],
      );
    },
    async updateItemIfUnchanged(item, expectedUpdatedAt) {
      const result = await pool.query(
        `
          UPDATE content_items
          SET title = $2,
              abstract = $3,
              summary_bn = $4,
              source_language = $5,
              tags = $6::jsonb,
              status = $7,
              source_url = $8,
              published_at = $9,
              author_id = $10,
              updated_by = $11,
              created_at = $12,
              updated_at = $13
          WHERE id = $1 AND updated_at = $14
        `,
        [
          item.id,
          item.title,
          item.abstract,
          item.summaryBn,
          item.sourceLanguage,
          JSON.stringify(item.tags),
          item.status,
          item.sourceUrl ?? null,
          item.publishedAt ?? null,
          item.authorId ?? null,
          item.updatedBy ?? null,
          item.createdAt,
          item.updatedAt,
          expectedUpdatedAt,
        ],
      );

      return (result.rowCount ?? 0) === 1;
    },
  };
}

export function getPostgresContentRepository(): ContentRepository {
  if (!globalThis.__okkhorPostgresContentRepository) {
    globalThis.__okkhorPostgresContentRepository = createPostgresContentRepository(getPool());
  }

  return globalThis.__okkhorPostgresContentRepository;
}
