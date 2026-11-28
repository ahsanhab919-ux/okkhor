import Link from "next/link";
import React from "react";

import type { CommunityThreadSummary } from "@/src/modules/community/domain/community-types";
import { Icon } from "@/src/modules/experience/ui";

function excerpt(body: string) {
  return body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body;
}

/**
 * A relative "4h ago"-style stamp, the way the Stitch hub cards read. Anything a week or older
 * falls back to its calendar date so a stale thread still shows a concrete time.
 */
function postedAgo(iso: string) {
  const created = new Date(iso).getTime();

  if (Number.isNaN(created)) {
    return iso.slice(0, 10);
  }

  const minutes = Math.round((Date.now() - created) / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return days < 7 ? `${days}d ago` : iso.slice(0, 10);
}

/**
 * The shared discussion-card list: used by the community hub, by member profiles, and by the
 * moderation queue, so every surface renders the same card (`member-profile-slice.md` §8,
 * `community-moderation-slice.md` §8). The empty message is callable so each surface can phrase it
 * for its own context. The state pills only ever show on a moderator surface: member reads omit
 * hidden threads. `authors` is an optional id→display-name map the composition root resolves; the
 * byline is simply omitted on surfaces that do not know it.
 */
export function ThreadList({
  threads,
  emptyMessage = "No discussions yet. Start the first thread.",
  hrefBase = "/community",
  authors,
}: {
  threads: CommunityThreadSummary[];
  emptyMessage?: string;
  /** The moderation queue links each card to its moderator page instead of the member thread. */
  hrefBase?: string;
  /** Author display names by id, resolved by the composition root. */
  authors?: Record<string, string>;
}) {
  if (threads.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <section className="discussion-list">
      {threads.map((thread) => {
        const author = authors?.[thread.authorId];

        return (
          <article key={thread.id} className="discussion-card">
            <div className="discussion-card__body">
              <div className="discussion-card__meta">
                <span className="discussion-card__badge">{thread.category}</span>
                {thread.moderationState === "hidden" ? <span className="pill">Hidden</span> : null}
                {thread.locked ? <span className="pill">Locked</span> : null}
                {author ? (
                  <span className="discussion-card__byline">
                    Posted by <strong>{author}</strong>
                  </span>
                ) : null}
                <span className="discussion-card__ago">{postedAgo(thread.createdAt)}</span>
              </div>
              <h3>
                <Link className="inline-link" href={`${hrefBase}/${thread.id}`}>
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
        );
      })}
    </section>
  );
}
