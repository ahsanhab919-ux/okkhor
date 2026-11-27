exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("content_items", {
    author_id: { type: "text" },
    updated_by: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("content_items", ["author_id", "updated_by"], { ifExists: true });
};
