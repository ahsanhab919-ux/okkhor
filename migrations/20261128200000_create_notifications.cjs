/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("notifications", {
    id: { type: "text", primaryKey: true },
    recipient_id: { type: "text", notNull: true },
    type: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    href: { type: "text", notNull: true },
    dedupe_key: { type: "text", notNull: true },
    read_at: { type: "text" },
    created_at: { type: "text", notNull: true },
  });

  // The idempotency guarantee: a member holds at most one notification per item, so a repeated
  // moderation action is a no-op at the database, not only in the service
  // (`notifications-slice.md` §7, §9).
  pgm.createIndex("notifications", ["recipient_id", "dedupe_key"], {
    name: "notifications_recipient_dedupe_uidx",
    unique: true,
  });

  // The inbox reads a member's notifications newest first.
  pgm.createIndex("notifications", ["recipient_id", "created_at", "id"], {
    name: "notifications_recipient_created_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("notifications", { ifExists: true });
};
