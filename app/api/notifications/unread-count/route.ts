import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { notificationErrorResponse, notificationJson } from "@/src/modules/notifications/api/notification-http";
import { countUnreadNotifications } from "@/src/modules/notifications/application/notification-service";

import { resolveNotificationActor } from "../notification-actor";

export const runtime = "nodejs";

/** The caller's unread count — the number the workspace sidebar badge shows. */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveNotificationActor(request);
    const unread = await countUnreadNotifications(actor);

    return notificationJson({ unread });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return notificationErrorResponse(error);
  }
}
