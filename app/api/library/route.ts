import type { NextRequest } from "next/server";

import { getPublishedItemsByIds } from "@/src/modules/content/application/content-service";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { libraryErrorResponse, libraryJson } from "@/src/modules/library/api/library-http";
import { listSavedItems } from "@/src/modules/library/application/library-service";

import { resolveLibraryActor } from "./library-actor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveLibraryActor(request);
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const saves = await listSavedItems(actor, { limit });
    const items = await getPublishedItemsByIds(saves.map((save) => save.itemId));
    const byId = new Map(items.map((item) => [item.id, item]));
    const entries = saves.flatMap((save) => {
      const item = byId.get(save.itemId);

      return item ? [{ item, savedAt: save.savedAt }] : [];
    });

    return libraryJson({ items: entries, total: entries.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return libraryErrorResponse(error);
  }
}
