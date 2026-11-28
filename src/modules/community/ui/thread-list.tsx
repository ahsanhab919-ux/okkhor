import Link from "next/link";
import React from "react";

import type { CommunityThreadSummary } from "@/src/modules/community/domain/community-types";
import { Icon } from "@/src/modules/experience/ui";

function excerpt(body: string) {
  return body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body;
}

/**
 * The shared discussion-card list: used by the community hub and by member profiles, so both
 * render the same card (`member-profile-slice.md` §8). The empty message is callable so each
 * surface can phrase it for its own context.
 */
export function ThreadList({
  threads,
  emptyMessage = "No discussions yet. Start the first thread.",
}: {
  threads: CommunityThreadSummary[];
  emptyMessage?: string;
}) {
  if (threads.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
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
  );
}
