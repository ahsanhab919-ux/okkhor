import { randomUUID } from "node:crypto";

import { NotificationError } from "@/src/modules/notifications/domain/notification-errors";
import { listNotificationsSchema } from "@/src/modules/notifications/domain/notification-schemas";
import type {
  CreateNotificationInput,
  CreateNotificationResult,
  ListNotificationsInput,
  Notification,
  NotificationActor,
} from "@/src/modules/notifications/domain/notification-types";
import { getNotificationRepository } from "@/src/modules/notifications/infrastructure/notification-repository";
import type { NotificationChannel, NotificationMessage } from "@/src/modules/platform/domain/notification-types";
import { getNotificationChannels } from "@/src/modules/platform/infrastructure/notification-channel";

/**
 * Delivers a message through every resolved channel, isolating failures: a failing channel is
 * logged and never thrown, so it cannot stop another channel and never changes the caller's
 * response (`notifications-slice.md` §7, §9.2).
 */
async function deliverNotification(channels: NotificationChannel[], message: NotificationMessage) {
  if (channels.length === 0) {
    console.error("[notification] No delivery channel is configured; the message was not sent.");
    return;
  }

  await Promise.all(
    channels.map(async (channel) => {
      try {
        await channel.send(message);
      } catch (error) {
        console.error(`[notification] ${channel.kind} delivery failed.`, error);
      }
    }),
  );
}

/**
 * Creates a member notification: it **persists first** (so the inbox always has the outcome) and
 * then delivers **best-effort** — and only when the row was newly created, so a retried moderation
 * call neither re-notifies nor re-sends (`notifications-slice.md` §7, §9.2). Delivery is skipped
 * entirely when no `destination` could be resolved. A failed send is logged and swallowed, so the
 * producer's moderation action is never affected.
 */
export async function createNotification(input: CreateNotificationInput): Promise<CreateNotificationResult> {
  const result = await getNotificationRepository().createNotification({
    id: randomUUID(),
    recipientId: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href,
    dedupeKey: input.dedupeKey,
    createdAt: new Date().toISOString(),
  });

  if (result.created && input.destination) {
    await deliverNotification(getNotificationChannels(), {
      destination: input.destination,
      subject: result.notification.title,
      body: result.notification.body,
    });
  }

  return result;
}

function normalizeLimit(limit: unknown): number {
  return listNotificationsSchema.parse({ limit }).limit;
}

/** The acting member's inbox, newest first, capped at the clamped page size. */
export async function listNotifications(
  actor: NotificationActor,
  input: ListNotificationsInput = {},
): Promise<Notification[]> {
  return getNotificationRepository().listNotifications(actor.id, { limit: normalizeLimit(input.limit) });
}

/**
 * Marks one of the acting member's notifications read. An unknown id **or** a notification that
 * belongs to another member raises the same `NOTIFICATION_NOT_FOUND` (404), so the endpoint is not
 * an existence oracle for other members' notifications (`notifications-slice.md` §6, §7).
 */
export async function markNotificationRead(actor: NotificationActor, id: string): Promise<Notification> {
  const existing = await getNotificationRepository().getNotificationById(id);

  if (!existing || existing.recipientId !== actor.id) {
    throw new NotificationError("Notification was not found.", "NOTIFICATION_NOT_FOUND", 404);
  }

  const updated = await getNotificationRepository().markNotificationRead(id, new Date().toISOString());

  return updated ?? existing;
}

/** Marks every unread notification of the acting member read; returns how many changed. */
export async function markAllNotificationsRead(actor: NotificationActor): Promise<number> {
  return getNotificationRepository().markAllNotificationsRead(actor.id, new Date().toISOString());
}

/**
 * The acting member's unread count — the number the workspace badge shows. Owner-scoped to the
 * actor; a purely read lookup (`notifications-slice.md` §4, `unread-badge-slice.md` §6.1).
 */
export async function countUnreadNotifications(actor: NotificationActor): Promise<number> {
  return getNotificationRepository().countUnread(actor.id);
}
