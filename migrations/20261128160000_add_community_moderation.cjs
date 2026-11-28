/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("community_threads", {
    moderation_state: { type: "text", notNull: true, default: "visible" },
    locked: { type: "boolean", notNull: true, default: false },
    moderated_by: { type: "text" },
    moderated_at: { type: "text" },
    moderation_note: { type: "text" },
  });

  pgm.addColumns("community_replies", {
    moderation_state: { type: "text", notNull: true, default: "visible" },
    moderated_by: { type: "text" },
    moderated_at: { type: "text" },
    moderation_note: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns(
    "community_replies",
    ["moderation_state", "moderated_by", "moderated_at", "moderation_note"],
    { ifExists: true },
  );

  pgm.dropColumns(
    "community_threads",
    ["moderation_state", "locked", "moderated_by", "moderated_at", "moderation_note"],
    { ifExists: true },
  );
};
