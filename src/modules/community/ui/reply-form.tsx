"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type ReplyFormProps = {
  threadId: string;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The reply island. It posts to `POST /api/community/threads/[id]/replies` and refreshes the
 * server-rendered thread on success, so the new reply appears in order.
 */
export function ReplyForm({ threadId }: ReplyFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/community/threads/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(payload?.error?.message || "The reply could not be posted.");
        return;
      }

      setBody("");
      router.refresh();
    } catch {
      setErrorMessage("The reply could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__header">
        <h2>Add a reply</h2>
        <p>Keep the discussion constructive and on topic.</p>
      </div>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <label className="composer__field">
        <span className="composer__label">Reply</span>
        <textarea
          className="composer__input composer__input--body"
          name="body"
          onChange={(event) => setBody(event.target.value)}
          required
          rows={4}
          value={body}
        />
      </label>

      <div className="composer__actions">
        <button
          className="button button--primary button--large composer__submit"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Posting..." : "Post reply"}
        </button>
      </div>
    </form>
  );
}
