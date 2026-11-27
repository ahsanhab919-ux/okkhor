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
  createdAt: string;
  updatedAt: string;
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
  getPublishedItemById(id: string): Promise<ResearchItem | undefined>;
  createItem(item: ResearchItem): Promise<void>;
  updateItem(item: ResearchItem): Promise<void>;
};

export type ContentStore = {
  items: Map<string, ResearchItem>;
};
