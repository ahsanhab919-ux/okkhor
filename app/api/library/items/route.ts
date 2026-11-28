import type { NextRequest } from "next/server";

import { getPublishedItemsByIds } from "@/src/modules/content/application/content-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { libraryErrorResponse, libraryJson } from "@/src/modules/library/api/library-http";
import { parseSaveItemInput, saveItem } from "@/src/modules/library/application/library-service";
import { LibraryError } from "@/src/modules/library/domain/library-errors";

import { resolveLibraryActor } from "../library-actor";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveLibraryActor(request);
    const body = await request.json();
    const { itemId } = parseSaveItemInput(body);
    // The published check is a composition-root concern: validate the save target through content
    // before writing, so a draft or unknown item is never reachable through a save.
    const published = await getPublishedItemsByIds([itemId]);

    if (published.length === 0) {
      throw new LibraryError("The research item was not found.", "LIBRARY_ITEM_NOT_FOUND", 404);
    }

    const { item, created } = await saveItem(actor, { itemId });

    return libraryJson({ item }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return libraryErrorResponse(error);
  }
}
