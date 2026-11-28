import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { notificationErrorResponse, notificationJson } from "@/src/modules/notifications/api/notification-http";
import { markAllNotificationsRead } from "@/src/modules/notifications/application/notification-service";

import { resolveNotificationActor } from "../notification-actor";

export const runtime = "nodejs";

/** Marks all of the caller's notifications read; returns how many were updated. */
export async function POST(request: NextRequest) {
  try {
    const actor = await resolveNotificationActor(request);
    const updated = await markAllNotificationsRead(actor);

    return notificationJson({ updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return notificationErrorResponse(error);
  }
}
