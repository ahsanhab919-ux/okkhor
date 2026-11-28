/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex("content_items", "tags", {
    name: "content_items_tags_gin_idx",
    method: "gin",
  });

  pgm.createIndex("community_threads", ["category", "created_at"], {
    name: "community_threads_category_created_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("community_threads", ["category", "created_at"], {
    ifExists: true,
    name: "community_threads_category_created_at_idx",
  });

  pgm.dropIndex("content_items", "tags", {
    ifExists: true,
    name: "content_items_tags_gin_idx",
  });
};
