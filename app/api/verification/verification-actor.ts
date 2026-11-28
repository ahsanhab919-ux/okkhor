import type { NextRequest } from "next/server";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import type { VerificationActor } from "@/src/modules/verification/domain/verification-types";

/**
 * Composition-root helper: resolve the acting user from the access-token cookie through the
 * identity module's public surface. Throws an `AuthError` (401) when unauthenticated.
 */
export async function resolveVerificationActor(request: NextRequest): Promise<VerificationActor> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
  }

  const session = await getSessionFromAccessToken(accessToken);

  return { id: session.user.id, roles: session.user.roles };
}
