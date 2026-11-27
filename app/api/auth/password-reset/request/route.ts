import { NextRequest } from "next/server";

import { authErrorResponse, authJson, getClientIdentifier } from "@/src/modules/identity/api/auth-http";
import { enforceAuthRateLimit } from "@/src/modules/identity/application/auth-rate-limit";
import { requestPasswordReset } from "@/src/modules/identity/application/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await enforceAuthRateLimit("passwordResetRequest", getClientIdentifier(request));

    const body = await request.json();
    const result = await requestPasswordReset(body);

    return authJson(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
