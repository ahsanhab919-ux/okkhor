import Link from "next/link";
import React from "react";

import { listDistinctCategories } from "@/src/modules/community/application/community-service";
import { ThreadForm } from "@/src/modules/community/ui/thread-form";

export const dynamic = "force-dynamic";

/**
 * The new-thread page, aligned to the Stitch "Create Discussion Thread" screen. The suggested
 * categories come from the live category index, so the chips match the domains already in use
 * rather than a fixed list.
 */
export default async function CommunityNewThreadPage() {
  const categories = await listDistinctCategories();
  const suggestedCategories = categories.slice(0, 5).map((entry) => entry.category);

  return (
    <div className="composer-page">
      <section className="community-hero">
        <div>
          <h2 className="community-hero__title">Start a New Discussion</h2>
          <p className="community-hero__lead">Contribute your insight to the Illuminated Archive.</p>
        </div>
        <Link className="inline-link" href="/community">
          Back to the community
        </Link>
      </section>

      <ThreadForm suggestedCategories={suggestedCategories} />
    </div>
  );
}
