import { NextRequest } from "next/server";

import { authJson, clearAuthCookies } from "@/src/modules/identity/api/auth-http";
import { logoutUser } from "@/src/modules/identity/application/auth-service";
import { REFRESH_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  await logoutUser(refreshToken);

  const response = authJson({
    success: true,
  });

  clearAuthCookies(response);

  return response;
}
