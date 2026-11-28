import { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { searchErrorResponse, searchJson } from "@/src/modules/search/api/search-http";
import { search } from "@/src/modules/search/application/search-service";

export const runtime = "nodejs";

/** Reads a query parameter, treating a blank value as absent. */
function readParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);

  return value && value.trim() ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

    if (!accessToken) {
      throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
    }

    await getSessionFromAccessToken(accessToken);

    const params = request.nextUrl.searchParams;
    const result = await search({
      q: readParam(params, "q"),
      kind: readParam(params, "kind"),
      tag: readParam(params, "tag"),
      category: readParam(params, "category"),
      author: readParam(params, "author"),
      sort: readParam(params, "sort"),
      limit: readParam(params, "limit"),
    });

    return searchJson(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return searchErrorResponse(error);
  }
}
