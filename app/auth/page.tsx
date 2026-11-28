import React, { Suspense } from "react";
import Link from "next/link";

import { BrandMark, Icon } from "@/src/modules/experience/ui";
import { AuthPageShell } from "@/src/modules/identity/ui/auth-page-shell";

export default function AuthPage() {
  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <BrandMark />
        <span className="auth-topbar__lang">
          <Icon className="icon-sm" name="globe" />
          English
        </span>
      </header>

      <main className="auth-canvas">
        <div className="auth-ambient auth-ambient--primary" aria-hidden="true" />
        <div className="auth-ambient auth-ambient--tertiary" aria-hidden="true" />
        <div className="auth-column">
          <div className="auth-intro">
            <h1>Welcome</h1>
            <p>Access the illuminated archives of collective knowledge.</p>
          </div>
          <Suspense fallback={null}>
            <AuthPageShell />
          </Suspense>
        </div>
      </main>

      <footer className="auth-footer">
        <p>© 2024 Okkhor. The Illuminated Archive.</p>
        <div className="auth-footer__links">
          <Link href="#privacy">Privacy Policy</Link>
          <Link href="#terms">Terms of Service</Link>
          <Link href="#help">Help Center</Link>
        </div>
      </footer>
    </div>
  );
}
