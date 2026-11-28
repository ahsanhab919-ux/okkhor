import type { CommunityRepository } from "@/src/modules/community/domain/community-types";
import { getMemoryCommunityRepository } from "@/src/modules/community/infrastructure/community-store";
import { getPostgresCommunityRepository } from "@/src/modules/community/infrastructure/postgres-community-repository";

type CommunityStorageDriver = "auto" | "memory" | "postgres";

function getCommunityStorageDriver(): CommunityStorageDriver {
  const driver = process.env.COMMUNITY_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getCommunityRepository(): CommunityRepository {
  const driver = getCommunityStorageDriver();

  if (driver === "memory") {
    return getMemoryCommunityRepository();
  }

  if (driver === "postgres") {
    return getPostgresCommunityRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryCommunityRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresCommunityRepository();
  }

  throw new Error(
    "Community storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set COMMUNITY_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
