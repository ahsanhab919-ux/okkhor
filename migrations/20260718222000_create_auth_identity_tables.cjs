/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("auth_users", {
    id: { type: "text", primaryKey: true },
    phone_number: { type: "text", notNull: true, unique: true },
    display_name: { type: "text", notNull: true },
    locale: { type: "text", notNull: true },
    roles: { type: "jsonb", notNull: true },
    created_at: { type: "text", notNull: true },
    updated_at: { type: "text", notNull: true },
    last_login_at: { type: "text" },
    password_updated_at: { type: "text", notNull: true },
    password_hash: { type: "text", notNull: true },
  });

  pgm.createTable("auth_sessions", {
    id: { type: "text", primaryKey: true },
    user_id: {
      type: "text",
      notNull: true,
      references: "auth_users(id)",
      onDelete: "CASCADE",
    },
    refresh_token_hash: { type: "text", notNull: true },
    created_at: { type: "text", notNull: true },
    expires_at: { type: "text", notNull: true },
    revoked_at: { type: "text" },
  });

  pgm.createIndex("auth_sessions", "user_id", {
    name: "auth_sessions_user_id_idx",
  });

  pgm.createTable("auth_password_resets", {
    id: { type: "text", primaryKey: true },
    user_id: {
      type: "text",
      notNull: true,
      references: "auth_users(id)",
      onDelete: "CASCADE",
    },
    token_hash: { type: "text", notNull: true, unique: true },
    created_at: { type: "text", notNull: true },
    expires_at: { type: "text", notNull: true },
    used_at: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("auth_password_resets");
  pgm.dropIndex("auth_sessions", "user_id", {
    ifExists: true,
    name: "auth_sessions_user_id_idx",
  });
  pgm.dropTable("auth_sessions");
  pgm.dropTable("auth_users");
};
