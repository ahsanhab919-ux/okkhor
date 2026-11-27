import type { ContentRepository } from "@/src/modules/content/domain/content-types";
import { getMemoryContentRepository } from "@/src/modules/content/infrastructure/content-store";
import { getPostgresContentRepository } from "@/src/modules/content/infrastructure/postgres-content-repository";

type ContentStorageDriver = "auto" | "memory" | "postgres";

function getContentStorageDriver(): ContentStorageDriver {
  const driver = process.env.CONTENT_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getContentRepository(): ContentRepository {
  const driver = getContentStorageDriver();

  if (driver === "memory") {
    return getMemoryContentRepository();
  }

  if (driver === "postgres") {
    return getPostgresContentRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryContentRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresContentRepository();
  }

  throw new Error(
    "Content storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set CONTENT_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
