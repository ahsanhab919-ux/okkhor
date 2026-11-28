import type { SearchRepository } from "@/src/modules/search/domain/search-types";
import { getPostgresSearchRepository } from "@/src/modules/search/infrastructure/postgres-search-repository";
import { getMemorySearchRepository } from "@/src/modules/search/infrastructure/search-store";

type SearchStorageDriver = "auto" | "memory" | "postgres";

function getSearchStorageDriver(): SearchStorageDriver {
  const driver = process.env.SEARCH_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getSearchRepository(): SearchRepository {
  const driver = getSearchStorageDriver();

  if (driver === "memory") {
    return getMemorySearchRepository();
  }

  if (driver === "postgres") {
    return getPostgresSearchRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemorySearchRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresSearchRepository();
  }

  throw new Error(
    "Search storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set SEARCH_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
