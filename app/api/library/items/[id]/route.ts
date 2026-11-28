import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { libraryErrorResponse, libraryJson } from "@/src/modules/library/api/library-http";
import { removeSavedItem } from "@/src/modules/library/application/library-service";

import { resolveLibraryActor } from "../../library-actor";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveLibraryActor(request);
    const { id } = await context.params;
    const removed = await removeSavedItem(actor, id);

    return libraryJson({ removed });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return libraryErrorResponse(error);
  }
}
