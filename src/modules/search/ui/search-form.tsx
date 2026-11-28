"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import type { SearchKind } from "@/src/modules/search/domain/search-types";

export type SearchFormValues = {
  q: string;
  kind: "all" | SearchKind;
  tag: string;
  category: string;
  author: string;
  sort: string;
};

export type SearchFormAuthor = {
  id: string;
  displayName: string;
};

type SearchFormProps = {
  initial: SearchFormValues;
  authors: SearchFormAuthor[];
};

/**
 * The discovery island. It owns the query and filters and navigates to `/search` with the
 * chosen values, leaving ranking and rendering to the server component.
 */
export function SearchForm({ initial, authors }: SearchFormProps) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [kind, setKind] = useState<string>(initial.kind);
  const [tag, setTag] = useState(initial.tag);
  const [category, setCategory] = useState(initial.category);
  const [author, setAuthor] = useState(initial.author);
  const [sort, setSort] = useState(initial.sort);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);

    const params = new URLSearchParams();

    if (q.trim()) {
      params.set("q", q.trim());
    }

    if (kind && kind !== "all") {
      params.set("kind", kind);
    }

    if (tag.trim()) {
      params.set("tag", tag.trim());
    }

    if (category.trim()) {
      params.set("category", category.trim());
    }

    if (author) {
      params.set("author", author);
    }

    if (sort && sort !== "relevance") {
      params.set("sort", sort);
    }

    const queryString = params.toString();

    router.push(queryString ? `/search?${queryString}` : "/search");
    router.refresh();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <div className="form-panel__header">
        <div>
          <h2>Search the corpus</h2>
          <p>Search published research and community threads, then narrow by kind, tag, or author.</p>
        </div>
      </div>

      <div className="field-grid">
        <label className="field field--full">
          <span>Query</span>
          <input name="q" onChange={(event) => setQ(event.target.value)} required value={q} />
        </label>

        <label className="field">
          <span>Kind</span>
          <select name="kind" onChange={(event) => setKind(event.target.value)} value={kind}>
            <option value="all">Research and community</option>
            <option value="research">Research only</option>
            <option value="thread">Community only</option>
          </select>
        </label>

        <label className="field">
          <span>Sort</span>
          <select name="sort" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest first</option>
          </select>
        </label>

        <label className="field">
          <span>Research tag</span>
          <input name="tag" onChange={(event) => setTag(event.target.value)} value={tag} />
        </label>

        <label className="field">
          <span>Thread category</span>
          <input name="category" onChange={(event) => setCategory(event.target.value)} value={category} />
        </label>

        <label className="field">
          <span>Author</span>
          <select name="author" onChange={(event) => setAuthor(event.target.value)} value={author}>
            <option value="">Any author</option>
            {authors.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="verification-actions">
        <button className="button button--primary button--large" disabled={submitting} type="submit">
          Search
        </button>
      </div>
    </form>
  );
}
