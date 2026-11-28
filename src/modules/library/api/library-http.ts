import { NextResponse } from "next/server";

import { LibraryError } from "@/src/modules/library/domain/library-errors";

export function libraryJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function libraryErrorResponse(error: unknown) {
  if (error instanceof LibraryError) {
    return libraryJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return libraryJson(
    {
      error: {
        code: "LIBRARY_UNKNOWN",
        message: "Unexpected library service failure.",
      },
    },
    { status: 500 },
  );
}
