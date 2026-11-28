import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getThread } from "@/src/modules/community/application/community-service";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { ReplyForm } from "@/src/modules/community/ui/reply-form";

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

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span className="pill">{thread.category}</span>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReplyForm threadId={thread.id} />
    </section>
  );
}
