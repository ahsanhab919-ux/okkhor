import Link from "next/link";
import React from "react";

import type { SearchHit } from "@/src/modules/search/domain/search-types";

type SearchResultsProps = {
  hits: SearchHit[];
  authorNames: Record<string, string>;
};

/**
 * The result card grid, aligned to the Stitch "Deep Archive Explorer": a dense multi-column grid
 * of bordered cards carrying a kind badge, tag chips, the excerpt, and a footer byline. Only real
 * hit fields are shown — there are no archive scores or era chips, so none are invented.
 */
export function SearchResults({ hits, authorNames }: SearchResultsProps) {
  if (hits.length === 0) {
    return <p>No results matched your search.</p>;
  }

  return (
    <section className="discussion-list search-results">
      {hits.map((hit) => (
        <article key={`${hit.kind}-${hit.id}`} className="discussion-card result-card">
          <div className="discussion-card__body">
            <div className="discussion-card__meta">
              <span className="discussion-card__badge">
                {hit.kind === "research" ? "Research" : "Community"}
              </span>
              {hit.tags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
            </div>

            <h3>
              <Link className="inline-link" href={hit.href}>
                {hit.title}
              </Link>
            </h3>

            <p>{hit.excerpt}</p>

            <div className="result-card__footer">
              {hit.authorId ? (
                <span className="result-card__author">
                  by {authorNames[hit.authorId] ?? "Unknown author"}
                </span>
              ) : (
                <span />
              )}
              <span className="discussion-card__ago">{hit.createdAt.slice(0, 10)}</span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
