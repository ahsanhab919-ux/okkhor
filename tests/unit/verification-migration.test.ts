import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

type MigrationPgm = {
  createTable: (table: string, columns: Record<string, unknown>) => void;
  createIndex: (table: string, columns: string[], options?: { name?: string; unique?: boolean }) => void;
  dropIndex: (table: string | string[], columns: string[], options?: unknown) => void;
  dropTable: (table: string) => void;
};

const migration = requireFromHere("../../migrations/20261128110000_create_scholar_verifications.cjs") as {
  up: (pgm: MigrationPgm) => void;
  down: (pgm: MigrationPgm) => void;
};

describe("scholar verifications migration", () => {
  it("creates the table and indexes on up, and reverses them on down", () => {
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

    expect(events[0]).toBe(
      "table:scholar_verifications:id,applicant_id,status,display_name,degrees,affiliations,portfolio," +
        "specializations,languages,review_note,reviewed_by,submitted_at,reviewed_at,created_at,updated_at",
    );
    expect(events[1]).toBe("index:scholar_verifications:applicant_id:scholar_verifications_applicant_id_idx:unique");
    expect(events[2]).toBe(
      "index:scholar_verifications:status,submitted_at:scholar_verifications_status_submitted_at_idx:plain",
    );
    expect(events[3]).toBe("dropIndex:scholar_verifications:status,submitted_at");
    expect(events[4]).toBe("dropIndex:scholar_verifications:applicant_id");
    expect(events[5]).toBe("dropTable:scholar_verifications");
  });
});
