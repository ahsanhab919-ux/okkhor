import {
  compareItemsByPublishedDesc,
  getItemCursor,
  isItemAfterCursor,
} from "@/src/modules/content/domain/content-pagination";
import type { ContentRepository, ContentStore } from "@/src/modules/content/domain/content-types";

declare global {
  var __okkhorContentStore: ContentStore | undefined;
  var __okkhorMemoryContentRepository: ContentRepository | undefined;
}

function createStore(): ContentStore {
  return {
    items: new Map(),
  };
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
    async getPublishedItemById(id) {
      const item = getContentStore().items.get(id);

      return item && item.status === "published" ? item : undefined;
    },
    async createItem(item) {
      getContentStore().items.set(item.id, item);
    },
    async updateItem(item) {
      getContentStore().items.set(item.id, item);
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
