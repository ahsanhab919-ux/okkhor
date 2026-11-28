import Link from "next/link";
import React from "react";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import { Icon } from "@/src/modules/experience/ui";

function ItemTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div>
      {tags.map((tag) => (
        <Link key={tag} className="pill" href={`/tags/${encodeURIComponent(tag)}`}>
          {tag}
        </Link>
      ))}
    </div>
  );
}

export function ContentItemList({
  items,
  showStatus = false,
  emptyMessage = "No published research items are available yet.",
}: {
  items: ResearchItem[];
  /** Shows a Published/Draft pill and links a draft to the Studio instead of the public page. */
  showStatus?: boolean;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="archive-grid">
      {items.map((item) => {
        const isDraft = item.status === "draft";

        return (
          <article key={item.id} className="archive-card">
            <div className="archive-card__body">
              <ItemTags tags={item.tags} />
              {showStatus ? (
                <div>
                  <span className="pill">{isDraft ? "Draft" : "Published"}</span>
                </div>
              ) : null}
              <h3>{item.title}</h3>
              <p lang="bn">{item.summaryBn}</p>
              <Link className="inline-link" href={isDraft ? `/studio/${item.id}` : `/content/${item.id}`}>
                {isDraft ? "Open in Studio" : "Read the summary"}
                <Icon className="icon-sm" name="arrow-right" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * The Stitch "Explore" bento covers. Models have no cover image, so each item gets a stable
 * gradient derived from its id — the same item always paints the same cover.
 */
const EXPLORE_COVER_GRADIENTS = [
  "linear-gradient(135deg, #13203f 0%, #294a8c 55%, #5ca3ff 100%)",
  "linear-gradient(135deg, #1b1831 0%, #3b2f7a 55%, #6ca6ff 100%)",
  "linear-gradient(135deg, #132a29 0%, #1e5d63 55%, #8be8ff 100%)",
  "linear-gradient(135deg, #23192d 0%, #4d3a79 55%, #7bc4ff 100%)",
  "linear-gradient(135deg, #2a1a14 0%, #6b3a22 55%, #ffb786 100%)",
  "linear-gradient(135deg, #14202b 0%, #2f4a63 55%, #9ecbff 100%)",
];

function exploreCover(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return EXPLORE_COVER_GRADIENTS[hash % EXPLORE_COVER_GRADIENTS.length];
}

function ExploreCard({ feature = false, item }: { feature?: boolean; item: ResearchItem }) {
  const category = item.tags[0] ?? "Research";
  const published = item.publishedAt ? item.publishedAt.slice(0, 10) : "New";

  return (
    <article className={`explore-card${feature ? " explore-card--feature" : ""}`}>
      <div className="explore-card__cover" style={{ background: exploreCover(item.id) }}>
        <div className="explore-card__badges">
          <span className="explore-badge explore-badge--accent">{category}</span>
          <span className="explore-badge">{item.sourceLanguage.toUpperCase()}</span>
        </div>
      </div>

      <div className="explore-card__body">
        <h3 className="explore-card__title">{item.title}</h3>
        <p className="explore-card__summary" lang="bn">
          {item.summaryBn}
        </p>
        <div className="explore-card__meta">
          <span>{published}</span>
          <Link
            aria-label={`Read the summary of ${item.title}`}
            className="explore-card__cta"
            href={`/content/${item.id}`}
          >
            <Icon className="icon-sm" name="arrow-right" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * The public archive grid on `/content`, modelled on the Stitch screen "Explore - Okkhor
 * Desktop": the newest item renders as a wide feature card, the rest as a dense three-up grid.
 */
export function ContentExploreGrid({
  items,
  emptyMessage = "No published research items are available yet.",
}: {
  items: ResearchItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  const [feature, ...rest] = items;

  return (
    <div className="explore-grid">
      <ExploreCard feature item={feature} />
      {rest.map((item) => (
        <ExploreCard item={item} key={item.id} />
      ))}
    </div>
  );
}

export function ContentItemDetail({ item }: { item: ResearchItem }) {
  const publishedLabel = item.publishedAt ? ` · Published ${item.publishedAt.slice(0, 10)}` : "";

  return (
    <article>
      <ItemTags tags={item.tags} />
      <h1>{item.title}</h1>
      <p>
        Source language: {item.sourceLanguage.toUpperCase()}
        {publishedLabel}
      </p>

      <section>
        <h2>Abstract</h2>
        <p lang={item.sourceLanguage}>{item.abstract}</p>
      </section>

      <section>
        <h2>Bangla Summary</h2>
        <p lang="bn">{item.summaryBn}</p>
      </section>

      {item.sourceUrl ? (
        <a className="inline-link" href={item.sourceUrl} rel="noreferrer" target="_blank">
          View the original source
          <Icon className="icon-sm" name="arrow-right" />
        </a>
      ) : null}
    </article>
  );
}
