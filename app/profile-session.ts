import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";

export type ProfileViewer = {
  user: UserProfile;
  sessionId: string;
};

/**
 * Composition-root helper: resolves the current member for the profile pages from the access-token
 * cookie. `/profile` is gated by the edge middleware, so it always sees a viewer; `/u/[id]` is a
 * public route where `undefined` is a normal anonymous visit, used to decide whether the
 * members-only threads section is rendered (`member-profile-slice.md` §7).
 */
export async function getProfileViewer(): Promise<ProfileViewer | undefined> {
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
