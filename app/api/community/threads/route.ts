import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { createThread, listThreads } from "@/src/modules/community/application/community-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../community-actor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await resolveCommunityActor(request);

    const limitParam = request.nextUrl.searchParams.get("limit");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const result = await listThreads({ limit, cursor });

    return communityJson(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveCommunityActor(request);
    const body = await request.json();
    const thread = await createThread(actor, body);

    return communityJson({ thread }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
