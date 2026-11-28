/** The two corpora a search spans: published research items and community threads. */
export type SearchKind = "research" | "thread";

export type SearchSort = "relevance" | "newest";

/**
 * The repository-level filter. Tokens are lower-cased, de-duplicated query terms that must
 * **all** appear in a document (an AND-of-tokens substring match). `tags` narrows to research
 * items and `category` to threads; `authorId` narrows both.
 */
export type SearchQuery = {
  tokens: string[];
  kind?: SearchKind;
  tags?: string[];
  category?: string;
  authorId?: string;
  limit: number;
};

/**
 * The application-level input: the raw query plus the user-facing filters. `kind` is the
 * already-narrowed domain kind (an `all` selection is normalized to `undefined` before this is
 * built), and the author filter is an id.
 */
export type SearchCriteria = {
  query: string;
  kind?: SearchKind;
  tag?: string;
  category?: string;
  author?: string;
  sort: SearchSort;
  limit: number;
};

/**
 * A normalized, source-agnostic row produced by the repository. For a research item, `body` is
 * the abstract plus the Bangla summary and `tags` are the item's tags; for a thread, `body` is
 * the thread body and `tags` is `[category]`.
 */
export type SearchDocument = {
  kind: SearchKind;
  id: string;
  title: string;
  body: string;
  tags: string[];
  authorId?: string;
  createdAt: string;
};

/** A ranked result, ready to render. `href` and `excerpt` are derived in the application layer. */
export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  authorId?: string;
  createdAt: string;
  href: string;
  score: number;
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
};

export type SearchRepository = {
  searchDocuments(query: SearchQuery): Promise<SearchDocument[]>;
};
