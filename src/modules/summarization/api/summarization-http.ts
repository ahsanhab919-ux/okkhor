import { NextResponse } from "next/server";

import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";

export function summarizationJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function summarizationErrorResponse(error: unknown) {
  if (error instanceof SummarizationError) {
    return summarizationJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return summarizationJson(
    {
      error: {
        code: "AI_UNKNOWN",
        message: "Unexpected summarization service failure.",
      },
    },
    { status: 500 },
  );
}
