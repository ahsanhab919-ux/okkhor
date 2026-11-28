import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile | Okkhor",
  description: "Your Okkhor profile: what you have written and what you have saved.",
};

type ProfileLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/profile` shell. The edge middleware already rejects unauthenticated requests; the page
 * re-checks the session defensively (`member-profile-slice.md` §7).
 */
export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="YOUR PROFILE" title="Profile">
      {children}
    </ProtectedWorkspaceShell>
  );
}
