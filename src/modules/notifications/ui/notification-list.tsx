import Link from "next/link";
import React from "react";

import { Icon } from "@/src/modules/experience/ui";
import type { Notification } from "@/src/modules/notifications/domain/notification-types";
import { MarkAllReadButton, MarkReadButton } from "@/src/modules/notifications/ui/notification-actions";

/**
 * The member inbox list: newest first, each entry an outcome with a link and, when unread, a
 * mark-read affordance. An empty inbox shows an empty state
 * (`notifications-slice.md` §3, §13 decision 4).
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

  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <div className="notification-inbox">
      {hasUnread ? (
        <div className="discussion-card__actions">
          <MarkAllReadButton />
        </div>
      ) : null}

      <section className="discussion-list">
        {notifications.map((notification) => (
          <article key={notification.id} className="discussion-card">
            <div className="discussion-card__body">
              <div className="discussion-card__meta">
                <span className="pill">{notification.readAt ? "Read" : "New"}</span>
                <span>{notification.createdAt.slice(0, 10)}</span>
              </div>
              <h3>{notification.title}</h3>
              <p>{notification.body}</p>

              <div className="discussion-card__actions">
                <Link className="inline-link" href={notification.href}>
                  View
                  <Icon className="icon-sm" name="arrow-right" />
                </Link>
                {notification.readAt ? null : <MarkReadButton notificationId={notification.id} />}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
