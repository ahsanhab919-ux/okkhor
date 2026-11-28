import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";
import type { NotificationActor } from "@/src/modules/notifications/domain/notification-types";

export type NotificationsViewer = {
  user: UserProfile;
  sessionId: string;
  actor: NotificationActor;
};

/**
 * Composition-root helper: resolves the current member for the notifications pages from the
 * access-token cookie. The edge middleware only checks authentication, so the member scope is
 * applied server-side by the page that needs it (`ADR-001`). Returns `undefined` for an anonymous
 * visitor.
 */
export async function getNotificationsViewer(): Promise<NotificationsViewer | undefined> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return undefined;
  }

  try {
    const session = await getSessionFromAccessToken(accessToken);

    return {
      ...session,
      actor: { id: session.user.id },
    };
  } catch {
    return undefined;
  }
}
