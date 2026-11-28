/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex("content_items", ["author_id", "published_at"], {
    name: "content_items_author_id_published_at_idx",
  });

  pgm.createIndex("community_threads", ["author_id", "created_at"], {
    name: "community_threads_author_id_created_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("community_threads", ["author_id", "created_at"], {
    ifExists: true,
    name: "community_threads_author_id_created_at_idx",
  });

  pgm.dropIndex("content_items", ["author_id", "published_at"], {
    ifExists: true,
    name: "content_items_author_id_published_at_idx",
  });
};
