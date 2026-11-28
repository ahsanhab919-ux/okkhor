import Link from "next/link";
import { redirect } from "next/navigation";
import React from "react";

import { listThreadsByAuthor } from "@/src/modules/community/application/community-service";
import { ThreadList } from "@/src/modules/community/ui/thread-list";
import { listContentItems } from "@/src/modules/content/application/content-service";
import { ContentItemList } from "@/src/modules/content/ui/content-views";
import { getPublicProfile } from "@/src/modules/identity/application/auth-service";
import { EmailSettingsForm } from "@/src/modules/identity/ui/email-settings-form";
import { ProfileCard } from "@/src/modules/identity/ui/profile-card";
import { countSavedItems } from "@/src/modules/library/application/library-service";

import { getProfileViewer } from "../profile-session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const viewer = await getProfileViewer();

  if (!viewer) {
    redirect("/auth?next=/profile");
  }

  const memberId = viewer.user.id;
  const [profile, allItems, threads, savedCount] = await Promise.all([
    getPublicProfile(memberId),
    listContentItems(),
    listThreadsByAuthor(memberId, { limit: 20 }),
    countSavedItems({ id: memberId, roles: viewer.user.roles }),
  ]);

  if (!profile) {
    redirect("/auth?next=/profile");
  }

  // The owner's own view includes their drafts, flagged with a status pill; another member never
  // sees a draft (`member-profile-slice.md` §13 decision 4).
  const items = allItems.filter((item) => item.authorId === memberId);

  return (
    <section className="content-band">
      <ProfileCard profile={profile} />

      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Account</p>
          <h2>Account Email</h2>
        </div>
        <p>Used only to send your password-reset code. It is never shown on your public profile.</p>
      </div>
      <EmailSettingsForm initialEmail={viewer.user.email} />

      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Reading List</p>
          <h2>My Library</h2>
        </div>
        <p>
          <Link className="inline-link" href="/library">
            {savedCount} saved {savedCount === 1 ? "item" : "items"}
          </Link>
        </p>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Authored</p>
          <h2>Research Items</h2>
        </div>
      </div>
      <ContentItemList emptyMessage="You have not authored any research items yet." items={items} showStatus />

      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Authored</p>
          <h2>Community Threads</h2>
        </div>
      </div>
      <ThreadList emptyMessage="You have not started a thread yet." threads={threads} />
    </section>
  );
}
