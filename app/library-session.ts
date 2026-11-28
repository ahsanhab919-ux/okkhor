import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";
import type { LibraryActor } from "@/src/modules/library/domain/library-types";

export type LibraryViewer = {
  user: UserProfile;
  sessionId: string;
  actor: LibraryActor;
};

/**
 * Composition-root helper: resolves the current member for the library pages from the access-token
 * cookie. The edge middleware only checks authentication, so the member scope is applied
 * server-side by the pages that need it (`ADR-001`). Returns `undefined` for an anonymous visitor.
 */
export async function getLibraryViewer(): Promise<LibraryViewer | undefined> {
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
