import React from "react";

import { getPublishedItemsByIds } from "@/src/modules/content/application/content-service";
import { listSavedItems } from "@/src/modules/library/application/library-service";
import { LibraryList, type LibraryEntry } from "@/src/modules/library/ui/library-list";

import { getLibraryViewer } from "../library-session";

export const dynamic = "force-dynamic";

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
    <section className="content-band">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Reading List</p>
          <h1>My Library</h1>
        </div>
        <p>Everything you saved, newest first. Items that are no longer published drop off the list.</p>
      </div>

      <LibraryList entries={entries} />
    </section>
  );
}
