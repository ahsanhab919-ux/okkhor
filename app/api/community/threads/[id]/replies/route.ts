import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { createReply } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../../community-actor";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveCommunityActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const reply = await createReply(actor, id, body);

    return communityJson({ reply }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
