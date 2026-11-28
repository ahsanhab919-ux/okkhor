import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { listThreadsByAuthor } from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";
import { listPublishedItemsByAuthor } from "@/src/modules/content/application/content-service";
import { ContentItemList } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { PublicTopNav } from "@/src/modules/experience/ui";
import { getPublicProfile } from "@/src/modules/identity/application/auth-service";
import { ProfileCard } from "@/src/modules/identity/ui/profile-card";

import { getProfileViewer } from "../../profile-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Member Profile | Okkhor",
};

type MemberProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function MemberProfilePage({ params }: MemberProfilePageProps) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) {
    notFound();
  }

  const viewer = await getProfileViewer();
  const items = await listPublishedItemsByAuthor(id, { limit: 20 });
  // Community is a members-only surface, so a thread list is only shown to a signed-in viewer; an
  // anonymous visitor gets a sign-in prompt instead (`member-profile-slice.md` §7).
  const threads = viewer ? await listThreadsByAuthor(id, { limit: 20 }) : [];

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="content-band">
          <ProfileCard profile={profile} />

          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Authored</p>
              <h2>Research Items</h2>
            </div>
          </div>
          <ContentItemList
            emptyMessage={`${profile.displayName} has not published any research items yet.`}
            items={items}
          />

          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Authored</p>
              <h2>Community Threads</h2>
            </div>
          </div>
          {viewer ? (
            <ThreadList emptyMessage={`${profile.displayName} has not started a thread yet.`} threads={threads} />
          ) : (
            <p>
              <Link className="inline-link" href={`/auth?next=${encodeURIComponent(`/u/${id}`)}`}>
                Sign in
              </Link>{" "}
              to see {profile.displayName}&apos;s community threads.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
