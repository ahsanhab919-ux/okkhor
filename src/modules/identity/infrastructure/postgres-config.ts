import type { PoolConfig } from "pg";

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getPostgresConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required when auth storage uses the postgres driver.");
  }

  return connectionString;
}

export function getPostgresPoolConfig(): PoolConfig {
  return {
    connectionString: getPostgresConnectionString(),
    max: readPositiveInteger(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: readPositiveInteger(process.env.DB_POOL_IDLE_TIMEOUT_MS, 10_000),
    connectionTimeoutMillis: readPositiveInteger(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 5_000),
    maxUses: readPositiveInteger(process.env.DB_POOL_MAX_USES, 7_500),
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  };
}
