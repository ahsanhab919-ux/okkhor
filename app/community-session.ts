import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";
import type { CommunityActor } from "@/src/modules/community/domain/community-types";

export type CommunityViewer = {
  user: UserProfile;
  sessionId: string;
  actor: CommunityActor;
};

/**
 * Composition-root helper: resolves the current user for the community pages from the access-token
 * cookie. The edge middleware only checks authentication, so the `admin` moderation rule is
 * applied server-side by the pages that need it (`ADR-001`).
 */
export async function getCommunityViewer(): Promise<CommunityViewer | undefined> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return undefined;
  }

  try {
    const session = await getSessionFromAccessToken(accessToken);

    return {
      ...session,
      actor: { id: session.user.id, roles: session.user.roles },
    };
  } catch {
    return undefined;
  }
}
