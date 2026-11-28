import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  createTable: (table: string, columns: Record<string, unknown>) => void;
  createIndex: (table: string, columns: string[], options?: { name?: string; unique?: boolean }) => void;
  dropIndex: (table: string | string[], columns: string[], options?: unknown) => void;
  dropTable: (table: string) => void;
};

const migration = requireFromHere("../../migrations/20261128120000_create_community_tables.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("community tables migration", () => {
  it("creates the two tables and indexes on up, and reverses them on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      createTable: (table, columns) => {
        events.push(`table:${table}:${Object.keys(columns).join(",")}`);
      },
      createIndex: (table, columns, options) => {
        events.push(
          `index:${table}:${columns.join(",")}:${options?.name ?? ""}:${options?.unique ? "unique" : "plain"}`,
        );
      },
      dropIndex: (table, columns) => {
        events.push(`dropIndex:${Array.isArray(table) ? table.join(",") : table}:${columns.join(",")}`);
      },
      dropTable: (table) => {
        events.push(`dropTable:${table}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      "table:community_threads:id,author_id,title,body,category,created_at,updated_at",
      "table:community_replies:id,thread_id,author_id,body,created_at",
      "index:community_threads:created_at,id:community_threads_created_at_id_idx:plain",
      "index:community_replies:thread_id,created_at:community_replies_thread_id_created_at_idx:plain",
      "dropIndex:community_replies:thread_id,created_at",
      "dropIndex:community_threads:created_at,id",
      "dropTable:community_replies",
      "dropTable:community_threads",
    ]);
  });
});
