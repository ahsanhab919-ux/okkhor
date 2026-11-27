import { Pool } from "pg";

import { getItemCursor } from "@/src/modules/content/domain/content-pagination";
import type { ContentRepository, ResearchItem } from "@/src/modules/content/domain/content-types";
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
  created_at: string;
  updated_at: string;
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
    async getPublishedItemById(id) {
      const result = await pool.query<PostgresContentItemRow>(
        "SELECT * FROM content_items WHERE id = $1 AND status = 'published' LIMIT 1",
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
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            abstract = EXCLUDED.abstract,
            summary_bn = EXCLUDED.summary_bn,
            source_language = EXCLUDED.source_language,
            tags = EXCLUDED.tags,
            status = EXCLUDED.status,
            source_url = EXCLUDED.source_url,
            published_at = EXCLUDED.published_at,
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
          item.createdAt,
          item.updatedAt,
        ],
      );
    },
    async updateItem(item) {
      await pool.query(
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
              created_at = $10,
              updated_at = $11
          WHERE id = $1
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
          item.createdAt,
          item.updatedAt,
        ],
      );
    },
  };
}

export function getPostgresContentRepository(): ContentRepository {
  if (!globalThis.__okkhorPostgresContentRepository) {
    globalThis.__okkhorPostgresContentRepository = createPostgresContentRepository(getPool());
  }

  return globalThis.__okkhorPostgresContentRepository;
}
