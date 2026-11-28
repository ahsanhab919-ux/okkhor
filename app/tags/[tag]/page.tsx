import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { listPublishedItemsByTag } from "@/src/modules/content/application/content-service";
import { ContentItemList } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { Icon, PublicTopNav } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

type TagBrowsePageProps = {
  params: Promise<{ tag: string }>;
};

export async function generateMetadata({ params }: TagBrowsePageProps): Promise<Metadata> {
  const { tag } = await params;

  return { title: `${tag} | Okkhor` };
}

/**
 * The public research-by-tag page (`topic-browse-slice.md` §3). Next.js has already decoded the
 * dynamic segment, so `params.tag` is the exact stored value; an unknown or tag-less value simply
 * renders the empty state rather than a 404.
 */
export default async function TagBrowsePage({ params }: TagBrowsePageProps) {
  const { tag } = await params;
  const items = await listPublishedItemsByTag(tag, { limit: 20 });

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="content-band">
          <header className="page-hero">
            <div>
              <p className="eyebrow eyebrow--blue">Research Topic</p>
              <h1 className="page-hero__title">{tag}</h1>
              <p className="page-hero__lead">
                Published research filed under this topic, newest first.
              </p>
            </div>
            <div className="page-hero__actions">
              <Link className="inline-link inline-link--featured" href="/topics">
                <Icon className="icon-sm" name="arrow-right" />
                Back to all topics
              </Link>
            </div>
          </header>

          <ContentItemList
            emptyMessage={`No published research carries the "${tag}" tag yet.`}
            items={items}
          />
        </section>
      </main>
    </div>
  );
}
