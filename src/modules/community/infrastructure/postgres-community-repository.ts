import { Pool } from "pg";

import { getThreadCursor } from "@/src/modules/community/domain/community-pagination";
import type {
  CategoryCount,
  CommunityReport,
  CommunityRepository,
  CommunityReply,
  CommunityThread,
  ModerationState,
  ReportReason,
  ReportStatus,
  ReportTargetType,
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
  moderation_state: string;
  locked: boolean;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
  reply_count?: number;
};

type PostgresCommunityReplyRow = {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  moderation_state: string;
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_note: string | null;
};

type PostgresCategoryCountRow = {
  category: string;
  count: number;
};

type PostgresCommunityReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
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
    moderationState: row.moderation_state as ModerationState,
    locked: row.locked,
    moderatedBy: row.moderated_by ?? undefined,
    moderatedAt: row.moderated_at ?? undefined,
    moderationNote: row.moderation_note ?? undefined,
  };
}

function mapReplyRow(row: PostgresCommunityReplyRow): CommunityReply {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    moderationState: row.moderation_state as ModerationState,
    moderatedBy: row.moderated_by ?? undefined,
    moderatedAt: row.moderated_at ?? undefined,
    moderationNote: row.moderation_note ?? undefined,
  };
}

function mapReportRow(row: PostgresCommunityReportRow): CommunityReport {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type as ReportTargetType,
    targetId: row.target_id,
    reason: row.reason as ReportReason,
    detail: row.detail ?? undefined,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
    resolvedBy: row.resolved_by ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
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
    async listThreads({ limit, cursor, includeHidden = false }) {
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (!includeHidden) {
        conditions.push("t.moderation_state = 'visible'");
      }

      if (cursor) {
        values.push(cursor.createdAt, cursor.id);
        conditions.push(`(t.created_at, t.id) < ($${values.length - 1}, $${values.length})`);
      }

      values.push(limit + 1);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query<PostgresCommunityThreadRow>(
        `
          SELECT t.*, (
            SELECT COUNT(*) FROM community_replies r
            WHERE r.thread_id = t.id AND r.moderation_state = 'visible'
          )::int AS reply_count
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
    async listThreadsByAuthor(authorId, { limit }) {
      const result = await pool.query<PostgresCommunityThreadRow>(
        `
          SELECT t.*, (
            SELECT COUNT(*) FROM community_replies r
            WHERE r.thread_id = t.id AND r.moderation_state = 'visible'
          )::int AS reply_count
          FROM community_threads t
          WHERE t.author_id = $1 AND t.moderation_state = 'visible'
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT $2
        `,
        [authorId, limit],
      );

      return result.rows.map((row) => ({ ...mapThreadRow(row), replyCount: row.reply_count ?? 0 }));
    },
    async listDistinctCategories() {
      const result = await pool.query<PostgresCategoryCountRow>(
        `
          SELECT category, count(*)::int AS count
          FROM community_threads
          WHERE moderation_state = 'visible'
          GROUP BY category
          ORDER BY count DESC, category ASC
        `,
      );

      return result.rows.map((row): CategoryCount => ({ category: row.category, count: row.count }));
    },
    async listThreadsByCategory(category, { limit, cursor }) {
      const values: unknown[] = [category];
      const conditions = ["t.moderation_state = 'visible'", "t.category = $1"];

      if (cursor) {
        values.push(cursor.createdAt, cursor.id);
        conditions.push(`(t.created_at, t.id) < ($${values.length - 1}, $${values.length})`);
      }

      values.push(limit + 1);

      const result = await pool.query<PostgresCommunityThreadRow>(
        `
          SELECT t.*, (
            SELECT COUNT(*) FROM community_replies r
            WHERE r.thread_id = t.id AND r.moderation_state = 'visible'
          )::int AS reply_count
          FROM community_threads t
          WHERE ${conditions.join(" AND ")}
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
    async createThread(thread) {
      await pool.query(
        `
          INSERT INTO community_threads (
            id, author_id, title, body, category, created_at, updated_at,
            moderation_state, locked, moderated_by, moderated_at, moderation_note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            author_id = EXCLUDED.author_id,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            category = EXCLUDED.category,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            moderation_state = EXCLUDED.moderation_state,
            locked = EXCLUDED.locked,
            moderated_by = EXCLUDED.moderated_by,
            moderated_at = EXCLUDED.moderated_at,
            moderation_note = EXCLUDED.moderation_note
        `,
        [
          thread.id,
          thread.authorId,
          thread.title,
          thread.body,
          thread.category,
          thread.createdAt,
          thread.updatedAt,
          thread.moderationState,
          thread.locked,
          thread.moderatedBy ?? null,
          thread.moderatedAt ?? null,
          thread.moderationNote ?? null,
        ],
      );
    },
    async listRepliesByThreadId(threadId, { includeHidden = false } = {}) {
      const visibilityClause = includeHidden ? "" : "AND moderation_state = 'visible'";

      const result = await pool.query<PostgresCommunityReplyRow>(
        `SELECT * FROM community_replies WHERE thread_id = $1 ${visibilityClause} ORDER BY created_at ASC, id ASC`,
        [threadId],
      );

      return result.rows.map(mapReplyRow);
    },
    async createReply(reply) {
      await pool.query(
        `
          INSERT INTO community_replies (id, thread_id, author_id, body, created_at, moderation_state)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            thread_id = EXCLUDED.thread_id,
            author_id = EXCLUDED.author_id,
            body = EXCLUDED.body,
            created_at = EXCLUDED.created_at,
            moderation_state = EXCLUDED.moderation_state
        `,
        [reply.id, reply.threadId, reply.authorId, reply.body, reply.createdAt, reply.moderationState],
      );
    },
    async getReplyById(id) {
      const result = await pool.query<PostgresCommunityReplyRow>(
        "SELECT * FROM community_replies WHERE id = $1 LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapReplyRow(result.rows[0]) : undefined;
    },
    async updateThreadModeration(thread) {
      await pool.query(
        `
          UPDATE community_threads SET
            moderation_state = $2,
            locked = $3,
            moderated_by = $4,
            moderated_at = $5,
            moderation_note = $6
          WHERE id = $1
        `,
        [
          thread.id,
          thread.moderationState,
          thread.locked,
          thread.moderatedBy ?? null,
          thread.moderatedAt ?? null,
          thread.moderationNote ?? null,
        ],
      );
    },
    async updateReplyModeration(reply) {
      await pool.query(
        `
          UPDATE community_replies SET
            moderation_state = $2,
            moderated_by = $3,
            moderated_at = $4,
            moderation_note = $5
          WHERE id = $1
        `,
        [
          reply.id,
          reply.moderationState,
          reply.moderatedBy ?? null,
          reply.moderatedAt ?? null,
          reply.moderationNote ?? null,
        ],
      );
    },
    async createReport(report) {
      await pool.query(
        `
          INSERT INTO community_reports (
            id, reporter_id, target_type, target_id, reason, detail, status, created_at,
            resolved_by, resolved_at, resolution_note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
        `,
        [
          report.id,
          report.reporterId,
          report.targetType,
          report.targetId,
          report.reason,
          report.detail ?? null,
          report.status,
          report.createdAt,
          report.resolvedBy ?? null,
          report.resolvedAt ?? null,
          report.resolutionNote ?? null,
        ],
      );

      // Read back the stored row so a duplicate report returns the pre-existing one, not the input.
      const result = await pool.query<PostgresCommunityReportRow>(
        `
          SELECT * FROM community_reports
          WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3
          LIMIT 1
        `,
        [report.reporterId, report.targetType, report.targetId],
      );

      return mapReportRow(result.rows[0]);
    },
    async getReportById(id) {
      const result = await pool.query<PostgresCommunityReportRow>(
        "SELECT * FROM community_reports WHERE id = $1 LIMIT 1",
        [id],
      );

      return result.rows[0] ? mapReportRow(result.rows[0]) : undefined;
    },
    async listReports({ status, limit }) {
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (status !== undefined) {
        values.push(status);
        conditions.push(`status = $${values.length}`);
      }

      values.push(limit);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query<PostgresCommunityReportRow>(
        `
          SELECT * FROM community_reports
          ${whereClause}
          ORDER BY created_at DESC, id DESC
          LIMIT $${values.length}
        `,
        values,
      );

      return result.rows.map(mapReportRow);
    },
    async updateReport(report) {
      await pool.query(
        `
          UPDATE community_reports SET
            status = $2,
            resolved_by = $3,
            resolved_at = $4,
            resolution_note = $5
          WHERE id = $1
        `,
        [
          report.id,
          report.status,
          report.resolvedBy ?? null,
          report.resolvedAt ?? null,
          report.resolutionNote ?? null,
        ],
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
