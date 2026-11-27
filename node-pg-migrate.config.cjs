module.exports = {
  db: {
    "migrations-table": "schema_migrations",
    "migrations-dir": "migrations",
    schema: "public",
    "create-schema": false,
    "create-migrations-schema": false,
    "check-order": true,
    verbose: true,
    "single-transaction": true,
    "advisory-lock-mode": "fail",
  },
};
