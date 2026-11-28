import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getModerationThread } from "@/src/modules/community/application/community-service";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { ModerationControls } from "@/src/modules/community/ui/moderation-controls";

import { getCommunityViewer } from "../../../community-session";

export const dynamic = "force-dynamic";

type AdminCommunityThreadPageProps = {
  params: Promise<{ id: string }>;
};

/** A thread with all of its replies — hidden ones included — plus the moderation controls. */
export default async function AdminCommunityThreadPage({ params }: AdminCommunityThreadPageProps) {
  const { id } = await params;
  const viewer = await getCommunityViewer();

  if (!viewer) {
    notFound();
  }

  const { thread, replies } = await getModerationThread(viewer.actor, id).catch((error: unknown) => {
    if (error instanceof CommunityError && error.code === "COMMUNITY_THREAD_NOT_FOUND") {
      notFound();
    }

    throw error;
  });

  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <div className="page-hero__tags">
            <span className="pill">{thread.category}</span>
            {thread.moderationState === "hidden" ? <span className="pill">Hidden</span> : null}
            {thread.locked ? <span className="pill">Locked</span> : null}
          </div>
          <h1 className="page-hero__title">{thread.title}</h1>
          <p className="page-hero__lead">Started {thread.createdAt.slice(0, 10)}</p>
        </div>
        <div className="page-hero__actions">
          <Link className="inline-link" href="/admin/community">
            Back to the queue
          </Link>
        </div>
      </header>

      <div className="console-stack">
        <article className="mini-panel">
          <p className="eyebrow">Thread</p>
          <p>{thread.body}</p>
        </article>

        <ModerationControls
          id={thread.id}
          locked={thread.locked}
          moderationState={thread.moderationState}
          target="thread"
        />

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Replies</h2>
            </div>
          </div>
          {replies.length === 0 ? (
            <p>No replies yet.</p>
          ) : (
            <ul className="activity-list">
              {replies.map((reply) => (
                <li key={reply.id} className="activity-entry">
                  <p>{reply.body}</p>
                  <span>{reply.createdAt.slice(0, 10)}</span>
                  {reply.moderationState === "hidden" ? <span className="pill">Hidden</span> : null}
                  <ModerationControls
                    id={reply.id}
                    moderationState={reply.moderationState}
                    target="reply"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
