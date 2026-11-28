import Link from "next/link";
import React from "react";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import { Icon } from "@/src/modules/experience/ui";
import { RemoveSavedItemButton } from "@/src/modules/library/ui/save-item-button";

export type LibraryEntry = {
  item: ResearchItem;
  savedAt: string;
};

/**
 * The saved-items grid, aligned to the Stitch "Saved Archives" artifact grid: each card carries a
 * kind badge and tag chips, the item title, its Bangla summary, and a footer with the read link and
 * the Remove affordance. An empty library shows the empty state. Only real item fields are shown.
 */
export function LibraryList({ entries }: { entries: LibraryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p>
        Nothing saved yet. Browse the{" "}
        <Link className="inline-link" href="/content">
          research archive
        </Link>{" "}
        and tap Save on anything you want to read again.
      </p>
    );
  }

  return (
    <div className="library-grid">
      {entries.map(({ item, savedAt }) => (
        <article key={item.id} className="library-card">
          <div className="library-card__top">
            <span className="discussion-card__badge">Saved</span>
            {item.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="pill">
                {tag}
              </span>
            ))}
          </div>

          <h3 className="library-card__title">
            <Link className="inline-link" href={`/content/${item.id}`}>
              {item.title}
            </Link>
          </h3>

          <p className="library-card__summary" lang="bn">
            {item.summaryBn}
          </p>

          <div className="library-card__footer">
            <span className="library-card__meta">
              {item.sourceLanguage.toUpperCase()} · Saved {savedAt.slice(0, 10)}
            </span>

            <div className="library-card__actions">
              <Link className="inline-link" href={`/content/${item.id}`}>
                Read the summary
                <Icon className="icon-sm" name="arrow-right" />
              </Link>
              <RemoveSavedItemButton itemId={item.id} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
