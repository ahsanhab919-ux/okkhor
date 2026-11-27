import Link from "next/link";
import React from "react";

import { ItemEditorForm } from "@/src/modules/content/ui/item-editor-form";

export const dynamic = "force-dynamic";

export default function StudioNewItemPage() {
  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Authoring</p>
          <h1>New research item</h1>
        </div>
        <Link className="inline-link" href="/studio">
          Back to the studio
        </Link>
      </div>

      <ItemEditorForm />
    </section>
  );
}
