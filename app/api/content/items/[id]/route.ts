import type { NextRequest } from "next/server";

import { contentErrorResponse, contentJson } from "@/src/modules/content/api/content-http";
import { getPublishedItem } from "@/src/modules/content/application/content-service";

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
