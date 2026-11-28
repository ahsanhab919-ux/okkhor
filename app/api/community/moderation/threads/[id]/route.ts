import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import {
  getModerationThread,
  moderateThread,
} from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../../community-actor";
import { notifyThreadModeration } from "../../../notify-moderation";

export const runtime = "nodejs";

/** A thread with all of its replies, hidden ones included. Administrators only. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveCommunityActor(request);
    const { id } = await context.params;
    const detail = await getModerationThread(actor, id);

    return communityJson(detail);
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}

/** Hides, restores, locks, or unlocks a thread. Administrators only. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveCommunityActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const thread = await moderateThread(actor, id, body);

    await notifyThreadModeration(actor.id, body.action, thread);

    return communityJson({ thread });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
