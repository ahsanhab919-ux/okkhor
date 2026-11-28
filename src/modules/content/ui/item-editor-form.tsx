"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import { Icon } from "@/src/modules/experience/ui";

type ItemEditorFormProps = {
  item?: ResearchItem;
};

type ApiErrorShape = {
  error?: {
    message?: string;
  };
};

type AuthoringResponse = {
  item?: ResearchItem;
  summary?: {
    summaryEn?: string;
    summaryBn?: string;
  };
};

/**
 * The authoring form island. It creates a draft with `POST /api/content/items`, or saves an
 * edit (including the draft → published transition) with `PATCH /api/content/items/[id]`.
 * The stored `updatedAt` is sent back so the server can reject a stale write with `409`.
 *
 * The Bangla summary is optional to save: when it is left blank it is omitted from the payload,
 * and publishing generates and persists it server-side. A successful publish returns a transient
 * English summary, which is shown here as a read-only preview (it is never stored).
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
  const [aiSummaryEn, setAiSummaryEn] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function goToStudio() {
    router.push("/studio");
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const trimmedSummary = summaryBn.trim();
    const payload = {
      title,
      abstract,
      sourceLanguage,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      sourceUrl: sourceUrl.trim() || undefined,
      status,
      // A blank Bangla summary is omitted: it is optional to save and generated on publish.
      ...(trimmedSummary ? { summaryBn: trimmedSummary } : {}),
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

      const body = (await response.json().catch(() => undefined)) as AuthoringResponse | undefined;
      const previewEn = body?.summary?.summaryEn;

      if (previewEn) {
        // Hold navigation so the transient English preview is visible before leaving the editor.
        setAiSummaryEn(previewEn);
        return;
      }

      goToStudio();
    } catch {
      setErrorMessage("The research item could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (aiSummaryEn) {
    return (
      <div className="item-editor">
        <div className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>
                <Icon name="spark" />
                AI English summary (preview, not saved)
              </h2>
              <p>The Bangla summary was generated and saved with the published item.</p>
            </div>
          </div>

          <p lang="en">{aiSummaryEn}</p>

          <div className="verification-actions">
            <button className="button button--primary button--large" onClick={goToStudio} type="button">
              Continue to studio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="item-editor form-panel" onSubmit={handleSubmit}>
      <div className="form-panel__header">
        <div>
          <h2>
            <Icon name="book" />
            {item ? "Edit research item" : "New research item"}
          </h2>
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
          <span>Bangla summary (auto-generated on publish if left blank)</span>
          <textarea
            lang="bn"
            name="summaryBn"
            onChange={(event) => setSummaryBn(event.target.value)}
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
