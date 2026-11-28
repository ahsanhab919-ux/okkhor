import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications | Okkhor",
  description: "Outcomes from moderation and reporting, newest first.",
};

type NotificationsLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/notifications` shell. The edge middleware already rejects unauthenticated requests; the page
 * and every notifications endpoint re-check the session defensively (`notifications-slice.md` §7).
 */
export default function NotificationsLayout({ children }: NotificationsLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="YOUR INBOX" title="Notifications">
      {children}
    </ProtectedWorkspaceShell>
  );
}
