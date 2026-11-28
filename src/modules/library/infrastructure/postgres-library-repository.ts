import { Pool } from "pg";

import type { LibraryRepository, SavedItem } from "@/src/modules/library/domain/library-types";
import { getPostgresPoolConfig } from "@/src/modules/platform/infrastructure/postgres-config";

type PostgresSavedItemRow = {
  user_id: string;
  item_id: string;
  saved_at: string;
};

declare global {
  var __okkhorLibraryPool: Pool | undefined;
  var __okkhorPostgresLibraryRepository: LibraryRepository | undefined;
}

function mapSavedItemRow(row: PostgresSavedItemRow): SavedItem {
  return {
    userId: row.user_id,
    itemId: row.item_id,
    savedAt: row.saved_at,
  };
}

function getPool() {
  if (!globalThis.__okkhorLibraryPool) {
    globalThis.__okkhorLibraryPool = new Pool(getPostgresPoolConfig());
  }

  return globalThis.__okkhorLibraryPool;
}

function createPostgresLibraryRepository(pool: Pool): LibraryRepository {
  return {
    async listSavedItems(userId, { limit }) {
      const result = await pool.query<PostgresSavedItemRow>(
        `
          SELECT user_id, item_id, saved_at
          FROM saved_items
          WHERE user_id = $1
          ORDER BY saved_at DESC, item_id DESC
          LIMIT $2
        `,
        [userId, limit],
      );

      return result.rows.map(mapSavedItemRow);
    },
    async isItemSaved(userId, itemId) {
      const result = await pool.query(
        "SELECT 1 FROM saved_items WHERE user_id = $1 AND item_id = $2 LIMIT 1",
        [userId, itemId],
      );

      return (result.rowCount ?? 0) > 0;
    },
    async saveItem(item) {
      const inserted = await pool.query<PostgresSavedItemRow>(
        `
          INSERT INTO saved_items (user_id, item_id, saved_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, item_id) DO NOTHING
          RETURNING user_id, item_id, saved_at
        `,
        [item.userId, item.itemId, item.savedAt],
      );

      if (inserted.rows[0]) {
        return mapSavedItemRow(inserted.rows[0]);
      }

      const existing = await pool.query<PostgresSavedItemRow>(
        "SELECT user_id, item_id, saved_at FROM saved_items WHERE user_id = $1 AND item_id = $2 LIMIT 1",
        [item.userId, item.itemId],
      );

      return existing.rows[0] ? mapSavedItemRow(existing.rows[0]) : item;
    },
    async removeSavedItem(userId, itemId) {
      const result = await pool.query("DELETE FROM saved_items WHERE user_id = $1 AND item_id = $2", [
        userId,
        itemId,
      ]);

      return (result.rowCount ?? 0) > 0;
    },
  };
}

export function getPostgresLibraryRepository(): LibraryRepository {
  if (!globalThis.__okkhorPostgresLibraryRepository) {
    globalThis.__okkhorPostgresLibraryRepository = createPostgresLibraryRepository(getPool());
  }

  return globalThis.__okkhorPostgresLibraryRepository;
}
