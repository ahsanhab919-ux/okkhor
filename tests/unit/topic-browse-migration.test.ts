import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  createIndex: (
    table: string,
    columns: string | string[],
    options?: { name?: string; method?: string },
  ) => void;
  dropIndex: (
    table: string | string[],
    columns: string | string[],
    options?: unknown,
  ) => void;
};

const migration = requireFromHere("../../migrations/20261128170000_add_topic_browse_indexes.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

function toColumnList(columns: string | string[]) {
  return Array.isArray(columns) ? columns.join(",") : columns;
}

describe("topic browse indexes migration", () => {
  it("creates both browse indexes on up and reverses them on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      createIndex: (table, columns, options) => {
        events.push(`index:${table}:${toColumnList(columns)}:${options?.name ?? ""}:${options?.method ?? ""}`);
      },
      dropIndex: (table, columns) => {
        events.push(
          `dropIndex:${Array.isArray(table) ? table.join(",") : table}:${toColumnList(columns)}`,
        );
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      "index:content_items:tags:content_items_tags_gin_idx:gin",
      "index:community_threads:category,created_at:community_threads_category_created_at_idx:",
      "dropIndex:community_threads:category,created_at",
      "dropIndex:content_items:tags",
    ]);
  });
});
