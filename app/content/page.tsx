import type { Metadata } from "next";
import React from "react";

import { listPublishedItems } from "@/src/modules/content/application/content-service";
import { ContentItemList } from "@/src/modules/content/ui/content-views";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { PublicTopNav } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Archive | Okkhor",
  description: "Read Bangla summaries of research items in the Okkhor archive.",
};

export default async function ContentListPage() {
  const { items } = await listPublishedItems({ limit: 20 });

  return (
    <div className="marketing-shell">
      <PublicTopNav items={publicNavItems} />

      <main className="page-shell page-shell--wide">
        <section className="content-band">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Research Comprehension</p>
              <h1>Research Archive</h1>
            </div>
            <p>
              Every item pairs a source-language abstract with a Bangla summary, so research is understandable without
              translation tools.
            </p>
          </div>

          <ContentItemList items={items} />
        </section>
      </main>
    </div>
  );
}
