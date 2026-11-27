import { getPostgresConnectionString, getPostgresPoolConfig } from "@/src/modules/identity/infrastructure/postgres-config";

describe("postgres config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("builds pool config from documented environment variables", () => {
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/okkhor";
    process.env.DB_POOL_MAX = "24";
    process.env.DB_POOL_IDLE_TIMEOUT_MS = "15000";
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "3000";
    process.env.DB_POOL_MAX_USES = "4000";

    const config = getPostgresPoolConfig();

    expect(config.connectionString).toBe(process.env.DATABASE_URL);
    expect(config.max).toBe(24);
    expect(config.idleTimeoutMillis).toBe(15000);
    expect(config.connectionTimeoutMillis).toBe(3000);
    expect(config.maxUses).toBe(4000);
  });

  it("falls back to safe defaults when optional pool settings are invalid", () => {
    process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/okkhor";
    process.env.DB_POOL_MAX = "0";
    process.env.DB_POOL_IDLE_TIMEOUT_MS = "abc";
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS = "-1";
    process.env.DB_POOL_MAX_USES = "NaN";

    const config = getPostgresPoolConfig();

    expect(config.max).toBe(10);
    expect(config.idleTimeoutMillis).toBe(10000);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.maxUses).toBe(7500);
  });

  it("fails explicitly when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;

    expect(() => getPostgresConnectionString()).toThrow("DATABASE_URL is required");
  });
});
