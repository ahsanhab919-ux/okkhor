"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The create-thread island. It posts to `POST /api/community/threads` and, on success, sends
 * the member to the new thread. The server stamps the author from the session.
 */
export function ThreadForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
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
      const response = await fetch("/api/community/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, body, category }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(payload?.error?.message || "The thread could not be created.");
        return;
      }

      const payload = (await response.json()) as { thread: { id: string } };

      router.push(`/community/${payload.thread.id}`);
      router.refresh();
    } catch {
      setErrorMessage("The thread could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <div className="form-panel__header">
        <div>
          <h2>Start a thread</h2>
          <p>Share a question or an argument with the community. Threads are text only.</p>
        </div>
      </div>

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="field-grid">
        <label className="field field--full">
          <span>Title</span>
          <input name="title" onChange={(event) => setTitle(event.target.value)} required value={title} />
        </label>

        <label className="field">
          <span>Category</span>
          <input name="category" onChange={(event) => setCategory(event.target.value)} value={category} />
        </label>

        <label className="field field--full">
          <span>Body</span>
          <textarea name="body" onChange={(event) => setBody(event.target.value)} required rows={6} value={body} />
        </label>
      </div>

      <div className="verification-actions">
        <button className="button button--primary button--large" disabled={submitting} type="submit">
          {submitting ? "Posting..." : "Post thread"}
        </button>
      </div>
    </form>
  );
}
