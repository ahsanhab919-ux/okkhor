/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Optional recovery/notification contact (password-reset-delivery-slice.md §9). Nullable and
  // non-unique: email is a secondary contact, never an identifier, so existing rows backfill to
  // NULL with no rewrite and two accounts may share an address.
  pgm.addColumn("auth_users", {
    email: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("auth_users", "email");
};
