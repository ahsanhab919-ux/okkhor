import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getContentItem } from "@/src/modules/content/application/content-service";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import { ItemEditorForm } from "@/src/modules/content/ui/item-editor-form";

export const dynamic = "force-dynamic";

type StudioItemPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StudioItemPage({ params }: StudioItemPageProps) {
  const { id } = await params;
  const item = await getContentItem(id).catch((error: unknown) => {
    if (error instanceof ContentError && error.code === "CONTENT_ITEM_NOT_FOUND") {
      notFound();
    }

    throw error;
  });

  return (
    <section className="content-band">
      <header className="studio-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Authoring</p>
          <h1 className="studio-hero__title">Edit research item</h1>
          <p className="studio-hero__lead">
            Update the metadata or the Bangla summary, or switch the item between draft and published.
          </p>
        </div>
        <Link className="inline-link" href="/studio">
          Back to the studio
        </Link>
      </header>

      <ItemEditorForm item={item} />
    </section>
  );
}
