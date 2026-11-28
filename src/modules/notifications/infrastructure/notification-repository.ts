import type { NotificationRepository } from "@/src/modules/notifications/domain/notification-types";
import { getMemoryNotificationRepository } from "@/src/modules/notifications/infrastructure/notification-store";
import { getPostgresNotificationRepository } from "@/src/modules/notifications/infrastructure/postgres-notification-repository";

type NotificationsStorageDriver = "auto" | "memory" | "postgres";

function getNotificationsStorageDriver(): NotificationsStorageDriver {
  const driver = process.env.NOTIFICATIONS_STORAGE_DRIVER;

  if (driver === "memory" || driver === "postgres") {
    return driver;
  }

  return "auto";
}

export function getNotificationRepository(): NotificationRepository {
  const driver = getNotificationsStorageDriver();

  if (driver === "memory") {
    return getMemoryNotificationRepository();
  }

  if (driver === "postgres") {
    return getPostgresNotificationRepository();
  }

  if (process.env.NODE_ENV === "test") {
    return getMemoryNotificationRepository();
  }

  if (process.env.DATABASE_URL) {
    return getPostgresNotificationRepository();
  }

  throw new Error(
    "Notifications storage misconfiguration: DATABASE_URL is required outside test environments. Set DATABASE_URL, or set NOTIFICATIONS_STORAGE_DRIVER=memory for local, non-durable work.",
  );
}
