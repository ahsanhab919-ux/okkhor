import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationIndex = {
  name: string;
  unique?: boolean;
  columns: string[];
};

type MigrationPgm = {
  createTable: (table: string, columns: Record<string, unknown>) => void;
  createIndex: (table: string, columns: string[], options?: { name?: string; unique?: boolean }) => void;
  dropTable: (table: string, options?: { ifExists?: boolean }) => void;
};

const migration = requireFromHere("../../migrations/20261128190000_create_community_reports.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("community reports migration", () => {
  it("creates the reports table and its indexes on up, and drops it on down", () => {
    const events: string[] = [];
    const tables: Record<string, Record<string, unknown>> = {};
    const indexes: MigrationIndex[] = [];
    const pgm: MigrationPgm = {
      createTable: (table, columns) => {
        tables[table] = columns;
        events.push(`createTable:${table}`);
      },
      createIndex: (table, columns, options) => {
        indexes.push({ name: options?.name ?? "", unique: options?.unique, columns });
        events.push(`createIndex:${table}:${options?.name}`);
      },
      dropTable: (table) => {
        events.push(`dropTable:${table}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      "createTable:community_reports",
      "createIndex:community_reports:community_reports_reporter_target_uidx",
      "createIndex:community_reports:community_reports_status_created_at_idx",
      "dropTable:community_reports",
    ]);
    expect(tables.community_reports.id).toMatchObject({ type: "text", primaryKey: true });
    expect(tables.community_reports.reporter_id).toMatchObject({ type: "text", notNull: true });
    expect(tables.community_reports.status).toMatchObject({ type: "text", notNull: true, default: "open" });
    expect(tables.community_reports.resolution_note).toMatchObject({ type: "text" });

    // The idempotency guarantee: one report per member per target, enforced in the data layer.
    expect(indexes[0]).toMatchObject({
      name: "community_reports_reporter_target_uidx",
      unique: true,
      columns: ["reporter_id", "target_type", "target_id"],
    });
    expect(indexes[1]).toMatchObject({
      name: "community_reports_status_created_at_idx",
      columns: ["status", "created_at", "id"],
    });
  });
});
