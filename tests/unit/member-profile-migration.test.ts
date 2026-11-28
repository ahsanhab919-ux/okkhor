import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  createIndex: (table: string, columns: string[], options?: { name?: string; unique?: boolean }) => void;
  dropIndex: (table: string | string[], columns: string[], options?: unknown) => void;
};

const migration = requireFromHere("../../migrations/20261128140000_add_member_author_indexes.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("member author indexes migration", () => {
  it("creates both author indexes on up and reverses them on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      createIndex: (table, columns, options) => {
        events.push(`index:${table}:${columns.join(",")}:${options?.name ?? ""}`);
      },
      dropIndex: (table, columns) => {
        events.push(`dropIndex:${Array.isArray(table) ? table.join(",") : table}:${columns.join(",")}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      "index:content_items:author_id,published_at:content_items_author_id_published_at_idx",
      "index:community_threads:author_id,created_at:community_threads_author_id_created_at_idx",
      "dropIndex:community_threads:author_id,created_at",
      "dropIndex:content_items:author_id,published_at",
    ]);
  });
});
