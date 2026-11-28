import type { LibraryRepository, LibraryStore, SavedItem } from "@/src/modules/library/domain/library-types";

declare global {
  var __okkhorLibraryStore: LibraryStore | undefined;
  var __okkhorMemoryLibraryRepository: LibraryRepository | undefined;
}

function storeKey(userId: string, itemId: string) {
  return `${userId}:${itemId}`;
}

function createStore(): LibraryStore {
  return {
    saves: new Map(),
  };
}

/** Orders saves by `savedAt` descending, then `itemId` descending. */
function compareSavesBySavedAtDesc(left: SavedItem, right: SavedItem): number {
  if (left.savedAt !== right.savedAt) {
    return left.savedAt < right.savedAt ? 1 : -1;
  }

  if (left.itemId === right.itemId) {
    return 0;
  }

  return left.itemId < right.itemId ? 1 : -1;
}

function createMemoryLibraryRepository(): LibraryRepository {
  return {
    async listSavedItems(userId, { limit }) {
      return Array.from(getLibraryStore().saves.values())
        .filter((save) => save.userId === userId)
        .sort(compareSavesBySavedAtDesc)
        .slice(0, limit);
    },
    async isItemSaved(userId, itemId) {
      return getLibraryStore().saves.has(storeKey(userId, itemId));
    },
    async saveItem(item) {
      const key = storeKey(item.userId, item.itemId);
      const existing = getLibraryStore().saves.get(key);

      if (existing) {
        return existing;
      }

      getLibraryStore().saves.set(key, item);

      return item;
    },
    async removeSavedItem(userId, itemId) {
      return getLibraryStore().saves.delete(storeKey(userId, itemId));
    },
  };
}

export function getLibraryStore(): LibraryStore {
  if (!globalThis.__okkhorLibraryStore) {
    globalThis.__okkhorLibraryStore = createStore();
  }

  return globalThis.__okkhorLibraryStore;
}

export function getMemoryLibraryRepository(): LibraryRepository {
  if (!globalThis.__okkhorMemoryLibraryRepository) {
    globalThis.__okkhorMemoryLibraryRepository = createMemoryLibraryRepository();
  }

  return globalThis.__okkhorMemoryLibraryRepository;
}

export function resetLibraryStoreForTesting() {
  globalThis.__okkhorLibraryStore = createStore();
  globalThis.__okkhorMemoryLibraryRepository = createMemoryLibraryRepository();
}
