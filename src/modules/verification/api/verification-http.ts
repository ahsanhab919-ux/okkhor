import { NextResponse } from "next/server";

import { VerificationError } from "@/src/modules/verification/domain/verification-errors";

export function verificationJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function verificationErrorResponse(error: unknown) {
  if (error instanceof VerificationError) {
    return verificationJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return verificationJson(
    {
      error: {
        code: "VERIFICATION_UNKNOWN",
        message: "Unexpected verification service failure.",
      },
    },
    { status: 500 },
  );
}
