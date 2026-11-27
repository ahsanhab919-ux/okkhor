"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ensureSession, getUserInitials, logoutSession, type SessionPayload } from "@/src/modules/identity/client/session-client";
import { resolveSafeNextPath } from "@/src/modules/identity/domain/auth-navigation";

type CredentialMode = "login" | "register" | "reset";

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiErrorShape & Record<string, unknown>;

  if (!response.ok) {
    throw new Error(payload.error?.message || "Authentication request failed.");
  }

  return payload;
}

export function CredentialAuthPanel({
  initialPhoneNumber,
  panelId,
}: {
  initialPhoneNumber?: string;
  panelId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNextPath = searchParams.get("next");
  const nextPath = useMemo(() => resolveSafeNextPath(requestedNextPath), [requestedNextPath]);

  const [mode, setMode] = useState<CredentialMode>("login");
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber || "01712345678");
  const [displayName, setDisplayName] = useState("Ahsan Habib");
  const [password, setPassword] = useState("Okkhor2026");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("Okkhor3030");
  const [statusMessage, setStatusMessage] = useState("Use phone number plus password for the backend-authenticated path.");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [loading, setLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    if (initialPhoneNumber) {
      setPhoneNumber(initialPhoneNumber);
    }
  }, [initialPhoneNumber]);

  useEffect(() => {
    let active = true;

    async function loadExistingSession() {
      try {
        const session = await ensureSession();

        if (!active) {
          return;
        }

        setActiveSession(session);
        setStatusTone("success");
        if (requestedNextPath) {
          setStatusMessage(`Session restored for ${session.user.displayName}. Redirecting to your requested workspace.`);
          router.replace(nextPath);
          router.refresh();
          return;
        }

        setStatusMessage(`Active session found for ${session.user.displayName}. You can continue directly.`);
      } catch {
        if (active) {
          setActiveSession(null);
        }
      }
    }

    void loadExistingSession();

    return () => {
      active = false;
    };
  }, [nextPath, requestedNextPath, router]);

  async function handleLogin() {
    setLoading(true);

    try {
      await postJson("/api/auth/login", { phoneNumber, password });
      setStatusTone("success");
      setStatusMessage("Login successful. Redirecting to your protected destination.");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setLoading(true);

    try {
      await postJson("/api/auth/register", {
        phoneNumber,
        displayName,
        password,
        locale: "bn-BD",
        roles: ["learner"],
      });
      setStatusTone("success");
      setStatusMessage("Registration successful. Redirecting to the protected experience.");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetRequest() {
    setLoading(true);

    try {
      const payload = (await postJson("/api/auth/password-reset/request", { phoneNumber })) as {
        resetTokenPreview?: string;
        message?: string;
      };
      setResetToken(payload.resetTokenPreview || "");
      setStatusTone("success");
      setStatusMessage(payload.message || "Password reset issued.");
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Password reset request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetConfirm() {
    setLoading(true);

    try {
      await postJson("/api/auth/password-reset/confirm", {
        token: resetToken,
        newPassword,
      });
      setStatusTone("success");
      setStatusMessage("Password updated. You can now sign in with the new credential.");
      setMode("login");
      setPassword(newPassword);
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Password reset confirmation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="credential-panel" id={panelId}>
      <div className="credential-panel__header">
        <div>
          <p className="eyebrow eyebrow--blue">Backend Account Access</p>
          <h2>Credential-backed authentication slice</h2>
        </div>
        <div className="tab-row" role="tablist" aria-label="Credential auth mode">
          <button
            className={`tab-row__tab${mode === "login" ? " tab-row__tab--active" : ""}`}
            onClick={() => setMode("login")}
            role="tab"
            type="button"
          >
            Login
          </button>
          <button
            className={`tab-row__tab${mode === "register" ? " tab-row__tab--active" : ""}`}
            onClick={() => setMode("register")}
            role="tab"
            type="button"
          >
            Register
          </button>
          <button
            className={`tab-row__tab${mode === "reset" ? " tab-row__tab--active" : ""}`}
            onClick={() => setMode("reset")}
            role="tab"
            type="button"
          >
            Reset
          </button>
        </div>
      </div>

      <p className={`auth-status auth-status--${statusTone}`} role={statusTone === "error" ? "alert" : "status"}>
        {statusMessage}
      </p>

      {activeSession ? (
        <div className="auth-proof-card auth-proof-card--success">
          <div className="avatar-chip">{getUserInitials(activeSession.user.displayName)}</div>
          <div>
            <strong>{activeSession.user.displayName}</strong>
            <span>
              {activeSession.user.phoneNumber} · {activeSession.user.roles.join(", ")}
            </span>
          </div>
          <div className="session-banner__actions">
            <button className="button button--primary button--small" onClick={() => router.replace(nextPath)} type="button">
              Continue
            </button>
            <button
              className="button button--ghost button--small"
              onClick={async () => {
                await logoutSession();
                setActiveSession(null);
                setStatusTone("neutral");
                setStatusMessage("Session cleared. You can sign in again.");
                router.refresh();
              }}
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      ) : null}

      <div className="field-grid">
        <label className="field">
          <span>Phone number</span>
          <input name="credential-phone" onChange={(event) => setPhoneNumber(event.target.value)} value={phoneNumber} />
        </label>

        {mode === "register" ? (
          <label className="field">
            <span>Display name</span>
            <input name="display-name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
          </label>
        ) : null}

        {mode !== "reset" ? (
          <label className="field">
            <span>Password</span>
            <input
              name="credential-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <>
            <label className="field">
              <span>Reset token</span>
              <input name="reset-token" onChange={(event) => setResetToken(event.target.value)} value={resetToken} />
            </label>
            <label className="field">
              <span>New password</span>
              <input
                name="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="hero-actions hero-actions--stackable">
        {mode === "login" ? (
          <button className="button button--primary button--large" disabled={loading} onClick={handleLogin} type="button">
            {loading ? "Signing In..." : "Login and Continue"}
          </button>
        ) : null}

        {mode === "register" ? (
          <button className="button button--primary button--large" disabled={loading} onClick={handleRegister} type="button">
            {loading ? "Creating Account..." : "Register and Continue"}
          </button>
        ) : null}

        {mode === "reset" ? (
          <>
            <button
              className="button button--ghost button--large"
              disabled={loading}
              onClick={handleResetRequest}
              type="button"
            >
              {loading ? "Preparing Reset..." : "Request Reset Token"}
            </button>
            <button
              className="button button--primary button--large"
              disabled={loading || !resetToken}
              onClick={handleResetConfirm}
              type="button"
            >
              {loading ? "Updating Password..." : "Confirm Password Reset"}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
