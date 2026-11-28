import type { NextRequest } from "next/server";

import type { CommunityActor } from "@/src/modules/community/domain/community-types";
import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

/**
 * Composition-root helper: resolve the acting user from the access-token cookie through the
 * identity module's public surface. Throws an `AuthError` (401) when unauthenticated.
 */
export async function resolveCommunityActor(request: NextRequest): Promise<CommunityActor> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
  }

  const session = await getSessionFromAccessToken(accessToken);

  return { id: session.user.id, roles: session.user.roles };
}
