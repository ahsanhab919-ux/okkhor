import Link from "next/link";
import React from "react";

import { listModerationQueue } from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

/**
 * The moderation queue: newest threads, hidden ones included. The layout already restricts this
 * route to administrators, so the use case here is the second line of defence (`ADR-001`).
 */
export default async function AdminCommunityPage() {
  const viewer = await getCommunityViewer();
  const threads = viewer ? await listModerationQueue(viewer.actor, { limit: 50 }) : [];

  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Moderation</p>
          <h1 className="page-hero__title">Community Queue</h1>
          <p className="page-hero__lead">
            Every thread in the archive — hidden and locked ones included. Open a thread to hide, lock, or
            review its replies.
          </p>
        </div>
        <div className="page-hero__actions">
          <Link className="inline-link" href="/admin/community/reports">
            Reports
          </Link>
          <Link className="inline-link" href="/community">
            Back to the community
          </Link>
          <span className="page-hero__count">
            <strong>{threads.length}</strong>
            <span>Threads</span>
          </span>
        </div>
      </header>

      <ThreadList
        emptyMessage="No threads to moderate yet."
        hrefBase="/admin/community"
        threads={threads}
      />
    </section>
  );
}
