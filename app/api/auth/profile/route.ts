import { NextRequest } from "next/server";

import { authErrorResponse, authJson } from "@/src/modules/identity/api/auth-http";
import { getSessionFromAccessToken, setEmail } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

export const runtime = "nodejs";

/** Composition-root helper: resolve the acting member from the access-token cookie (401 when absent). */
async function resolveActor(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    throw new AuthError("Access token is required.", "AUTH_UNAUTHORIZED", 401);
  }

  const session = await getSessionFromAccessToken(accessToken);

  return { id: session.user.id };
}

/**
 * The owner-only email edit (`password-reset-delivery-slice.md` §6). The body is
 * `{ "email": "…" }` to set it or `{ "email": "" }` to clear it; the response returns the updated
 * `UserProfile`. The endpoint edits only the session's own user and has no role requirement.
 */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await resolveActor(request);
    const body = await request.json();
    const user = await setEmail(actor, body);

    return authJson({ user });
  } catch (error) {
    return authErrorResponse(error);
  }
}
