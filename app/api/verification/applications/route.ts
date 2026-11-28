import { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { verificationErrorResponse, verificationJson } from "@/src/modules/verification/api/verification-http";
import { listApplicationsForReview } from "@/src/modules/verification/application/verification-service";

import { resolveVerificationActor } from "../verification-actor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveVerificationActor(request);
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const applications = await listApplicationsForReview(actor, status);

    return verificationJson({ applications });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}
