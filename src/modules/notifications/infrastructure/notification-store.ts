import type {
  CreateNotificationResult,
  Notification,
  NotificationRepository,
  NotificationStore,
} from "@/src/modules/notifications/domain/notification-types";

declare global {
  var __okkhorNotificationStore: NotificationStore | undefined;
  var __okkhorMemoryNotificationRepository: NotificationRepository | undefined;
}

function createStore(): NotificationStore {
  return {
    notifications: new Map(),
  };
}

/** Orders notifications by `createdAt` descending, then `id` descending (the inbox order). */
function compareNotificationsByCreatedAtDesc(left: Notification, right: Notification): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

function createMemoryNotificationRepository(): NotificationRepository {
  function findExisting(recipientId: string, dedupeKey: string): Notification | undefined {
    for (const notification of getNotificationStore().notifications.values()) {
      if (notification.recipientId === recipientId && notification.dedupeKey === dedupeKey) {
        return notification;
      }
    }

    return undefined;
  }

  return {
    async createNotification(notification): Promise<CreateNotificationResult> {
      const existing = findExisting(notification.recipientId, notification.dedupeKey);

      if (existing) {
        return { notification: existing, created: false };
      }

      getNotificationStore().notifications.set(notification.id, notification);

      return { notification, created: true };
    },
    async listNotifications(recipientId, { limit }) {
      return Array.from(getNotificationStore().notifications.values())
        .filter((notification) => notification.recipientId === recipientId)
        .sort(compareNotificationsByCreatedAtDesc)
        .slice(0, limit);
    },
    async getNotificationById(id) {
      return getNotificationStore().notifications.get(id);
    },
    async markNotificationRead(id, readAt) {
      const existing = getNotificationStore().notifications.get(id);

      if (!existing) {
        return undefined;
      }

      if (existing.readAt) {
        return existing;
      }

      const updated: Notification = { ...existing, readAt };
      getNotificationStore().notifications.set(id, updated);

      return updated;
    },
    async markAllNotificationsRead(recipientId, readAt) {
      let updated = 0;

      for (const [id, notification] of getNotificationStore().notifications.entries()) {
        if (notification.recipientId === recipientId && !notification.readAt) {
          getNotificationStore().notifications.set(id, { ...notification, readAt });
          updated += 1;
        }
      }

      return updated;
    },
  };
}

export function getNotificationStore(): NotificationStore {
  if (!globalThis.__okkhorNotificationStore) {
    globalThis.__okkhorNotificationStore = createStore();
  }

  return globalThis.__okkhorNotificationStore;
}

export function getMemoryNotificationRepository(): NotificationRepository {
  if (!globalThis.__okkhorMemoryNotificationRepository) {
    globalThis.__okkhorMemoryNotificationRepository = createMemoryNotificationRepository();
  }

  return globalThis.__okkhorMemoryNotificationRepository;
}

export function resetNotificationStoreForTesting() {
  globalThis.__okkhorNotificationStore = createStore();
  globalThis.__okkhorMemoryNotificationRepository = createMemoryNotificationRepository();
}
