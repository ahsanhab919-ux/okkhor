import React, { Suspense } from "react";
import { AuthPageShell } from "@/src/modules/identity/ui/auth-page-shell";

export default function AuthPage() {
  return (
    <main className="page-shell page-shell--wide">
      <Suspense fallback={null}>
        <AuthPageShell />
      </Suspense>
    </main>
  );
}
