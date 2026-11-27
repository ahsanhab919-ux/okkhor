import { NextRequest } from "next/server";

import { authErrorResponse, authJson, getClientIdentifier, setAuthCookies } from "@/src/modules/identity/api/auth-http";
import { enforceAuthRateLimit } from "@/src/modules/identity/application/auth-rate-limit";
import { registerUser } from "@/src/modules/identity/application/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await enforceAuthRateLimit("register", getClientIdentifier(request));

    const body = await request.json();
    const result = await registerUser(body);
    const response = authJson({
      user: result.user,
      tokenMeta: {
        accessExpiresAt: result.tokens.accessExpiresAt,
        refreshExpiresAt: result.tokens.refreshExpiresAt,
      },
    });

    setAuthCookies(response, result.tokens);

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
