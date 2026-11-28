"use client";

import React, { useState } from "react";

import type { ReportReason, ReportTargetType } from "@/src/modules/community/domain/community-types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "misinformation", label: "Misinformation" },
  { value: "off-topic", label: "Off topic" },
  { value: "other", label: "Other" },
];

type ReportControlsProps = {
  target: ReportTargetType;
  id: string;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The member report island. It posts to `/api/community/reports` and, on success, confirms inline —
 * a report never changes what the member sees (`member-reporting-slice.md` §6.1, §13 decision 3).
 */
export function ReportControls({ target, id }: ReportControlsProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [detail, setDetail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetType: target,
          targetId: id,
          reason,
          detail: detail.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(payload?.error?.message || "The report could not be submitted.");
        return;
      }

      await response.json().catch(() => undefined);
      setReported(true);
      setOpen(false);
    } catch {
      setErrorMessage("The report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (reported) {
    return (
      <p className="inline-action" role="status">
        Reported. Thank you — a moderator will review it.
      </p>
    );
  }

  if (!open) {
    return (
      <button className="inline-link" onClick={() => setOpen(true)} type="button">
        Report
      </button>
    );
  }

  return (
    <div className="form-panel">
      <div className="field-grid">
        <label className="field">
          <span>Reason</span>
          <select
            name="reportReason"
            onChange={(event) => setReason(event.target.value as ReportReason)}
            value={reason}
          >
            {REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--full">
          <span>Detail (optional)</span>
          <textarea
            name="reportDetail"
            onChange={(event) => setDetail(event.target.value)}
            rows={2}
            value={detail}
          />
        </label>
      </div>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="verification-actions">
        <button
          className="button button--primary button--large"
          disabled={busy}
          onClick={() => void submit()}
          type="button"
        >
          Submit report
        </button>
        <button
          className="button button--ghost button--large"
          disabled={busy}
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
