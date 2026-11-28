import Link from "next/link";
import React from "react";

import {
  listDistinctCategories,
  listThreads,
} from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";
import { getPublicProfile } from "@/src/modules/identity/application/auth-service";

export const dynamic = "force-dynamic";

/**
 * The community hub, aligned to the Stitch "Community Hub - Okkhor Desktop" screen. It keeps every
 * real field the thread model carries — category, author, age, excerpt, reply count — and maps the
 * Stitch right rail onto data we actually hold: "Knowledge Domains" is the live category index, and
 * the contributor prompt links to the existing scholar-verification flow. Vote counts, archive
 * statistics, and recent comments have no backing data and are therefore not rendered.
 */
export default async function CommunityPage() {
  const [{ threads }, categories] = await Promise.all([
    listThreads({ limit: 20 }),
    listDistinctCategories(),
  ]);

  // The composition root owns the identity join: the community module only ever returns author ids.
  const authorIds = Array.from(new Set(threads.map((thread) => thread.authorId)));
  const profiles = await Promise.all(authorIds.map((id) => getPublicProfile(id)));
  const authors: Record<string, string> = {};

  for (const profile of profiles) {
    if (profile) {
      authors[profile.id] = profile.displayName;
    }
  }

  return (
    <div className="hub">
      <section className="community-hero">
        <div>
          <h2 className="community-hero__title">Community Hub</h2>
          <p className="community-hero__lead">
            Connect with scholars, challenge ideas, and debate how research should be translated into living
            curriculum for South Asian learners.
          </p>
        </div>
        <Link className="button button--primary" href="/community/new">
          Start a Thread
        </Link>
      </section>

      <div className="hub-grid">
        <div className="hub-feed">
          <div className="hub-feed__head">
            <h3>Popular Discussions</h3>
            <span>
              {threads.length} {threads.length === 1 ? "thread" : "threads"}
            </span>
          </div>
          <ThreadList authors={authors} threads={threads} />
        </div>

        <aside className="hub-rail">
          {categories.length > 0 ? (
            <section className="hub-card">
              <p className="hub-card__eyebrow">Knowledge Domains</p>
              <div className="hub-tags">
                {categories.map((entry) => (
                  <Link
                    className="hub-tag"
                    href={`/categories/${encodeURIComponent(entry.category)}`}
                    key={entry.category}
                  >
                    {entry.category}
                    <span className="hub-tag__count">{entry.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="hub-card hub-card--cta">
            <p className="hub-card__eyebrow">Elite Contributor Program</p>
            <h3>Bring your research to the archive.</h3>
            <p>
              Verified scholars publish summaries, review submissions, and shape the curriculum that reaches
              learners across South Asia.
            </p>
            <Link className="button button--primary" href="/scholar-verify">
              Apply Now
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
