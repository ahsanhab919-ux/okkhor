"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import type { ModerationAction, ModerationState } from "@/src/modules/community/domain/community-types";

type ModerationControlsProps = {
  /** Which resource the actions apply to; replies only accept hide/restore. */
  target: "thread" | "reply";
  id: string;
  moderationState: ModerationState;
  /** Threads only: a locked thread accepts no further replies. */
  locked?: boolean;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The moderator action island. It posts to the community moderation endpoints and refreshes the
 * server-rendered surface on success, so the state pill and buttons follow the new state.
 */
export function ModerationControls({ target, id, moderationState, locked = false }: ModerationControlsProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const hidden = moderationState === "hidden";
  const url =
    target === "thread"
      ? `/api/community/moderation/threads/${id}`
      : `/api/community/moderation/replies/${id}`;

  async function apply(action: ModerationAction) {
    if (busy) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, note: note.trim() || undefined }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(payload?.error?.message || "The moderation action could not be saved.");
        return;
      }

      setNote("");
      router.refresh();
    } catch {
      setErrorMessage("The moderation action could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-panel">
      <div className="form-panel__header">
        <div>
          <h2>Moderation</h2>
          <p>{hidden ? "Hidden from members." : "Visible to members."}</p>
        </div>
      </div>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="field-grid">
        <label className="field field--full">
          <span>Moderation note (optional)</span>
          <textarea
            name="moderationNote"
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            value={note}
          />
        </label>
      </div>

      <div className="verification-actions">
        <button
          className="button button--ghost button--large"
          disabled={busy}
          onClick={() => void apply(hidden ? "restore" : "hide")}
          type="button"
        >
          {hidden ? "Restore" : "Hide"}
        </button>
        {target === "thread" ? (
          <button
            className="button button--primary button--large"
            disabled={busy}
            onClick={() => void apply(locked ? "unlock" : "lock")}
            type="button"
          >
            {locked ? "Unlock" : "Lock"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
