import { NextRequest } from "next/server";

import { authErrorResponse, authJson } from "@/src/modules/identity/api/auth-http";
import { confirmPasswordReset } from "@/src/modules/identity/application/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
