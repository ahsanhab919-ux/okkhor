import type { NextRequest } from "next/server";

import { contentErrorResponse, contentJson } from "@/src/modules/content/api/content-http";
import { getPublishedItem, updateContentItem } from "@/src/modules/content/application/content-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveContentActor } from "../content-actor";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const item = await getPublishedItem(id);

    return contentJson({ item });
  } catch (error) {
    return contentErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveContentActor(request);
    const { id } = await context.params;
    const body = await request.json();
    const item = await updateContentItem(actor, id, body);

    return contentJson({ item });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return contentErrorResponse(error);
  }
}
