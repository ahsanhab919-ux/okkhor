import type { NextRequest } from "next/server";

import { grantUserRole } from "@/src/modules/identity/application/auth-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { verificationErrorResponse, verificationJson } from "@/src/modules/verification/api/verification-http";
import { decideApplication, getApplicationForReview } from "@/src/modules/verification/application/verification-service";

import { resolveVerificationActor } from "../../verification-actor";
import { notifyVerificationDecision } from "../../notify-producers";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveVerificationActor(request);
    const { id } = await context.params;
    const application = await getApplicationForReview(actor, id);

    return verificationJson({ application });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveVerificationActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const application = await decideApplication(actor, id, body);

    // Composition root: approval grants the `scholar` role through identity's public surface.
    // The grant is idempotent, so a partial failure is safe to retry against the approved state.
    if (application.status === "approved") {
      await grantUserRole({ id: actor.id, roles: actor.roles }, application.applicantId, "scholar");
    }

    // Composition root: the decision has committed, so best-effort notify the applicant.
    await notifyVerificationDecision(actor.id, application);

    return verificationJson({ application });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}
