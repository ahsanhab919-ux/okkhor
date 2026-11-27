import type { AuthRepository } from "@/src/modules/identity/domain/auth-types";
import { getMemoryAuthRepository } from "@/src/modules/identity/infrastructure/auth-store";
import { getPostgresAuthRepository } from "@/src/modules/identity/infrastructure/postgres-auth-repository";

type AuthStorageDriver = "auto" | "memory" | "postgres";

function getAuthStorageDriver(): AuthStorageDriver {
  const driver = process.env.AUTH_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getAuthRepository(): AuthRepository {
  const driver = getAuthStorageDriver();

  if (driver === "memory") {
    return getMemoryAuthRepository();
  }

  if (driver === "postgres") {
    return getPostgresAuthRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryAuthRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresAuthRepository();
  }

  return getMemoryAuthRepository();
}
