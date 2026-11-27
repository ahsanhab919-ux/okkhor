/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("content_items", {
    id: { type: "text", primaryKey: true },
    title: { type: "text", notNull: true },
    abstract: { type: "text", notNull: true },
    summary_bn: { type: "text", notNull: true },
    source_language: { type: "text", notNull: true, default: "en" },
    tags: { type: "jsonb", notNull: true, default: "[]" },
    status: { type: "text", notNull: true, default: "draft" },
    source_url: { type: "text" },
    published_at: { type: "text" },
    created_at: { type: "text", notNull: true },
    updated_at: { type: "text", notNull: true },
  });

  pgm.createIndex("content_items", ["status", "published_at"], {
    name: "content_items_status_published_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("content_items", ["status", "published_at"], {
    ifExists: true,
    name: "content_items_status_published_at_idx",
  });
  pgm.dropTable("content_items");
};
