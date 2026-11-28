"use client";

import React, { useState } from "react";

type StatusTone = "neutral" | "success" | "error";

/**
 * The owner-only account-email island on `/profile`. It is a tiny `"use client"` leaf: local state
 * plus one `PATCH /api/auth/profile` call. The email is a secondary recovery contact, so an empty
 * value clears it (`password-reset-delivery-slice.md` §8).
 */
export function EmailSettingsForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [statusMessage, setStatusMessage] = useState(
    initialEmail
      ? "Your account email is set. It is only used to send your password-reset code."
      : "Add an email to also receive your password-reset code by email.",
  );

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
        user?: { email?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message || "Could not update your email.");
      }

      const savedEmail = payload.user?.email ?? "";
      setEmail(savedEmail);
      setStatusTone("success");
      setStatusMessage(savedEmail ? "Email saved." : "Email cleared.");
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Could not update your email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="credential-panel">
      <div className="field-grid">
        <label className="field">
          <span>Email address</span>
          <input
            name="account-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="member@example.com"
            type="email"
            value={email}
          />
        </label>
      </div>

      <p className={`auth-status auth-status--${statusTone}`} role={statusTone === "error" ? "alert" : "status"}>
        {statusMessage}
      </p>

      <div className="hero-actions hero-actions--stackable">
        <button className="button button--primary" disabled={saving} onClick={handleSave} type="button">
          {saving ? "Saving..." : "Save email"}
        </button>
      </div>
    </div>
  );
}
