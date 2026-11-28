import React from "react";

import { getPublishedItemsByIds } from "@/src/modules/content/application/content-service";
import { listSavedItems } from "@/src/modules/library/application/library-service";
import { LibraryList, type LibraryEntry } from "@/src/modules/library/ui/library-list";

import { getLibraryViewer } from "../library-session";

export const dynamic = "force-dynamic";

/**
 * The library page, aligned to the Stitch "Saved Archives" screen: a breadcrumb hero over the
 * saved-items grid. The library module returns only saves, so clusters, sort tabs and pagination —
 * none of which the domain backs — are deliberately omitted.
 */
export default async function LibraryPage() {
  const viewer = await getLibraryViewer();
  const saves = viewer ? await listSavedItems(viewer.actor, { limit: 20 }) : [];
  const items = await getPublishedItemsByIds(saves.map((save) => save.itemId));
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries: LibraryEntry[] = saves.flatMap((save) => {
    const item = byId.get(save.itemId);

    return item ? [{ item, savedAt: save.savedAt }] : [];
  });

  return (
    <div className="library-page">
      <section className="library-hero">
        <nav aria-label="Breadcrumb" className="library-hero__crumbs">
          <span>Personal</span>
          <span aria-hidden="true">›</span>
          <span className="library-hero__crumb-current">Library</span>
        </nav>
        <h1 className="library-hero__title">My Library</h1>
        <p className="library-hero__lead">
          Everything you saved, newest first. Items that are no longer published drop off the list.
        </p>
        {entries.length > 0 ? (
          <span className="library-hero__count">
            {entries.length} {entries.length === 1 ? "saved item" : "saved items"}
          </span>
        ) : null}
      </section>

      <LibraryList entries={entries} />
    </div>
  );
}
