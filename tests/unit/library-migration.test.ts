import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  createTable: (
    table: string,
    columns: Record<string, unknown>,
    options?: { constraints?: { primaryKey?: string[] } },
  ) => void;
  createIndex: (table: string, columns: string[], options?: { name?: string; unique?: boolean }) => void;
  dropIndex: (table: string | string[], columns: string[], options?: unknown) => void;
  dropTable: (table: string) => void;
};

const migration = requireFromHere("../../migrations/20261128130000_create_saved_items.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("saved items migration", () => {
  it("creates the saved-items table and index on up, and reverses them on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      createTable: (table, columns, options) => {
        events.push(
          `table:${table}:${Object.keys(columns).join(",")}:pk=${options?.constraints?.primaryKey?.join(",") ?? ""}`,
        );
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
      "table:saved_items:user_id,item_id,saved_at:pk=user_id,item_id",
      "index:saved_items:user_id,saved_at,item_id:saved_items_user_id_saved_at_item_id_idx:plain",
      "dropIndex:saved_items:user_id,saved_at,item_id",
      "dropTable:saved_items",
    ]);
  });
});
