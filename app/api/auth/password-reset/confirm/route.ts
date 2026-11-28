import { NextRequest } from "next/server";

import { authErrorResponse, authJson, getClientIdentifier } from "@/src/modules/identity/api/auth-http";
import { enforceAuthRateLimit } from "@/src/modules/identity/application/auth-rate-limit";
import { confirmPasswordReset } from "@/src/modules/identity/application/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await enforceAuthRateLimit("passwordResetConfirm", getClientIdentifier(request));

    const body = await request.json();

    await confirmPasswordReset(body);

    return authJson({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
