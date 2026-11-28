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

const migration = requireFromHere("../../migrations/20261128200000_create_notifications.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("notifications migration", () => {
  it("creates the notifications table and its indexes on up, and drops it on down", () => {
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
      "createTable:notifications",
      "createIndex:notifications:notifications_recipient_dedupe_uidx",
      "createIndex:notifications:notifications_recipient_created_at_idx",
      "dropTable:notifications",
    ]);
    expect(tables.notifications.id).toMatchObject({ type: "text", primaryKey: true });
    expect(tables.notifications.recipient_id).toMatchObject({ type: "text", notNull: true });
    expect(tables.notifications.dedupe_key).toMatchObject({ type: "text", notNull: true });
    expect(tables.notifications.read_at).toMatchObject({ type: "text" });
    expect(tables.notifications.created_at).toMatchObject({ type: "text", notNull: true });

    // The idempotency guarantee: one notification per member per item, enforced in the data layer.
    expect(indexes[0]).toMatchObject({
      name: "notifications_recipient_dedupe_uidx",
      unique: true,
      columns: ["recipient_id", "dedupe_key"],
    });
    expect(indexes[1]).toMatchObject({
      name: "notifications_recipient_created_at_idx",
      columns: ["recipient_id", "created_at", "id"],
    });
  });
});
