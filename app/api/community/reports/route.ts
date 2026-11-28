import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { createReport } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../community-actor";

export const runtime = "nodejs";

/** A member reports a thread or reply. Role-free, like posting; idempotent per member per item. */
export async function POST(request: NextRequest) {
  try {
    const actor = await resolveCommunityActor(request);
    const body = await request.json();
    const report = await createReport(actor, body);

    return communityJson({ report });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
