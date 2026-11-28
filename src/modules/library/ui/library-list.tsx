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
 * The saved-items list: each entry reuses the archive card and links to `/content/[id]`, with a
 * Remove affordance. An empty library shows an empty state.
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
    <div className="archive-grid">
      {entries.map(({ item, savedAt }) => (
        <article key={item.id} className="archive-card">
          <div className="archive-card__body">
            <div>
              <span className="pill">Saved {savedAt.slice(0, 10)}</span>
            </div>
            <h3>{item.title}</h3>
            <p lang="bn">{item.summaryBn}</p>

            <div className="discussion-card__actions">
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
