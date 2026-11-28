import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { notificationErrorResponse, notificationJson } from "@/src/modules/notifications/api/notification-http";
import { markNotificationRead } from "@/src/modules/notifications/application/notification-service";

import { resolveNotificationActor } from "../../notification-actor";

export const runtime = "nodejs";

/** Marks one of the caller's notifications read. Idempotent; a foreign id is a 404. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveNotificationActor(request);
    const { id } = await context.params;
    const notification = await markNotificationRead(actor, id);

    return notificationJson({ notification });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return notificationErrorResponse(error);
  }
}
