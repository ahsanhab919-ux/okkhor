import type { NextRequest } from "next/server";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import type { NotificationActor } from "@/src/modules/notifications/domain/notification-types";

/**
 * Composition-root helper: resolve the acting member from the access-token cookie through the
 * identity module's public surface. Throws an `AuthError` (401) when unauthenticated.
 */
export async function resolveNotificationActor(request: NextRequest): Promise<NotificationActor> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
  }

  const session = await getSessionFromAccessToken(accessToken);

  return { id: session.user.id };
}
