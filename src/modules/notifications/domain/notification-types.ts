import type { NotificationDestination } from "@/src/modules/platform/domain/notification-types";

/**
 * The outcome a notification records. Each value is produced by exactly one producer and never
 * copies moderator- or reporter-only data (`notifications-slice.md` §5, §7).
 */
export type NotificationType =
  | "content_hidden"
  | "report_resolved"
  | "report_dismissed"
  | "reply_posted"
  | "verification_approved"
  | "verification_rejected";

/**
 * A single member notification. It records an *outcome* — a title, a body, and a link — never a copy
 * of the hidden content, the moderation note, or the report's detail.
 */
export type Notification = {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  /** The item this notification is about; `(recipientId, dedupeKey)` is the idempotency identity. */
  dedupeKey: string;
  readAt?: string;
  createdAt: string;
};

/**
 * The acting member, passed into notifications use cases as plain data. The module treats it as an
 * opaque actor; the app layer resolves it from the identity module.
 */
export type NotificationActor = {
  id: string;
};

/**
 * The input to `createNotification`. `destination` is used for outbound delivery only and is
 * **never persisted**, so contact points never enter the notifications store.
 */
export type CreateNotificationInput = {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  destination?: NotificationDestination;
};

export type ListNotificationsInput = {
  limit?: number;
};

export type ListNotificationsOptions = {
  limit: number;
};

export type CreateNotificationResult = {
  notification: Notification;
  /** `false` when a notification already existed for `(recipientId, dedupeKey)` — no send happens then. */
  created: boolean;
};

export type NotificationRepository = {
  /**
   * Idempotent on `(recipientId, dedupeKey)`; never duplicates. Returns the notification that is
   * stored afterwards — the new one, or the pre-existing one — and whether this call created it.
   */
  createNotification(notification: Notification): Promise<CreateNotificationResult>;
  /** The member's notifications, `createdAt` descending then `id` descending, truncated to `limit`. */
  listNotifications(recipientId: string, options: ListNotificationsOptions): Promise<Notification[]>;
  getNotificationById(id: string): Promise<Notification | undefined>;
  /** Sets `readAt` on an unread notification; returns the stored row, or `undefined` when none matched. */
  markNotificationRead(id: string, readAt: string): Promise<Notification | undefined>;
  /** Sets `readAt` on every unread notification of the recipient; returns how many rows changed. */
  markAllNotificationsRead(recipientId: string, readAt: string): Promise<number>;
};

export type NotificationStore = {
  notifications: Map<string, Notification>;
};
