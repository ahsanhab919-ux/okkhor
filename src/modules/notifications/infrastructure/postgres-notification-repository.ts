import { Pool } from "pg";

import type {
  CreateNotificationResult,
  Notification,
  NotificationRepository,
  NotificationType,
} from "@/src/modules/notifications/domain/notification-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresNotificationRow = {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
};

declare global {
  var __okkhorNotificationsPool: Pool | undefined;
  var __okkhorPostgresNotificationRepository: NotificationRepository | undefined;
}

function mapNotificationRow(row: PostgresNotificationRow): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    dedupeKey: row.dedupe_key,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

const NOTIFICATION_COLUMNS = "id, recipient_id, type, title, body, href, dedupe_key, read_at, created_at";

function getPool() {
  if (!globalThis.__okkhorNotificationsPool) {
    globalThis.__okkhorNotificationsPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorNotificationsPool;
}

function createPostgresNotificationRepository(pool: Pool): NotificationRepository {
  async function selectByDedupeKey(recipientId: string, dedupeKey: string): Promise<Notification | undefined> {
    const result = await pool.query<PostgresNotificationRow>(
      `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE recipient_id = $1 AND dedupe_key = $2 LIMIT 1`,
      [recipientId, dedupeKey],
    );

    return result.rows[0] ? mapNotificationRow(result.rows[0]) : undefined;
  }

  return {
    async createNotification(notification): Promise<CreateNotificationResult> {
      const inserted = await pool.query<PostgresNotificationRow>(
        `
          INSERT INTO notifications (id, recipient_id, type, title, body, href, dedupe_key, read_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (recipient_id, dedupe_key) DO NOTHING
          RETURNING ${NOTIFICATION_COLUMNS}
        `,
        [
          notification.id,
          notification.recipientId,
          notification.type,
          notification.title,
          notification.body,
          notification.href,
          notification.dedupeKey,
          notification.readAt ?? null,
          notification.createdAt,
        ],
      );

      if (inserted.rows[0]) {
        return { notification: mapNotificationRow(inserted.rows[0]), created: true };
      }

      const existing = await selectByDedupeKey(notification.recipientId, notification.dedupeKey);

      return { notification: existing ?? notification, created: false };
    },
    async listNotifications(recipientId, { limit }) {
      const result = await pool.query<PostgresNotificationRow>(
        `
          SELECT ${NOTIFICATION_COLUMNS}
          FROM notifications
          WHERE recipient_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2
        `,
        [recipientId, limit],
      );

      return result.rows.map(mapNotificationRow);
    },
    async getNotificationById(id) {
      const result = await pool.query<PostgresNotificationRow>(
        `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = $1 LIMIT 1`,
        [id],
      );

      return result.rows[0] ? mapNotificationRow(result.rows[0]) : undefined;
    },
    async markNotificationRead(id, readAt) {
      const updated = await pool.query<PostgresNotificationRow>(
        `
          UPDATE notifications
          SET read_at = $1
          WHERE id = $2 AND read_at IS NULL
          RETURNING ${NOTIFICATION_COLUMNS}
        `,
        [readAt, id],
      );

      if (updated.rows[0]) {
        return mapNotificationRow(updated.rows[0]);
      }

      const existing = await pool.query<PostgresNotificationRow>(
        `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE id = $1 LIMIT 1`,
        [id],
      );

      return existing.rows[0] ? mapNotificationRow(existing.rows[0]) : undefined;
    },
    async markAllNotificationsRead(recipientId, readAt) {
      const result = await pool.query(
        "UPDATE notifications SET read_at = $1 WHERE recipient_id = $2 AND read_at IS NULL",
        [readAt, recipientId],
      );

      return result.rowCount ?? 0;
    },
  };
}

export function getPostgresNotificationRepository(): NotificationRepository {
  if (!globalThis.__okkhorPostgresNotificationRepository) {
    globalThis.__okkhorPostgresNotificationRepository = createPostgresNotificationRepository(getPool());
  }

  return globalThis.__okkhorPostgresNotificationRepository;
}
