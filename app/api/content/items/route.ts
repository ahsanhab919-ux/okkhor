import { NextRequest } from "next/server";

import { contentErrorResponse, contentJson } from "@/src/modules/content/api/content-http";
import { listPublishedItems } from "@/src/modules/content/application/content-service";

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
