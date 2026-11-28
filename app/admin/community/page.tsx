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
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Moderation</p>
          <h1>Community Queue</h1>
        </div>
        <Link className="inline-link" href="/admin/community/reports">
          Reports
        </Link>
        <Link className="inline-link" href="/community">
          Back to the community
        </Link>
      </div>

      <ThreadList
        emptyMessage="No threads to moderate yet."
        hrefBase="/admin/community"
        threads={threads}
      />
    </section>
  );
}
