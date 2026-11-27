import { NextRequest } from "next/server";

import { contentErrorResponse, contentJson } from "@/src/modules/content/api/content-http";
import { createContentItem, listPublishedItems } from "@/src/modules/content/application/content-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveContentActor } from "./content-actor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const result = await listPublishedItems({ limit, cursor });

    return contentJson(result);
  } catch (error) {
    return contentErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveContentActor(request);
    const body = await request.json();
    const item = await createContentItem(actor, body);

    return contentJson({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return contentErrorResponse(error);
  }
}
