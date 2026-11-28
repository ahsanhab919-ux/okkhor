import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getThread } from "@/src/modules/community/application/community-service";
import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { ModerationControls } from "@/src/modules/community/ui/moderation-controls";
import { ReplyForm } from "@/src/modules/community/ui/reply-form";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

type CommunityThreadPageProps = {
  params: Promise<{ id: string }>;
};

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

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span className="pill">{thread.category}</span>
          {thread.locked ? <span className="pill">Locked</span> : null}
          <h1>{thread.title}</h1>
          <p>Started {thread.createdAt.slice(0, 10)}</p>
        </div>
        <Link className="inline-link" href="/community">
          Back to the community
        </Link>
      </div>

      <article>
        <p>{thread.body}</p>
      </article>

      {thread.locked ? (
        <p className="session-banner" role="status">
          This thread is locked. New replies are closed.
        </p>
      ) : null}

      <section className="content-band">
        <h2>Replies</h2>
        {replies.length === 0 ? (
          <p>No replies yet. Be the first to respond.</p>
        ) : (
          <ul className="activity-list">
            {replies.map((reply) => (
              <li key={reply.id} className="activity-entry">
                <p>{reply.body}</p>
                <span>{reply.createdAt.slice(0, 10)}</span>
                {moderator ? (
                  <ModerationControls
                    id={reply.id}
                    moderationState={reply.moderationState}
                    target="reply"
                  />
                ) : null}
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
    </section>
  );
}
