"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { publicNavItems } from "@/src/modules/experience/site-content";
import { AppSidebar, AppTopBar } from "@/src/modules/experience/ui";
import { ensureSession, getUserInitials, logoutSession, type SessionPayload } from "@/src/modules/identity/client/session-client";

type ProtectedWorkspaceShellProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
};

export function ProtectedWorkspaceShell({ eyebrow, title, children }: ProtectedWorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const nextSession = await ensureSession();

        if (!active) {
          return;
        }

        setSession(nextSession);
        setErrorMessage("");
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage("Session could not be restored. Redirecting to sign-in.");
        router.replace(`/auth?next=${encodeURIComponent(pathname || "/community")}`);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!session) {
      setUnreadCount(0);
      return;
    }

    let active = true;

    async function refreshUnreadCount() {
      try {
        const response = await fetch("/api/notifications/unread-count", { credentials: "include" });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { unread?: number };

        if (active) {
          setUnreadCount(typeof payload.unread === "number" ? payload.unread : 0);
        }
      } catch (error) {
        console.error("[notification] Could not load the unread count.", error);
      }
    }

    void refreshUnreadCount();

    // The inbox's mark-read islands emit this after a successful write so the badge re-reads.
    window.addEventListener("okkhor:inbox-changed", refreshUnreadCount);

    return () => {
      active = false;
      window.removeEventListener("okkhor:inbox-changed", refreshUnreadCount);
    };
  }, [session, pathname]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logoutSession();
    } finally {
      router.push("/auth");
      router.refresh();
      setLoggingOut(false);
    }
  }

  const sessionRoleLabel = useMemo(() => {
    if (!session) {
      return "";
    }

    return session.user.roles.join(", ");
  }, [session]);

  if (loading) {
    return (
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__orb" aria-hidden="true" />
            <span>Okkhor</span>
          </div>
          <div className="workspace-loading">
            <p className="eyebrow eyebrow--blue">Restoring Session</p>
            <h2>Loading protected workspace...</h2>
            <p>We are validating your access token and restoring your working context.</p>
          </div>
        </aside>
        <main className="app-main">
          <section className="session-banner">
            <strong>Authenticated workspace loading</strong>
            <span>Please wait while we verify your identity.</span>
          </section>
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand-mark">
            <span className="brand-mark__orb" aria-hidden="true" />
            <span>Okkhor</span>
          </div>
        </aside>
        <main className="app-main">
          <section className="session-banner session-banner--error" role="alert">
            <strong>Session unavailable</strong>
            <span>{errorMessage || "Redirecting to sign-in."}</span>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppSidebar
        activeHref={pathname || "/community"}
        items={publicNavItems}
        onLogout={handleLogout}
        unreadCount={unreadCount}
      />

      <main className="app-main">
        <AppTopBar
          eyebrow={eyebrow}
          title={title}
          user={{
            ...session.user,
            displayName: session.user.displayName,
          }}
        />

        <section className="session-banner">
          <div>
            <strong>Signed in as {session.user.displayName}</strong>
            <span>
              {session.user.phoneNumber} · {sessionRoleLabel} · Session {session.sessionId.slice(0, 8)}
            </span>
          </div>
          <div className="session-banner__actions">
            <span className="validation-pill validation-pill--valid">Protected workspace</span>
            <span className="validation-pill">{getUserInitials(session.user.displayName)}</span>
            <button className="button button--ghost button--small" disabled={loggingOut} onClick={handleLogout} type="button">
              {loggingOut ? "Signing Out..." : "Logout"}
            </button>
          </div>
        </section>

        {children}
      </main>
    </div>
  );
}
