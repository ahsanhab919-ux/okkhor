import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Hub | Okkhor",
  description: "Discuss research, curriculum, and scholarly practice with the Okkhor community.",
};

type CommunityLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/community` shell. The edge middleware already rejects unauthenticated requests; every
 * community endpoint re-checks the session defensively (`community-slice.md` §7).
 */
export default function CommunityLayout({ children }: CommunityLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="SCHOLARLY DISCOURSE" title="Community Hub">
      {children}
    </ProtectedWorkspaceShell>
  );
}
