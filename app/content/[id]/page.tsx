import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import {
  getPublishedItem,
  listPublishedItems,
  listPublishedItemsByTag,
} from "@/src/modules/content/application/content-service";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import { ContentItemDetail } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { Icon, PublicTopNav } from "@/src/modules/experience/ui";
import { getPublicProfile } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { isItemSaved } from "@/src/modules/library/application/library-service";
import { SaveItemButton } from "@/src/modules/library/ui/save-item-button";

import { getLibraryViewer } from "../../library-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Item | Okkhor",
};

const ROLE_LABELS: Record<UserRole, string> = {
  learner: "Member",
  scholar: "Scholar",
  admin: "Admin",
};

/** The most senior role the author holds, shown as the expert-card subtitle. */
function roleLabel(roles: UserRole[]) {
  if (roles.includes("admin")) {
    return ROLE_LABELS.admin;
  }

  if (roles.includes("scholar")) {
    return ROLE_LABELS.scholar;
  }

  return ROLE_LABELS.learner;
}

type ContentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContentDetailPage({ params }: ContentDetailPageProps) {
  const { id } = await params;
  const item = await getPublishedItem(id).catch((error: unknown) => {
    if (error instanceof ContentError && error.code === "CONTENT_ITEM_NOT_FOUND") {
      notFound();
    }

    throw error;
  });
  // An optional viewer: anonymous readers still get the page, with a sign-in affordance instead of
  // a save toggle (`library-slice.md` §8).
  const viewer = await getLibraryViewer();
  const [initialSaved, authorProfile] = await Promise.all([
    viewer ? isItemSaved(viewer.actor, item.id) : Promise.resolve(false),
    item.authorId ? getPublicProfile(item.authorId) : Promise.resolve(undefined),
  ]);

  // The rail mirrors Stitch's "Expand Your Horizons": the item's own tag first, topped up by the
  // newest items, and never including the item being read.
  const primaryTag = item.tags[0];
  const relatedCandidates = primaryTag
    ? await listPublishedItemsByTag(primaryTag, { limit: 6 })
    : (await listPublishedItems({ limit: 6 })).items;
  const relatedItems = relatedCandidates.filter((candidate) => candidate.id !== item.id).slice(0, 3);
  const author = authorProfile
    ? { id: authorProfile.id, displayName: authorProfile.displayName, roleLabel: roleLabel(authorProfile.roles) }
    : undefined;

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <ContentItemDetail
          author={author}
          item={item}
          relatedItems={relatedItems}
          saveAction={<SaveItemButton authenticated={Boolean(viewer)} initialSaved={initialSaved} itemId={item.id} />}
        />

        <p>
          <Link className="inline-link inline-link--featured" href="/content">
            <Icon className="icon-sm" name="arrow-right" />
            Back to the archive
          </Link>
        </p>
      </main>
    </div>
  );
}
