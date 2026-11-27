import { NextRequest } from "next/server";

import { authErrorResponse, authJson } from "@/src/modules/identity/api/auth-http";
import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

    if (!accessToken) {
      throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
    }

    const session = await getSessionFromAccessToken(accessToken);

    return authJson(session);
  } catch (error) {
    return authErrorResponse(error);
  }
}
