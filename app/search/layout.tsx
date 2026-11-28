import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search | Okkhor",
  description: "Search published research and community discussions across the Okkhor corpus.",
};

type SearchLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/search` shell. The edge middleware rejects unauthenticated requests and the search
 * endpoint re-checks the session defensively (`discovery-slice.md` §7).
 */
export default function SearchLayout({ children }: SearchLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="DISCOVERY" title="Search">
      {children}
    </ProtectedWorkspaceShell>
  );
}
