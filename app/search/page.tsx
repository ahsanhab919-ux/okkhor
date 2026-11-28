import React from "react";

import { getUserProfilesByIds } from "@/src/modules/identity/application/auth-service";
import { search } from "@/src/modules/search/application/search-service";
import { SearchError } from "@/src/modules/search/domain/search-errors";
import type { SearchHit, SearchKind } from "@/src/modules/search/domain/search-types";
import { SearchForm, type SearchFormValues } from "@/src/modules/search/ui/search-form";
import { SearchResults } from "@/src/modules/search/ui/search-results";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeKind(value: string): "all" | SearchKind {
  return value === "research" || value === "thread" ? value : "all";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = firstValue(params.q).trim();
  const tag = firstValue(params.tag).trim();
  const category = firstValue(params.category).trim();
  const author = firstValue(params.author).trim();
  const kind = normalizeKind(firstValue(params.kind));
  const sort = firstValue(params.sort) === "newest" ? "newest" : "relevance";

  let hits: SearchHit[] = [];
  let total = 0;
  let authorPoolHits: SearchHit[] = [];
  let errorMessage = "";

  if (q) {
    try {
      const result = await search({
        q,
        kind,
        tag: tag || undefined,
        category: category || undefined,
        author: author || undefined,
        sort,
      });

      hits = result.hits;
      total = result.total;
      authorPoolHits = hits;

      if (author) {
        const pool = await search({ q, kind, tag: tag || undefined, category: category || undefined, sort });

        authorPoolHits = pool.hits;
      }
    } catch (error) {
      if (error instanceof SearchError) {
        errorMessage = error.message;
      } else {
        throw error;
      }
    }
  }

  const authorIds = Array.from(
    new Set(authorPoolHits.map((hit) => hit.authorId).filter((id): id is string => Boolean(id))),
  );
  const profiles = authorIds.length > 0 ? await getUserProfilesByIds(authorIds) : [];
  const authorNames: Record<string, string> = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.displayName]),
  );
  const authorOptions = authorIds.map((id) => ({ id, displayName: authorNames[id] ?? "Unknown author" }));

  const initial: SearchFormValues = { q, kind, tag, category, author, sort };

  return (
    <div className="search-page">
      <section className="archive-hero">
        <h1 className="archive-hero__title">Deep Archive Explorer</h1>
        <p className="archive-hero__lead">
          Search published research and community threads across the Okkhor corpus.
        </p>
      </section>

      <SearchForm authors={authorOptions} initial={initial} />

      {errorMessage ? (
        <p className="session-banner session-banner--error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {q ? (
        <section className="search-results-section">
          <div className="search-results-head">
            <h2>Results</h2>
            <span className="search-results-head__count">
              {total} {total === 1 ? "match" : "matches"}
            </span>
            <span className="search-results-head__query">for &ldquo;{q}&rdquo;</span>
          </div>

          <SearchResults authorNames={authorNames} hits={hits} />
        </section>
      ) : (
        <p>Enter a query to search published research and community threads.</p>
      )}
    </div>
  );
}
