import Link from "next/link";
import React from "react";
import type { ReactNode } from "react";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import { Icon } from "@/src/modules/experience/ui";

/** The author label the detail page resolves from identity before handing it to the view. */
export type ContentDetailAuthor = {
  id: string;
  displayName: string;
  roleLabel: string;
};

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

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/** A rough reading time derived from the copy we actually store — abstract plus Bangla summary. */
function estimateReadMinutes(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.round(words / 200));
}

/**
 * The item detail view, modelled on the Stitch screen "Research Episode Detail": a cover hero with
 * the title and author, an overlapping action bar, a two-column body (Bangla overview beside the
 * expert card) and a related-items rail. The Stitch design's episode number, credentials and
 * download/share controls have no backing data here, so they are omitted rather than faked.
 */
export function ContentItemDetail({
  item,
  author,
  relatedItems = [],
  saveAction,
}: {
  item: ResearchItem;
  author?: ContentDetailAuthor;
  relatedItems?: ResearchItem[];
  /** The client-side save island, injected by the page. */
  saveAction?: ReactNode;
}) {
  const category = item.tags[0] ?? "Research";
  const publishedLabel = item.publishedAt ? item.publishedAt.slice(0, 10) : "Unpublished";
  const readMinutes = estimateReadMinutes(`${item.abstract} ${item.summaryBn}`);

  return (
    <article className="detail-article">
      <header className="detail-hero" style={{ backgroundImage: exploreCover(item.id) }}>
        <div aria-hidden="true" className="detail-hero__scrim" />

        <div className="detail-hero__inner">
          <div className="detail-hero__pills">
            <span className="detail-pill">{category}</span>
            <span className="detail-hero__read">
              <Icon className="icon-sm" name="book" />
              {readMinutes} min read
            </span>
          </div>

          <h1 className="detail-hero__title">{item.title}</h1>

          <div className="detail-hero__meta">
            <span>{item.sourceLanguage.toUpperCase()}</span>
            <span aria-hidden="true">&middot;</span>
            <span>Published {publishedLabel}</span>
          </div>

          {author ? (
            <Link className="detail-hero__author" href={`/u/${author.id}`}>
              <span aria-hidden="true" className="detail-avatar">
                {initials(author.displayName)}
              </span>
              <span className="detail-hero__author-copy">
                <span className="detail-hero__author-name">{author.displayName}</span>
                <span className="detail-hero__author-role">{author.roleLabel}</span>
              </span>
            </Link>
          ) : null}
        </div>
      </header>

      <section className="detail-actions">
        <div className="detail-actions__bar">
          {saveAction ? <div className="detail-actions__primary">{saveAction}</div> : null}
          {item.sourceUrl ? (
            <a className="detail-actions__link" href={item.sourceUrl} rel="noreferrer" target="_blank">
              View the original source
              <Icon className="icon-sm" name="arrow-right" />
            </a>
          ) : null}
        </div>
      </section>

      <section className="detail-grid">
        <div className="detail-main">
          <div className="detail-section">
            <h2 className="detail-section__title">Research Overview</h2>
            <p className="detail-summary" lang="bn">
              {item.summaryBn}
            </p>
          </div>

          <div className="detail-section">
            <h2 className="detail-section__title detail-section__title--muted">Source Abstract</h2>
            <p className="detail-abstract" lang={item.sourceLanguage}>
              {item.abstract}
            </p>
          </div>

          <ItemTags tags={item.tags} />
        </div>

        {author ? (
          <aside className="detail-aside">
            <div className="detail-expert">
              <p className="detail-expert__eyebrow">Expert Context</p>
              <span aria-hidden="true" className="detail-avatar detail-avatar--lg">
                {initials(author.displayName)}
              </span>
              <h3 className="detail-expert__name">{author.displayName}</h3>
              <p className="detail-expert__role">{author.roleLabel}</p>
              <Link className="detail-expert__link" href={`/u/${author.id}`}>
                View full profile
              </Link>
            </div>
          </aside>
        ) : null}
      </section>

      {relatedItems.length > 0 ? (
        <section className="detail-related">
          <h2 className="detail-related__title">Expand Your Horizons</h2>
          <div className="detail-related__rail">
            {relatedItems.map((related) => (
              <Link className="detail-related__card" href={`/content/${related.id}`} key={related.id}>
                <span
                  aria-hidden="true"
                  className="detail-related__cover"
                  style={{ background: exploreCover(related.id) }}
                />
                <span className="detail-related__name">{related.title}</span>
                <span className="detail-related__summary" lang="bn">
                  {related.summaryBn}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
