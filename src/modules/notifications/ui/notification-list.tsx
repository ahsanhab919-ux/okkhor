import Link from "next/link";
import React from "react";

import { Icon } from "@/src/modules/experience/ui";
import type { Notification, NotificationType } from "@/src/modules/notifications/domain/notification-types";
import { MarkReadButton } from "@/src/modules/notifications/ui/notification-actions";

/** The icon a notification's real `type` renders in its tile (Stitch draws one glyph per kind). */
const TYPE_ICON: Record<NotificationType, "shield" | "check" | "community" | "scholar" | "bell"> = {
  content_hidden: "shield",
  report_resolved: "check",
  report_dismissed: "check",
  reply_posted: "community",
  verification_approved: "scholar",
  verification_rejected: "shield",
};

type NotificationGroup = {
  label: string;
  items: Notification[];
};

const DAY_MS = 86_400_000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * Splits the inbox into the Stitch "Today / Yesterday / Earlier" recency groups, deriving each
 * bucket from the notification's real `createdAt`. Empty buckets are dropped; the input order
 * (newest first) is preserved within each group.
 */
function groupByRecency(notifications: Notification[], now: Date): NotificationGroup[] {
  const today = startOfDay(now);
  const groups: NotificationGroup[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const notification of notifications) {
    const day = startOfDay(new Date(notification.createdAt));

    if (day === today) {
      groups[0].items.push(notification);
    } else if (day === today - DAY_MS) {
      groups[1].items.push(notification);
    } else {
      groups[2].items.push(notification);
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

/**
 * The member inbox, aligned to the Stitch "Notification Center" stream: newest first, grouped by
 * recency, each entry a card whose type glyph, title, body and outcome link are all real
 * notification fields. Unread entries carry the primary left edge and a dot; the per-item mark-read
 * affordance is kept (`notifications-slice.md` §3, §13 decision 4).
 */
export function NotificationList({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) {
    return (
      <p>
        You have no notifications yet. When a moderator acts on your community content, or a report
        you filed is closed, the outcome appears here. Head to the{" "}
        <Link className="inline-link" href="/community">
          community
        </Link>{" "}
        to join the discussion.
      </p>
    );
  }

  const groups = groupByRecency(notifications, new Date());

  return (
    <div className="notification-stream">
      {groups.map((group) => (
        <section key={group.label} className="notification-group">
          <div className="notification-group__head">
            <h2 className="notification-group__label">{group.label}</h2>
            <span className="notification-group__rule" aria-hidden="true" />
          </div>

          <div className="notification-group__items">
            {group.items.map((notification) => (
              <article
                key={notification.id}
                className={`notification-card${notification.readAt ? "" : " notification-card--unread"}`}
              >
                {notification.readAt ? null : <span className="notification-card__dot" aria-hidden="true" />}

                <span className="notification-card__icon" aria-hidden="true">
                  <Icon name={TYPE_ICON[notification.type]} />
                </span>

                <div className="notification-card__body">
                  <h3 className="notification-card__title">{notification.title}</h3>
                  <p className="notification-card__text">{notification.body}</p>

                  <div className="notification-card__foot">
                    <span className="notification-card__ago">{notification.createdAt.slice(0, 10)}</span>

                    <div className="notification-card__actions">
                      <Link className="inline-link" href={notification.href}>
                        View
                        <Icon className="icon-sm" name="arrow-right" />
                      </Link>
                      {notification.readAt ? null : <MarkReadButton notificationId={notification.id} />}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
