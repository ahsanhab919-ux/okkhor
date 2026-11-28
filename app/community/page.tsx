import Link from "next/link";
import React from "react";

import { listThreads } from "@/src/modules/community/application/community-service";
import { Icon } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

function excerpt(body: string) {
  return body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body;
}

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

      {threads.length === 0 ? (
        <p>No discussions yet. Start the first thread.</p>
      ) : (
        <section className="discussion-list">
          {threads.map((thread) => (
            <article key={thread.id} className="discussion-card">
              <div className="discussion-card__body">
                <div className="discussion-card__meta">
                  <span className="pill">{thread.category}</span>
                  <span>{thread.createdAt.slice(0, 10)}</span>
                </div>
                <h3>
                  <Link className="inline-link" href={`/community/${thread.id}`}>
                    {thread.title}
                  </Link>
                </h3>
                <p>{excerpt(thread.body)}</p>

                <div className="discussion-card__actions">
                  <span className="inline-action">
                    <Icon className="icon-xs" name="community" />
                    {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
