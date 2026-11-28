import { NextResponse } from "next/server";

import { NotificationError } from "@/src/modules/notifications/domain/notification-errors";

export function notificationJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function notificationErrorResponse(error: unknown) {
  if (error instanceof NotificationError) {
    return notificationJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return notificationJson(
    {
      error: {
        code: "NOTIFICATION_UNKNOWN",
        message: "Unexpected notification service failure.",
      },
    },
    { status: 500 },
  );
}
