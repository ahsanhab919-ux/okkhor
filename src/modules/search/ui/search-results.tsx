import Link from "next/link";
import React from "react";

import type { SearchHit } from "@/src/modules/search/domain/search-types";

type SearchResultsProps = {
  hits: SearchHit[];
  authorNames: Record<string, string>;
};

export function SearchResults({ hits, authorNames }: SearchResultsProps) {
  if (hits.length === 0) {
    return <p>No results matched your search.</p>;
  }

  return (
    <section className="discussion-list">
      {hits.map((hit) => (
        <article key={`${hit.kind}-${hit.id}`} className="discussion-card">
          <div className="discussion-card__body">
            <div className="discussion-card__meta">
              <span className="pill">{hit.kind === "research" ? "Research" : "Community"}</span>
              {hit.tags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
              <span>{hit.createdAt.slice(0, 10)}</span>
            </div>

            <h3>
              <Link className="inline-link" href={hit.href}>
                {hit.title}
              </Link>
            </h3>

            <p>{hit.excerpt}</p>

            {hit.authorId ? <p className="search-hit__author">by {authorNames[hit.authorId] ?? "Unknown author"}</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
