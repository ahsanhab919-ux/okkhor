import type { LibraryRepository } from "@/src/modules/library/domain/library-types";
import { getMemoryLibraryRepository } from "@/src/modules/library/infrastructure/library-store";
import { getPostgresLibraryRepository } from "@/src/modules/library/infrastructure/postgres-library-repository";

type LibraryStorageDriver = "auto" | "memory" | "postgres";

function getLibraryStorageDriver(): LibraryStorageDriver {
  const driver = process.env.LIBRARY_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getLibraryRepository(): LibraryRepository {
  const driver = getLibraryStorageDriver();

  if (driver === "memory") {
    return getMemoryLibraryRepository();
  }

  if (driver === "postgres") {
    return getPostgresLibraryRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryLibraryRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresLibraryRepository();
  }

  throw new Error(
    "Library storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set LIBRARY_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
