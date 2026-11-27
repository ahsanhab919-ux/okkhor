"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";

type ItemEditorFormProps = {
  item?: ResearchItem;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

/**
 * The authoring form island. It creates a draft with `POST /api/content/items`, or saves an
 * edit (including the draft → published transition) with `PATCH /api/content/items/[id]`.
 * The stored `updatedAt` is sent back so the server can reject a stale write with `409`.
 */
export function ItemEditorForm({ item }: ItemEditorFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [abstract, setAbstract] = useState(item?.abstract ?? "");
  const [summaryBn, setSummaryBn] = useState(item?.summaryBn ?? "");
  const [sourceLanguage, setSourceLanguage] = useState(item?.sourceLanguage ?? "en");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? "");
  const [status, setStatus] = useState<ResearchItem["status"]>(item?.status ?? "draft");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const payload = {
      title,
      abstract,
      summaryBn,
      sourceLanguage,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      sourceUrl: sourceUrl.trim() || undefined,
      status,
      ...(item ? { updatedAt: item.updatedAt } : {}),
    };

    try {
      const response = await fetch(item ? `/api/content/items/${item.id}` : "/api/content/items", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as ApiErrorShape | undefined;

        setErrorMessage(body?.error?.message || "The research item could not be saved.");
        return;
      }

      router.push("/studio");
      router.refresh();
    } catch {
      setErrorMessage("The research item could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <div className="form-panel__header">
        <div>
          <h2>{item ? "Edit research item" : "New research item"}</h2>
          <p>Drafts stay private until you publish them to the research archive.</p>
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
          <span>Source language</span>
          <input
            name="sourceLanguage"
            onChange={(event) => setSourceLanguage(event.target.value)}
            value={sourceLanguage}
          />
        </label>

        <label className="field">
          <span>Status</span>
          <select
            name="status"
            onChange={(event) => setStatus(event.target.value as ResearchItem["status"])}
            value={status}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>

        <label className="field field--full">
          <span>Tags (comma separated)</span>
          <input name="tags" onChange={(event) => setTags(event.target.value)} value={tags} />
        </label>

        <label className="field field--full">
          <span>Source URL</span>
          <input name="sourceUrl" onChange={(event) => setSourceUrl(event.target.value)} value={sourceUrl} />
        </label>

        <label className="field field--full">
          <span>Abstract</span>
          <textarea
            name="abstract"
            onChange={(event) => setAbstract(event.target.value)}
            required
            rows={5}
            value={abstract}
          />
        </label>

        <label className="field field--full">
          <span>Bangla summary</span>
          <textarea
            lang="bn"
            name="summaryBn"
            onChange={(event) => setSummaryBn(event.target.value)}
            required
            rows={5}
            value={summaryBn}
          />
        </label>
      </div>

      <div className="verification-actions">
        <button className="button button--primary button--large" disabled={submitting} type="submit">
          {submitting ? "Saving..." : item ? "Save changes" : "Create item"}
        </button>
      </div>
    </form>
  );
}
