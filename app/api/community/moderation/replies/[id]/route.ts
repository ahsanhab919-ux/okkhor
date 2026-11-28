import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { moderateReply } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../../community-actor";
import { notifyReplyModeration } from "../../../notify-producers";

export const runtime = "nodejs";

/** Hides or restores a reply. Administrators only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveCommunityActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const reply = await moderateReply(actor, id, body);

    await notifyReplyModeration(actor.id, body.action, reply);

    return communityJson({ reply });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
