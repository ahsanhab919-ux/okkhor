"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type VerificationDecisionFormProps = {
  applicationId: string;
  updatedAt: string;
  reviewable: boolean;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The admin decision island. It approves or rejects a submitted application with
 * `PATCH /api/verification/applications/[id]`; approval grants the applicant the `scholar`
 * role server-side. `updatedAt` guards against deciding a stale application.
 */
export function VerificationDecisionForm({ applicationId, updatedAt, reviewable }: VerificationDecisionFormProps) {
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(status: "approved" | "rejected") {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/verification/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, reviewNote: reviewNote.trim() || undefined, updatedAt }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(body?.error?.message || "The decision could not be saved.");
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!reviewable) {
    return <p className="session-banner">This application has already been decided.</p>;
  }

  return (
    <section className="form-panel">
      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="field-grid">
        <label className="field field--full">
          <span>Review note</span>
          <textarea
            name="reviewNote"
            onChange={(event) => setReviewNote(event.target.value)}
            rows={4}
            value={reviewNote}
          />
        </label>
      </div>

      <div className="verification-actions">
        <button
          className="button button--ghost button--large"
          disabled={busy}
          onClick={() => void decide("rejected")}
          type="button"
        >
          {busy ? "Saving..." : "Reject"}
        </button>
        <button
          className="button button--primary button--large"
          disabled={busy}
          onClick={() => void decide("approved")}
          type="button"
        >
          {busy ? "Saving..." : "Approve and grant scholar"}
        </button>
      </div>
    </section>
  );
}
