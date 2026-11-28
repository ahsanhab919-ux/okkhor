import type { UserRole } from "@/src/modules/identity/domain/auth-types";

export type ResearchItemStatus = "draft" | "published";

/**
 * A research item paired with its Bangla comprehension summary. The abstract stays
 * in its source language; `summaryBn` is the product value and is always Bangla.
 */
export type ResearchItem = {
  id: string;
  title: string;
  abstract: string;
  summaryBn: string;
  sourceLanguage: string;
  tags: string[];
  status: ResearchItemStatus;
  sourceUrl?: string;
  publishedAt?: string;
  authorId?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The acting user, passed into authoring use cases as plain data. The content module
 * treats it as an opaque actor; the app layer resolves it from the identity module.
 */
export type ContentAuthor = {
  id: string;
  roles: UserRole[];
};

export type CreateItemInput = {
  title: string;
  abstract: string;
  /** Optional to save; a blank summary is filled by the AI on publish. */
  summaryBn?: string;
  sourceLanguage?: string;
  tags?: string[];
  status?: ResearchItemStatus;
  sourceUrl?: string;
};

export type UpdateItemInput = {
  title?: string;
  abstract?: string;
  summaryBn?: string;
  sourceLanguage?: string;
  tags?: string[];
  status?: ResearchItemStatus;
  sourceUrl?: string;
  /** The value the client last read; used for the optimistic-concurrency check. */
  updatedAt?: string;
};

/**
 * Keyset cursor for the published list. Ordering is `publishedAt` descending, then
 * `id` descending, so a cursor is the position of the last item already returned.
 */
export type ContentCursor = {
  publishedAt: string;
  id: string;
};

export type ListPublishedItemsOptions = {
  limit: number;
  cursor?: ContentCursor;
};

export type ListPublishedItemsResult = {
  items: ResearchItem[];
  nextCursor?: ContentCursor;
};

export type ContentRepository = {
  listPublishedItems(options: ListPublishedItemsOptions): Promise<ListPublishedItemsResult>;
  /** All items regardless of status, newest-edited first. The authoring view. */
  listItems(): Promise<ResearchItem[]>;
  getPublishedItemById(id: string): Promise<ResearchItem | undefined>;
  /**
   * Published items for the given ids, in the order requested; ids that do not resolve to a
   * published item are omitted. Used by the composition root to hydrate a saved list.
   */
  getPublishedItemsByIds(ids: string[]): Promise<ResearchItem[]>;
  /** Any item regardless of status. The authoring path. */
  getItemById(id: string): Promise<ResearchItem | undefined>;
  createItem(item: ResearchItem): Promise<void>;
  /**
   * Writes the item only if the stored `updated_at` still equals `expectedUpdatedAt`.
   * Returns `false` when another writer changed the row first.
   */
  updateItemIfUnchanged(item: ResearchItem, expectedUpdatedAt: string): Promise<boolean>;
};

export type ContentStore = {
  items: Map<string, ResearchItem>;
};
