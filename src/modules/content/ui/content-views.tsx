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
        <span key={tag} className="pill">
          {tag}
        </span>
      ))}
    </div>
  );
}

export function ContentItemList({ items }: { items: ResearchItem[] }) {
  if (items.length === 0) {
    return <p>No published research items are available yet.</p>;
  }

  return (
    <div className="archive-grid">
      {items.map((item) => (
        <article key={item.id} className="archive-card">
          <div className="archive-card__body">
            <ItemTags tags={item.tags} />
            <h3>{item.title}</h3>
            <p lang="bn">{item.summaryBn}</p>
            <Link className="inline-link" href={`/content/${item.id}`}>
              Read the summary
              <Icon className="icon-sm" name="arrow-right" />
            </Link>
          </div>
        </article>
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
