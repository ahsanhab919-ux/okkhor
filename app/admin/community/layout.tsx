import type { Metadata } from "next";
import React from "react";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Moderation | Okkhor",
  description: "Moderate community threads and replies.",
};

type AdminCommunityLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/admin/community` gate. The edge middleware rejects unauthenticated requests; this
 * server-side check enforces the `admin` role before any moderation UI is rendered (`ADR-001`).
 */
export default async function AdminCommunityLayout({ children }: AdminCommunityLayoutProps) {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="COMMUNITY MODERATION" title="Moderation Queue">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can moderate community content."
                : "Sign in with an administrator account to moderate community content."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  return (
    <ProtectedWorkspaceShell eyebrow="COMMUNITY MODERATION" title="Moderation Queue">
      {children}
    </ProtectedWorkspaceShell>
  );
}
