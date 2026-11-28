import type { VerificationRepository } from "@/src/modules/verification/domain/verification-types";
import { getPostgresVerificationRepository } from "@/src/modules/verification/infrastructure/postgres-verification-repository";
import { getMemoryVerificationRepository } from "@/src/modules/verification/infrastructure/verification-store";

type VerificationStorageDriver = "auto" | "memory" | "postgres";

function getVerificationStorageDriver(): VerificationStorageDriver {
  const driver = process.env.VERIFICATION_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getVerificationRepository(): VerificationRepository {
  const driver = getVerificationStorageDriver();

  if (driver === "memory") {
    return getMemoryVerificationRepository();
  }

  if (driver === "postgres") {
    return getPostgresVerificationRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryVerificationRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresVerificationRepository();
  }

  throw new Error(
    "Verification storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set VERIFICATION_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
