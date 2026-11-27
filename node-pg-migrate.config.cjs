module.exports = {
  db: {
    databaseUrl: process.env.DATABASE_URL,
    migrationsTable: "schema_migrations",
    dir: "migrations",
    schema: "public",
    createSchema: false,
    createMigrationsSchema: false,
    checkOrder: true,
    verbose: true,
    singleTransaction: true,
    advisoryLockMode: "fail",
  },
};
