import type {
  CommunityReport,
  CommunityReply,
  CommunityThread,
} from "@/src/modules/community/domain/community-types";
import { getNotificationDestinationById } from "@/src/modules/identity/application/auth-service";
import { createNotification } from "@/src/modules/notifications/application/notification-service";
import type { NotificationType } from "@/src/modules/notifications/domain/notification-types";

/**
 * Composition-root helper: joins `community` and `notifications` without either module importing
 * the other. The producer routes call these **after** the moderation write has committed; every
 * failure is logged and swallowed so a notification can never fail the moderation action it reports
 * on, and a member is never messaged about their own moderation action (`notifications-slice.md`
 * §7, §8).
 */

type NotifyInput = {
  /** The acting administrator — when they are also the recipient, the notification is suppressed. */
  actorId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
};

async function notify(input: NotifyInput): Promise<void> {
  if (input.actorId === input.recipientId) {
    return;
  }

  try {
    const destination = await getNotificationDestinationById(input.recipientId);

    await createNotification({
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
      dedupeKey: input.dedupeKey,
      destination,
    });
  } catch (error) {
    console.error(`[notification] Failed to create a ${input.type} notification.`, error);
  }
}

/** Notifies a thread's author that their thread was hidden. A non-`hide` action notifies no one. */
export async function notifyThreadModeration(
  actorId: string,
  action: string,
  thread: CommunityThread,
): Promise<void> {
  if (action !== "hide") {
    return;
  }

  await notify({
    actorId,
    recipientId: thread.authorId,
    type: "content_hidden",
    title: "Your thread was hidden",
    body: "An administrator hid your thread in the community. Review the community guidelines before reposting.",
    href: "/community",
    dedupeKey: `content_hidden:${thread.id}`,
  });
}

/** Notifies a reply's author that their reply was hidden. A `restore` notifies no one. */
export async function notifyReplyModeration(
  actorId: string,
  action: string,
  reply: CommunityReply,
): Promise<void> {
  if (action !== "hide") {
    return;
  }

  await notify({
    actorId,
    recipientId: reply.authorId,
    type: "content_hidden",
    title: "Your reply was hidden",
    body: "An administrator hid your reply in a community discussion. Review the community guidelines before replying again.",
    href: `/community/${reply.threadId}`,
    dedupeKey: `content_hidden:${reply.id}`,
  });
}

/** Notifies a report's reporter of the outcome. Any action other than resolve/dismiss notifies no one. */
export async function notifyReportOutcome(
  actorId: string,
  action: string,
  report: CommunityReport,
): Promise<void> {
  const isResolve = action === "resolve";
  const isDismiss = action === "dismiss";

  if (!isResolve && !isDismiss) {
    return;
  }

  await notify({
    actorId,
    recipientId: report.reporterId,
    type: isResolve ? "report_resolved" : "report_dismissed",
    title: isResolve ? "Your report was resolved" : "Your report was dismissed",
    body: isResolve
      ? "Thanks for flagging. An administrator reviewed your report and took action."
      : "Thanks for flagging. An administrator reviewed your report and found no action was needed.",
    href: "/community",
    dedupeKey: `${isResolve ? "report_resolved" : "report_dismissed"}:${report.id}`,
  });
}
