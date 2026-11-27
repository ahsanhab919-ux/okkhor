import type { ContentCursor, ResearchItem } from "@/src/modules/content/domain/content-types";

function publishedKey(item: ResearchItem) {
  return item.publishedAt ?? "";
}

export function getItemCursor(item: ResearchItem): ContentCursor {
  return { publishedAt: publishedKey(item), id: item.id };
}

/**
 * Orders published items newest-first. `publishedAt` is an ISO-8601 UTC string, so a
 * lexicographic comparison is chronological; `id` breaks ties deterministically.
 */
export function compareItemsByPublishedDesc(left: ResearchItem, right: ResearchItem): number {
  const leftPublished = publishedKey(left);
  const rightPublished = publishedKey(right);

  if (leftPublished !== rightPublished) {
    return leftPublished < rightPublished ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

export function isItemAfterCursor(item: ResearchItem, cursor: ContentCursor): boolean {
  const itemPublished = publishedKey(item);

  if (itemPublished !== cursor.publishedAt) {
    return itemPublished < cursor.publishedAt;
  }

  return item.id < cursor.id;
}
