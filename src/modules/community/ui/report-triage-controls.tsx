"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type ReportTriageControlsProps = {
  reportId: string;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The moderator triage island. It closes a report as resolved or dismissed and refreshes the queue,
 * so the entry leaves the open list. Closing a report never changes the content's visibility —
 * hiding stays a separate moderation action (`member-reporting-slice.md` §6.3, §13 decision 2).
 */
export function ReportTriageControls({ reportId }: ReportTriageControlsProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function close(action: "resolve" | "dismiss") {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/community/moderation/reports/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, note: note.trim() || undefined }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(payload?.error?.message || "The report could not be closed.");
        return;
      }

      setNote("");
      router.refresh();
    } catch {
      setErrorMessage("The report could not be closed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verification-actions">
      <label className="field field--full">
        <span>Resolution note (optional)</span>
        <textarea
          name="resolutionNote"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </label>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        className="button button--primary button--large"
        disabled={busy}
        onClick={() => void close("resolve")}
        type="button"
      >
        Resolve
      </button>
      <button
        className="button button--ghost button--large"
        disabled={busy}
        onClick={() => void close("dismiss")}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}
