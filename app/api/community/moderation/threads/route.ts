import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { listModerationQueue } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../community-actor";

export const runtime = "nodejs";

/** The moderator queue: newest threads, hidden ones included. Administrators only. */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveCommunityActor(request);
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const threads = await listModerationQueue(actor, { limit });

    return communityJson({ threads });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
