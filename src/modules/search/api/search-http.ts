import { NextResponse } from "next/server";

import { SearchError } from "@/src/modules/search/domain/search-errors";

export function searchJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function searchErrorResponse(error: unknown) {
  if (error instanceof SearchError) {
    return searchJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return searchJson(
    {
      error: {
        code: "SEARCH_UNKNOWN",
        message: "Unexpected search service failure.",
      },
    },
    { status: 500 },
  );
}
