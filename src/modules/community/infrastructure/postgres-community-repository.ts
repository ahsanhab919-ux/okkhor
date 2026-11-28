import { Pool } from "pg";

import { getThreadCursor } from "@/src/modules/community/domain/community-pagination";
import type {
  CommunityRepository,
  CommunityReply,
  CommunityThread,
} from "@/src/modules/community/domain/community-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresCommunityThreadRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  updated_at: string;
  reply_count?: number;
};

type PostgresCommunityReplyRow = {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

declare global {
  var __okkhorCommunityPool: Pool | undefined;
  var __okkhorPostgresCommunityRepository: CommunityRepository | undefined;
}

function mapThreadRow(row: PostgresCommunityThreadRow): CommunityThread {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReplyRow(row: PostgresCommunityReplyRow): CommunityReply {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function getPool() {
  if (!globalThis.__okkhorCommunityPool) {
    globalThis.__okkhorCommunityPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorCommunityPool;
}

function createPostgresCommunityRepository(pool: Pool): CommunityRepository {
  return {
    async listThreads({ limit, cursor }) {
      const values: unknown[] = [];
      let whereClause = "";

      if (cursor) {
        values.push(cursor.createdAt, cursor.id);
        whereClause = "WHERE (t.created_at, t.id) < ($1, $2)";
      }

      values.push(limit + 1);

      const result = await pool.query<PostgresCommunityThreadRow>(
        `
          SELECT t.*, (SELECT COUNT(*) FROM community_replies r WHERE r.thread_id = t.id)::int AS reply_count
          FROM community_threads t
          ${whereClause}
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT $${values.length}
        `,
        values,
      );

      const rows = result.rows;
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];

      return {
        threads: page.map((row) => ({ ...mapThreadRow(row), replyCount: row.reply_count ?? 0 })),
        nextCursor: rows.length > limit && last ? getThreadCursor(mapThreadRow(last)) : undefined,
      };
    },
    async getThreadById(id) {
      const result = await pool.query<PostgresCommunityThreadRow>(
        "SELECT * FROM community_threads WHERE id = $1 LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapThreadRow(result.rows[0]) : undefined;
    },
    async createThread(thread) {
      await pool.query(
        `
          INSERT INTO community_threads (id, author_id, title, body, category, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            author_id = EXCLUDED.author_id,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            category = EXCLUDED.category,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [thread.id, thread.authorId, thread.title, thread.body, thread.category, thread.createdAt, thread.updatedAt],
      );
    },
    async listRepliesByThreadId(threadId) {
      const result = await pool.query<PostgresCommunityReplyRow>(
        "SELECT * FROM community_replies WHERE thread_id = $1 ORDER BY created_at ASC, id ASC",
        [threadId],
      );

      return result.rows.map(mapReplyRow);
    },
    async createReply(reply) {
      await pool.query(
        `
          INSERT INTO community_replies (id, thread_id, author_id, body, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            thread_id = EXCLUDED.thread_id,
            author_id = EXCLUDED.author_id,
            body = EXCLUDED.body,
            created_at = EXCLUDED.created_at
        `,
        [reply.id, reply.threadId, reply.authorId, reply.body, reply.createdAt],
      );
    },
  };
}

export function getPostgresCommunityRepository(): CommunityRepository {
  if (!globalThis.__okkhorPostgresCommunityRepository) {
    globalThis.__okkhorPostgresCommunityRepository = createPostgresCommunityRepository(getPool());
  }

  return globalThis.__okkhorPostgresCommunityRepository;
}
