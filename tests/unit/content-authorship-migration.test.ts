import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  addColumns: (table: string, columns: Record<string, unknown>) => void;
  dropColumns: (table: string, columns: string[], options?: unknown) => void;
};

const migration = requireFromHere("../../migrations/20261128100000_add_content_item_authorship.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("content item authorship migration", () => {
  it("adds the author columns on up and drops them on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      addColumns: (table, columns) => {
        events.push(`add:${table}:${Object.keys(columns).join(",")}`);
      },
      dropColumns: (table, columns) => {
        events.push(`drop:${table}:${columns.join(",")}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual(["add:content_items:author_id,updated_by", "drop:content_items:author_id,updated_by"]);
  });
});
