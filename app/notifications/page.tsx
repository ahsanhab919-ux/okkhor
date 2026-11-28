import React from "react";

import { listNotifications } from "@/src/modules/notifications/application/notification-service";
import { NotificationList } from "@/src/modules/notifications/ui/notification-list";

import { getNotificationsViewer } from "../notifications-session";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const viewer = await getNotificationsViewer();
  const notifications = viewer ? await listNotifications(viewer.actor, { limit: 20 }) : [];

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Inbox</p>
          <h1>Notifications</h1>
        </div>
        <p>Moderation outcomes and report decisions, newest first. Only you can see your inbox.</p>
      </div>

      <NotificationList notifications={notifications} />
    </section>
  );
}
