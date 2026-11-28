/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("community_threads", {
    id: { type: "text", primaryKey: true },
    author_id: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    category: { type: "text", notNull: true, default: "General" },
    created_at: { type: "text", notNull: true },
    updated_at: { type: "text", notNull: true },
  });

  pgm.createTable("community_replies", {
    id: { type: "text", primaryKey: true },
    thread_id: { type: "text", notNull: true },
    author_id: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    created_at: { type: "text", notNull: true },
  });

  pgm.createIndex("community_threads", ["created_at", "id"], {
    name: "community_threads_created_at_id_idx",
  });

  pgm.createIndex("community_replies", ["thread_id", "created_at"], {
    name: "community_replies_thread_id_created_at_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("community_replies", ["thread_id", "created_at"], {
    ifExists: true,
    name: "community_replies_thread_id_created_at_idx",
  });

  pgm.dropIndex("community_threads", ["created_at", "id"], {
    ifExists: true,
    name: "community_threads_created_at_id_idx",
  });

  pgm.dropTable("community_replies");
  pgm.dropTable("community_threads");
};
