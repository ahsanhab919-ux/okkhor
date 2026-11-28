import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { resolveReport } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../../community-actor";
import { notifyReportOutcome } from "../../../notify-moderation";

export const runtime = "nodejs";

/** Closes a report as resolved or dismissed. Administrators only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveCommunityActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const report = await resolveReport(actor, id, body);

    await notifyReportOutcome(actor.id, body.action, report);

    return communityJson({ report });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
