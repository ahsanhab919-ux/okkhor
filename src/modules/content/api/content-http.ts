import { NextResponse } from "next/server";

import { ContentError } from "@/src/modules/content/domain/content-errors";

export function contentJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function contentErrorResponse(error: unknown) {
  if (error instanceof ContentError) {
    return contentJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return contentJson(
    {
      error: {
        code: "CONTENT_UNKNOWN",
        message: "Unexpected content service failure.",
      },
    },
    { status: 500 },
  );
}
