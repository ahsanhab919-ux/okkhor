import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Library | Okkhor",
  description: "Your saved research items, kept newest-saved first.",
};

type LibraryLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/library` shell. The edge middleware already rejects unauthenticated requests; the page and
 * every library endpoint re-check the session defensively (`library-slice.md` §7).
 */
export default function LibraryLayout({ children }: LibraryLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="YOUR READING LIST" title="My Library">
      {children}
    </ProtectedWorkspaceShell>
  );
}
