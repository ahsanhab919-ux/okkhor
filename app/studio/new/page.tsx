import Link from "next/link";
import React from "react";

import { ItemEditorForm } from "@/src/modules/content/ui/item-editor-form";

export const dynamic = "force-dynamic";

export default function StudioNewItemPage() {
  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Authoring</p>
          <h1 className="page-hero__title">New research item</h1>
          <p className="page-hero__lead">
            Give the item a title and an abstract, then publish it to the archive. The Bangla summary is
            generated on publish if you leave it blank.
          </p>
        </div>
        <Link className="inline-link" href="/studio">
          Back to the studio
        </Link>
      </header>

      <ItemEditorForm />
    </section>
  );
}
