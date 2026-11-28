"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const DEFAULT_CATEGORY = "General";

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The create-thread island, styled after the Stitch "Create Discussion Thread" screen: a titled
 * card, a suggested-category chip row drawn from the live category index, and a body well. It
 * posts to `POST /api/community/threads` and, on success, sends the member to the new thread. The
 * server stamps the author from the session. The category stays free text — the chips are only
 * suggestions, so a member can always name a new domain.
 */
export function ThreadForm({ suggestedCategories = [] }: { suggestedCategories?: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = Array.from(new Set([DEFAULT_CATEGORY, ...suggestedCategories])).slice(0, 6);

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
    <form className="composer" onSubmit={handleSubmit}>
      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <label className="composer__field">
        <span className="composer__label">Title</span>
        <input
          className="composer__input composer__input--title"
          name="title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Rethinking the Bronze Age Collapse..."
          required
          value={title}
        />
      </label>

      <div className="composer__field">
        <span className="composer__label">Category</span>
        <div aria-label="Suggested categories" className="composer__chips" role="group">
          {categoryOptions.map((option) => (
            <button
              aria-pressed={option === category}
              className={`composer__chip${option === category ? " composer__chip--active" : ""}`}
              key={option}
              onClick={() => setCategory(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
        <input
          aria-label="Category"
          className="composer__input"
          name="category"
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Or name your own domain"
          value={category}
        />
      </div>

      <label className="composer__field">
        <span className="composer__label">Body</span>
        <textarea
          className="composer__input composer__input--body"
          name="body"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Expand your thoughts here. Threads are plain text."
          required
          rows={8}
          value={body}
        />
      </label>

      <div className="composer__actions">
        <Link className="composer__cancel" href="/community">
          Cancel
        </Link>
        <button className="button button--primary button--large composer__submit" disabled={submitting} type="submit">
          {submitting ? "Posting..." : "Post thread"}
        </button>
      </div>
    </form>
  );
}
