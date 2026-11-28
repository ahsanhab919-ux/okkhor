/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "saved_items",
    {
      user_id: { type: "text", notNull: true },
      item_id: { type: "text", notNull: true },
      saved_at: { type: "text", notNull: true },
    },
    { constraints: { primaryKey: ["user_id", "item_id"] } },
  );

  pgm.createIndex("saved_items", ["user_id", "saved_at", "item_id"], {
    name: "saved_items_user_id_saved_at_item_id_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("saved_items", ["user_id", "saved_at", "item_id"], {
    ifExists: true,
    name: "saved_items_user_id_saved_at_item_id_idx",
  });

  pgm.dropTable("saved_items");
};
