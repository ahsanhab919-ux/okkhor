import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getPublishedItem } from "@/src/modules/content/application/content-service";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import { ContentItemDetail } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { Icon, PublicTopNav } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Item | Okkhor",
};

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

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell">
        <ContentItemDetail item={item} />

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
