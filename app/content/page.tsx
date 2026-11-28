import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import {
  listDistinctPublishedTags,
  listPublishedItems,
} from "@/src/modules/content/application/content-service";
import { ContentExploreGrid } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { PublicTopNav } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Archive | Okkhor",
  description: "Read Bangla summaries of research items in the Okkhor archive.",
};

/**
 * The public archive index. It stays unauthenticated (it is not in the edge middleware matcher) but
 * adopts the Stitch "Explore - Okkhor Desktop" layout: a discovery hero, tag filters wired to the
 * existing `/tags/[tag]` pages, and a bento grid of real archive items.
 */
export default async function ContentListPage() {
  const [{ items }, tags] = await Promise.all([
    listPublishedItems({ limit: 20 }),
    listDistinctPublishedTags(),
  ]);

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="explore-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Discovery Engine</p>
            <h1 className="explore-hero__title">
              The Knowledge
              <br />
              <span className="explore-hero__accent">Ecosystem.</span>
            </h1>
            <p className="explore-hero__lead">
              Every item pairs a source-language abstract with a Bangla summary, so research is understandable
              without translation tools.
            </p>
          </div>
          <span className="explore-sort">Sort: Latest</span>
        </section>

        <nav className="explore-filters" aria-label="Filter research by tag">
          <Link className="explore-pill explore-pill--active" href="/content">
            All Research
          </Link>
          {tags.map((tag) => (
            <Link className="explore-pill" href={`/tags/${encodeURIComponent(tag.tag)}`} key={tag.tag}>
              {tag.tag}
            </Link>
          ))}
        </nav>

        <ContentExploreGrid items={items} />

        <section className="explore-load-more">
          <div className="explore-load-more__rule" />
          <p>
            Showing the latest {items.length} {items.length === 1 ? "research item" : "research items"}
          </p>
        </section>

        <footer className="marketing-footer">
          <div className="marketing-footer__links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <a href="#ethics">Research Ethics</a>
            <a href="#support">Scholar Support</a>
          </div>
          <p>&copy; 2024 Okkhor. The Illuminated Archive. All Rights Reserved.</p>
        </footer>
      </main>
    </div>
  );
}
