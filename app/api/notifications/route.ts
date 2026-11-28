import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { notificationErrorResponse, notificationJson } from "@/src/modules/notifications/api/notification-http";
import { listNotifications } from "@/src/modules/notifications/application/notification-service";

import { resolveNotificationActor } from "./notification-actor";

export const runtime = "nodejs";

/** The caller's inbox, newest first. */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveNotificationActor(request);
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam === null ? undefined : Number.parseInt(limitParam, 10);
    const notifications = await listNotifications(actor, { limit });

    return notificationJson({ notifications });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return notificationErrorResponse(error);
  }
}
