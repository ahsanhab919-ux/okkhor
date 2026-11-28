import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  addColumns: (table: string, columns: Record<string, unknown>) => void;
  dropColumns: (table: string, columns: string[], options?: { ifExists?: boolean }) => void;
};

const migration = requireFromHere("../../migrations/20261128160000_add_community_moderation.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("community moderation migration", () => {
  it("adds the moderation columns on up and drops the reply columns before the thread columns", () => {
    const events: string[] = [];
    const columns: Record<string, Record<string, unknown>> = {};
    const pgm: MigrationPgm = {
      addColumns: (table, cols) => {
        columns[table] = cols;
        events.push(`addColumns:${table}:${Object.keys(cols).join(",")}`);
      },
      dropColumns: (table, cols) => {
        events.push(`dropColumns:${table}:${cols.join(",")}`);
      },
    };

    migration.up(pgm);
    migration.down(pgm);

    expect(events).toEqual([
      "addColumns:community_threads:moderation_state,locked,moderated_by,moderated_at,moderation_note",
      "addColumns:community_replies:moderation_state,moderated_by,moderated_at,moderation_note",
      "dropColumns:community_replies:moderation_state,moderated_by,moderated_at,moderation_note",
      "dropColumns:community_threads:moderation_state,locked,moderated_by,moderated_at,moderation_note",
    ]);
    expect(columns.community_threads.moderation_state).toMatchObject({
      type: "text",
      notNull: true,
      default: "visible",
    });
    expect(columns.community_threads.locked).toMatchObject({
      type: "boolean",
      notNull: true,
      default: false,
    });
    expect(columns.community_replies.moderation_state).toMatchObject({
      type: "text",
      notNull: true,
      default: "visible",
    });
  });
});
