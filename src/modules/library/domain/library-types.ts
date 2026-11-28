import type { UserRole } from "@/src/modules/identity/domain/auth-types";

/**
 * A save relation: a member's saved research item. The `(userId, itemId)` pair is its identity,
 * so a save carries no surrogate id.
 */
export type SavedItem = {
  userId: string;
  itemId: string;
  savedAt: string;
};

/**
 * The acting member, passed into library use cases as plain data. The module treats it as an
 * opaque actor; the app layer resolves it from the identity module.
 */
export type LibraryActor = {
  id: string;
  roles: UserRole[];
};

export type SaveItemInput = {
  itemId: string;
};

export type ListSavedItemsInput = {
  limit?: number;
};

export type ListSavedItemsOptions = {
  limit: number;
};

export type LibraryRepository = {
  /** The member's saves, `savedAt` descending then `itemId` descending, truncated to `limit`. */
  listSavedItems(userId: string, options: ListSavedItemsOptions): Promise<SavedItem[]>;
  /** The exact number of items the member has saved. */
  countSavedItems(userId: string): Promise<number>;
  isItemSaved(userId: string, itemId: string): Promise<boolean>;
  /**
   * Idempotent upsert on `(userId, itemId)`; never duplicates. Returns the save that is stored
   * afterwards — the new one, or the pre-existing save when the item was already saved.
   */
  saveItem(item: SavedItem): Promise<SavedItem>;
  /** Removes the save; returns `true` when a row was removed, `false` when there was nothing to remove. */
  removeSavedItem(userId: string, itemId: string): Promise<boolean>;
};

export type LibraryStore = {
  saves: Map<string, SavedItem>;
};
