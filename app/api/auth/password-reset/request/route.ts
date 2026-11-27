import { NextRequest } from "next/server";

import { authErrorResponse, authJson } from "@/src/modules/identity/api/auth-http";
import { requestPasswordReset } from "@/src/modules/identity/application/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await requestPasswordReset(body);

    return authJson(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
