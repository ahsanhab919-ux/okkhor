import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getThread } from "@/src/modules/community/application/community-service";
import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { ModerationControls } from "@/src/modules/community/ui/moderation-controls";
import { ReportControls } from "@/src/modules/community/ui/report-controls";
import { ReplyForm } from "@/src/modules/community/ui/reply-form";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

type CommunityThreadPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * The thread view. Stitch has no dedicated thread-detail screen, so this page carries the hub's
 * card language — a bordered lead post with the category pill and byline, then a replies feed —
 * rather than inventing a separate visual system.
 */
export default async function CommunityThreadPage({ params }: CommunityThreadPageProps) {
  const { id } = await params;
  const { thread, replies } = await getThread(id).catch((error: unknown) => {
    if (error instanceof CommunityError && error.code === "COMMUNITY_THREAD_NOT_FOUND") {
      notFound();
    }

    throw error;
  });

  const viewer = await getCommunityViewer();
  const moderator = viewer ? canModerate(viewer.user.roles) : false;
  const signedIn = Boolean(viewer);

  return (
    <div className="thread-page">
      <header className="thread-hero">
        <div className="thread-hero__meta">
          <Link className="pill" href={`/categories/${encodeURIComponent(thread.category)}`}>
            {thread.category}
          </Link>
          {thread.locked ? <span className="pill">Locked</span> : null}
          <span className="thread-hero__ago">Started {thread.createdAt.slice(0, 10)}</span>
        </div>
        <h1 className="thread-hero__title">{thread.title}</h1>
        <Link className="inline-link" href="/community">
          Back to the community
        </Link>
      </header>

      <article className="thread-post">
        <p>{thread.body}</p>
        {signedIn ? (
          <div className="thread-post__actions">
            <ReportControls id={thread.id} target="thread" />
          </div>
        ) : null}
      </article>

      {thread.locked ? (
        <p className="session-banner" role="status">
          This thread is locked. New replies are closed.
        </p>
      ) : null}

      <section className="thread-replies">
        <div className="thread-replies__head">
          <h2>Replies</h2>
          <span className="thread-replies__count">{replies.length}</span>
        </div>
        {replies.length === 0 ? (
          <p>No replies yet. Be the first to respond.</p>
        ) : (
          <ul className="reply-list">
            {replies.map((reply) => (
              <li key={reply.id} className="reply-card">
                <span className="reply-card__meta">{reply.createdAt.slice(0, 10)}</span>
                <p>{reply.body}</p>
                <div className="reply-card__actions">
                  {signedIn ? <ReportControls id={reply.id} target="reply" /> : null}
                  {moderator ? (
                    <ModerationControls
                      id={reply.id}
                      moderationState={reply.moderationState}
                      target="reply"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {thread.locked ? null : <ReplyForm threadId={thread.id} />}

      {moderator ? (
        <ModerationControls
          id={thread.id}
          locked={thread.locked}
          moderationState={thread.moderationState}
          target="thread"
        />
      ) : null}
    </div>
  );
}
