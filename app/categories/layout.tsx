import type { Metadata } from "next";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse by Category | Okkhor",
  description: "Browse community discussions by category.",
};

type CategoriesLayoutProps = {
  children: React.ReactNode;
};

/**
 * The `/categories` shell. The edge middleware already rejects unauthenticated requests, so the
 * category pages sit inside the same protected workspace as `/community` (`topic-browse-slice.md`
 * §8).
 */
export default function CategoriesLayout({ children }: CategoriesLayoutProps) {
  return (
    <ProtectedWorkspaceShell eyebrow="COMMUNITY CATEGORIES" title="Browse by Category">
      {children}
    </ProtectedWorkspaceShell>
  );
}
