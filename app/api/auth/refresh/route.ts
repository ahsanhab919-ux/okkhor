import { NextRequest } from "next/server";

import { authErrorResponse, authJson, clearAuthCookies, setAuthCookies } from "@/src/modules/identity/api/auth-http";
import { refreshUserSession } from "@/src/modules/identity/application/auth-service";
import { REFRESH_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      throw new Error("MISSING_REFRESH");
    }

    const result = await refreshUserSession(refreshToken);
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
    const response = error instanceof Error && error.message === "MISSING_REFRESH" ? authJson(
      {
        error: {
          code: "AUTH_UNAUTHORIZED",
          message: "Refresh token is required.",
        },
      },
      { status: 401 },
    ) : authErrorResponse(error);

    clearAuthCookies(response);

    return response;
  }
}
