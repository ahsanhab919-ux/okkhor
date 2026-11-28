import Link from "next/link";
import React from "react";

import { listThreads } from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const { threads } = await listThreads({ limit: 20 });

  return (
    <div>
      <div className="community-hero">
        <div>
          <h2>Community Hub</h2>
          <p>
            Connect with scholars, challenge ideas, and debate how research should be translated into living
            curriculum for South Asian learners.
          </p>
        </div>
        <Link className="button button--primary" href="/community/new">
          Start a Thread
        </Link>
      </div>

      <ThreadList threads={threads} />
    </div>
  );
}
