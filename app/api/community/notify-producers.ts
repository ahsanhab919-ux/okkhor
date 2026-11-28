import { getThread } from "@/src/modules/community/application/community-service";
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
 * the other. The producer routes call these **after** the community write has committed; every
 * failure is logged and swallowed so a notification can never fail the action it reports on, and a
 * member is never messaged about their own action (`notifications-slice.md` §7, §8;
 * `reply-notifications-slice.md` §7, §8).
 */

type NotifyInput = {
  /** The acting member — when they are also the recipient, the notification is suppressed. */
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

/**
 * Notifies every member who is part of a thread — its author and the authors of its prior visible
 * replies — that a new reply was posted, excluding the replier. Recipients are derived from the
 * thread's public structure via `getThread`, de-duplicated, and each receives at most one row per
 * reply (the `reply_posted:<replyId>` dedupe key). The notification carries no reply text and no
 * replier identity. Best-effort: it runs after the reply commits and a failure is swallowed
 * (`reply-notifications-slice.md` §6, §7).
 */
export async function notifyNewReply(
  actorId: string,
  threadId: string,
  replyId: string,
): Promise<void> {
  try {
    const { thread, replies } = await getThread(threadId);

    const recipientIds = new Set<string>([
      thread.authorId,
      ...replies.map((reply) => reply.authorId),
    ]);
    recipientIds.delete(actorId);

    await Promise.all(
      [...recipientIds].map((recipientId) =>
        notify({
          actorId,
          recipientId,
          type: "reply_posted",
          title: "New reply in a discussion you're part of",
          body: "Someone replied to a community thread you're part of. Open it to catch up.",
          href: `/community/${threadId}`,
          dedupeKey: `reply_posted:${replyId}`,
        }),
      ),
    );
  } catch (error) {
    console.error("[notification] Failed to create reply_posted notifications.", error);
  }
}
