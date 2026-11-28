import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  addColumn: (table: string, columns: Record<string, unknown>) => void;
  dropColumn: (table: string, column: string) => void;
};

const migration = requireFromHere("../../migrations/20261128180000_add_user_email.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("password reset delivery email migration", () => {
  it("adds a nullable, non-unique email column on up and reverses it on down", () => {
    const events: string[] = [];
    const pgm: MigrationPgm = {
      addColumn: (table, columns) => {
        events.push(`addColumn:${table}:${JSON.stringify(columns)}`);
      },
      dropColumn: (table, column) => {
        events.push(`dropColumn:${table}:${column}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      'addColumn:auth_users:{"email":{"type":"text"}}',
      "dropColumn:auth_users:email",
    ]);
  });
});
