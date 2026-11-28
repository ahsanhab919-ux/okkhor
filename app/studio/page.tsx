import Link from "next/link";
import React from "react";

import { listContentItems } from "@/src/modules/content/application/content-service";
import { Icon } from "@/src/modules/experience/ui";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const items = await listContentItems();

  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Authoring</p>
          <h1 className="page-hero__title">Research Studio</h1>
          <p className="page-hero__lead">
            Draft, refine, and publish Bangla research summaries. A draft stays private until you publish it
            to the archive.
          </p>
        </div>
        <Link className="button button--primary" href="/studio/new">
          New item
        </Link>
      </header>

      {items.length === 0 ? (
        <p>No research items yet. Create the first draft to get started.</p>
      ) : (
        <div className="archive-grid">
          {items.map((item) => (
            <article key={item.id} className="archive-card">
              <div className="archive-card__body">
                <div>
                  <span className="pill">{item.status}</span>
                </div>
                <h3>{item.title}</h3>
                <p lang="bn">{item.summaryBn}</p>
                <Link className="inline-link" href={`/studio/${item.id}`}>
                  Edit item
                  <Icon className="icon-sm" name="arrow-right" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
