import Link from "next/link";
import React from "react";

import { listThreadsByCategory } from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";

export const dynamic = "force-dynamic";

type CategoryBrowsePageProps = {
  params: Promise<{ category: string }>;
};

/**
 * The members-only threads-by-category page (`topic-browse-slice.md` §3). The repository read is
 * visible-only, so a hidden thread never appears here; an unknown or empty category renders the
 * empty state rather than a 404.
 */
export default async function CategoryBrowsePage({ params }: CategoryBrowsePageProps) {
  const { category } = await params;
  const { threads } = await listThreadsByCategory(category, { limit: 20 });

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span className="pill">Category</span>
          <h1>{category}</h1>
        </div>
        <Link className="inline-link" href="/topics">
          Back to all topics
        </Link>
      </div>

      <ThreadList
        emptyMessage={`No visible discussions in the "${category}" category yet.`}
        threads={threads}
      />
    </section>
  );
}
