/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("community_reports", {
    id: { type: "text", primaryKey: true },
    reporter_id: { type: "text", notNull: true },
    target_type: { type: "text", notNull: true },
    target_id: { type: "text", notNull: true },
    reason: { type: "text", notNull: true },
    detail: { type: "text" },
    status: { type: "text", notNull: true, default: "open" },
    created_at: { type: "text", notNull: true },
    resolved_by: { type: "text" },
    resolved_at: { type: "text" },
    resolution_note: { type: "text" },
  });

  // The idempotency guarantee: a member can hold at most one report per target, so a repeat report
  // is a no-op at the database, not only in the service (`member-reporting-slice.md` §7, §9).
  pgm.createIndex("community_reports", ["reporter_id", "target_type", "target_id"], {
    name: "community_reports_reporter_target_uidx",
    unique: true,
  });

  // The report queue reads open reports newest first.
  pgm.createIndex("community_reports", ["status", "created_at", "id"], {
    name: "community_reports_status_created_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("community_reports", { ifExists: true });
};
