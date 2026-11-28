import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { canReview } from "@/src/modules/verification/domain/verification-authorization";

import { getVerificationViewer } from "../../verification-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verification Review | Okkhor",
  description: "Review scholar verification applications.",
};

type AdminVerificationsLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/admin/verifications` gate. The edge middleware rejects unauthenticated requests; this
 * server-side check enforces the `admin` role before any review UI is rendered (`ADR-001`).
 */
export default async function AdminVerificationsLayout({ children }: AdminVerificationsLayoutProps) {
  const viewer = await getVerificationViewer();

  if (!viewer || !canReview(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="VERIFICATION REVIEW" title="Scholar Queue">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can review scholar verification applications."
                : "Sign in with an administrator account to review applications."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  return (
    <ProtectedWorkspaceShell eyebrow="VERIFICATION REVIEW" title="Scholar Queue">
      {children}
    </ProtectedWorkspaceShell>
  );
}
