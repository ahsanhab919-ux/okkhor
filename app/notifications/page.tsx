import React from "react";

import { listNotifications } from "@/src/modules/notifications/application/notification-service";
import { MarkAllReadButton } from "@/src/modules/notifications/ui/notification-actions";
import { NotificationList } from "@/src/modules/notifications/ui/notification-list";

import { getNotificationsViewer } from "../notifications-session";

export const dynamic = "force-dynamic";

/**
 * The notifications page, aligned to the Stitch "Notification Center": a hero carrying the title,
 * lead and the mark-all action, over the recency-grouped inbox. Every rendered value is a real
 * notification field; the "End of Notifications" flourish and the timeline slider the design draws
 * are decorative and backed by nothing, so they are omitted.
 */
export default async function NotificationsPage() {
  const viewer = await getNotificationsViewer();
  const notifications = viewer ? await listNotifications(viewer.actor, { limit: 20 }) : [];
  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <div className="inbox-page">
      <header className="inbox-hero">
        <div className="inbox-hero__copy">
          <h1 className="inbox-hero__title">Notifications</h1>
          <p className="inbox-hero__lead">
            Stay updated with your research journey and community interactions.
          </p>
        </div>
        {hasUnread ? <MarkAllReadButton /> : null}
      </header>

      <NotificationList notifications={notifications} />
    </div>
  );
}
