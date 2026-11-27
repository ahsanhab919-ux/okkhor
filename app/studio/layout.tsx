import type { Metadata } from "next";
import React from "react";

import { canAuthor } from "@/src/modules/content/domain/content-authorization";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

import { getStudioViewer } from "./studio-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authoring Studio | Okkhor",
  description: "Author and publish Bangla research summaries.",
};

type StudioLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/studio` gate. The edge middleware already rejects unauthenticated requests; this
 * server-side check enforces the author role before any authoring UI is rendered (`ADR-001`).
 */
export default async function StudioLayout({ children }: StudioLayoutProps) {
  const viewer = await getStudioViewer();

  if (!viewer || !canAuthor(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="AUTHORING STUDIO" title="Research Studio">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Authoring access required</h2>
            </div>
            <p>
              {viewer
                ? "Only scholars and administrators can author research items."
                : "Sign in with a scholar or administrator account to open the authoring studio."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  return (
    <ProtectedWorkspaceShell eyebrow="AUTHORING STUDIO" title="Research Studio">
      {children}
    </ProtectedWorkspaceShell>
  );
}
