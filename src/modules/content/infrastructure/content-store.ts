import {
  compareItemsByPublishedDesc,
  getItemCursor,
  isItemAfterCursor,
} from "@/src/modules/content/domain/content-pagination";
import type { ContentRepository, ContentStore, ResearchItem, TagCount } from "@/src/modules/content/domain/content-types";

declare global {
  var __okkhorContentStore: ContentStore | undefined;
  var __okkhorMemoryContentRepository: ContentRepository | undefined;
}

function createStore(): ContentStore {
  return {
    items: new Map(),
  };
}

/** Orders the authoring view by last edit, newest first, with `id` breaking ties. */
function compareItemsByUpdatedDesc(left: ResearchItem, right: ResearchItem): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

/** Orders topics by popularity, then by tag ascending, matching the SQL `order by count desc, tag asc`. */
function compareTagCounts(left: TagCount, right: TagCount): number {
  if (left.count !== right.count) {
    return right.count - left.count;
  }

  return left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0;
}

function createMemoryContentRepository(): ContentRepository {
  return {
    async listPublishedItems({ limit, cursor }) {
      const published = Array.from(getContentStore().items.values())
        .filter((item) => item.status === "published")
        .sort(compareItemsByPublishedDesc);
      const remaining = cursor ? published.filter((item) => isItemAfterCursor(item, cursor)) : published;
      const items = remaining.slice(0, limit);
      const last = items[items.length - 1];

      return {
        items,
        nextCursor: remaining.length > limit && last ? getItemCursor(last) : undefined,
      };
    },
    async listItems() {
      return Array.from(getContentStore().items.values()).sort(compareItemsByUpdatedDesc);
    },
    async getPublishedItemById(id) {
      const item = getContentStore().items.get(id);

      return item && item.status === "published" ? item : undefined;
    },
    async getPublishedItemsByIds(ids) {
      return ids.flatMap((id) => {
        const item = getContentStore().items.get(id);

        return item && item.status === "published" ? [item] : [];
      });
    },
    async listPublishedItemsByAuthor(authorId, { limit }) {
      return Array.from(getContentStore().items.values())
        .filter((item) => item.status === "published" && item.authorId === authorId)
        .sort(compareItemsByPublishedDesc)
        .slice(0, limit);
    },
    async listDistinctPublishedTags() {
      const counts = new Map<string, number>();

      for (const item of getContentStore().items.values()) {
        if (item.status !== "published") {
          continue;
        }

        for (const tag of item.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }

      return Array.from(counts, ([tag, count]): TagCount => ({ tag, count })).sort(compareTagCounts);
    },
    async listPublishedItemsByTag(tag, { limit }) {
      return Array.from(getContentStore().items.values())
        .filter((item) => item.status === "published" && item.tags.includes(tag))
        .sort(compareItemsByPublishedDesc)
        .slice(0, limit);
    },
    async getItemById(id) {
      return getContentStore().items.get(id);
    },
    async createItem(item) {
      getContentStore().items.set(item.id, item);
    },
    async updateItemIfUnchanged(item, expectedUpdatedAt) {
      const existing = getContentStore().items.get(item.id);

      if (!existing || existing.updatedAt !== expectedUpdatedAt) {
        return false;
      }

      getContentStore().items.set(item.id, item);

      return true;
    },
  };
}

export function getContentStore(): ContentStore {
  if (!globalThis.__okkhorContentStore) {
    globalThis.__okkhorContentStore = createStore();
  }

  return globalThis.__okkhorContentStore;
}

export function getMemoryContentRepository(): ContentRepository {
  if (!globalThis.__okkhorMemoryContentRepository) {
    globalThis.__okkhorMemoryContentRepository = createMemoryContentRepository();
  }

  return globalThis.__okkhorMemoryContentRepository;
}

export function resetContentStoreForTesting() {
  globalThis.__okkhorContentStore = createStore();
  globalThis.__okkhorMemoryContentRepository = createMemoryContentRepository();
}
