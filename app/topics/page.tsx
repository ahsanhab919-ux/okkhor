import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { listDistinctCategories } from "@/src/modules/community/application/community-service";
import { listDistinctPublishedTags } from "@/src/modules/content/application/content-service";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { PublicTopNav } from "@/src/modules/experience/ui";

import { getCommunityViewer } from "../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Topics | Okkhor",
  description: "Browse research by tag and community discussions by category.",
};

/**
 * The public browse index (`topic-browse-slice.md` §7). The research-tag section renders for
 * everyone; the community-category half is a members-only surface, so it only renders for a
 * signed-in viewer and is replaced by a sign-in prompt otherwise.
 */
export default async function TopicsPage() {
  const tags = await listDistinctPublishedTags();
  const viewer = await getCommunityViewer();
  const categories = viewer ? await listDistinctCategories() : [];

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="content-band">
          <header className="page-hero">
            <div>
              <p className="eyebrow eyebrow--blue">Discovery</p>
              <h1 className="page-hero__title">Topics</h1>
              <p className="page-hero__lead">
                Every research tag in the archive with the number of published items filed under it.
                Choose a topic to read everything about it.
              </p>
            </div>
          </header>

          {tags.length === 0 ? (
            <p>No research topics yet.</p>
          ) : (
            <ul className="topic-grid">
              {tags.map((topic) => (
                <li key={topic.tag} className="topic-card">
                  <Link className="topic-card__link" href={`/tags/${encodeURIComponent(topic.tag)}`}>
                    {topic.tag}
                  </Link>
                  <span className="topic-card__count">
                    {topic.count} {topic.count === 1 ? "item" : "items"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <section className="topic-section">
            <p className="eyebrow eyebrow--blue">Community</p>
            <h2 className="topic-section__heading">Categories</h2>

            {viewer ? (
              categories.length === 0 ? (
                <p>No community categories yet.</p>
              ) : (
                <ul className="topic-grid">
                  {categories.map((topic) => (
                    <li key={topic.category} className="topic-card">
                      <Link
                        className="topic-card__link"
                        href={`/categories/${encodeURIComponent(topic.category)}`}
                      >
                        {topic.category}
                      </Link>
                      <span className="topic-card__count">
                        {topic.count} {topic.count === 1 ? "thread" : "threads"}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p>
                <Link className="inline-link" href={`/auth?next=${encodeURIComponent("/topics")}`}>
                  Sign in
                </Link>{" "}
                to browse community categories.
              </p>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
