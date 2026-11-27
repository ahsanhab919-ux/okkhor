import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";

export type StudioViewer = {
  user: UserProfile;
  sessionId: string;
};

/**
 * Resolves the current user for the authoring studio from the access-token cookie. This is
 * the server-side half of the `/studio` gate; the edge middleware only checks authentication,
 * so the role rule is applied here (see `content-authoring-slice.md` §7).
 */
export async function getStudioViewer(): Promise<StudioViewer | undefined> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return undefined;
  }

  try {
    return await getSessionFromAccessToken(accessToken);
  } catch {
    return undefined;
  }
}
