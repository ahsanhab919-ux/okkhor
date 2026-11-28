import { cookies } from "next/headers";

import { getSessionFromAccessToken } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";
import type { VerificationActor } from "@/src/modules/verification/domain/verification-types";

export type VerificationViewer = {
  user: UserProfile;
  sessionId: string;
  actor: VerificationActor;
};

/**
 * Composition-root helper: resolves the current user for the verification pages from the
 * access-token cookie. The edge middleware only checks authentication, so the admin role rule
 * is applied server-side by the pages that need it (`ADR-001`).
 */
export async function getVerificationViewer(): Promise<VerificationViewer | undefined> {
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
