import { getMemoryCommunityRepository } from "@/src/modules/community/infrastructure/community-store";
import type { CommunityThread } from "@/src/modules/community/domain/community-types";
import { getMemoryContentRepository } from "@/src/modules/content/infrastructure/content-store";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import type { SearchDocument, SearchQuery, SearchRepository } from "@/src/modules/search/domain/search-types";

declare global {
  var __okkhorMemorySearchRepository: SearchRepository | undefined;
}

function toResearchDocument(item: ResearchItem): SearchDocument {
  return {
    kind: "research",
    id: item.id,
    title: item.title,
    body: `${item.abstract} ${item.summaryBn}`.trim(),
    tags: item.tags,
    authorId: item.authorId,
    createdAt: item.createdAt,
  };
}

function toThreadDocument(thread: CommunityThread): SearchDocument {
  return {
    kind: "thread",
    id: thread.id,
    title: thread.title,
    body: thread.body,
    tags: [thread.category],
    authorId: thread.authorId,
    createdAt: thread.createdAt,
  };
}

/** Every token must appear, case-insensitively, in the title, body, or tag/category text. */
function matchesTokens(document: SearchDocument, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }

  const haystack = `${document.title}\n${document.body}\n${document.tags.join(" ")}`.toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

/**
 * Applies the kind, author, and tag/category filters. A `tags` filter restricts to research
 * items and a `category` filter restricts to threads, matching the source-specific meaning of
 * each filter.
 */
function matchesFilters(document: SearchDocument, query: SearchQuery): boolean {
  if (query.kind && document.kind !== query.kind) {
    return false;
  }

  if (query.authorId && document.authorId !== query.authorId) {
    return false;
  }

  if (query.tags && query.tags.length > 0) {
    if (document.kind !== "research") {
      return false;
    }

    const tags = document.tags.map((tag) => tag.toLowerCase());

    if (!query.tags.some((tag) => tags.includes(tag.toLowerCase()))) {
      return false;
    }
  }

  if (query.category) {
    if (document.kind !== "thread") {
      return false;
    }

    const category = query.category.toLowerCase();

    if (!document.tags.some((tag) => tag.toLowerCase() === category)) {
      return false;
    }
  }

  return true;
}

function createMemorySearchRepository(): SearchRepository {
  return {
    async searchDocuments(query) {
      const items = await getMemoryContentRepository().listItems();
      const { threads } = await getMemoryCommunityRepository().listThreads({ limit: query.limit });

      const documents: SearchDocument[] = [
        ...items.filter((item) => item.status === "published").map(toResearchDocument),
        ...threads.map(toThreadDocument),
      ];

      return documents
        .filter((document) => matchesFilters(document, query) && matchesTokens(document, query.tokens))
        .slice(0, query.limit);
    },
  };
}

export function getMemorySearchRepository(): SearchRepository {
  if (!globalThis.__okkhorMemorySearchRepository) {
    globalThis.__okkhorMemorySearchRepository = createMemorySearchRepository();
  }

  return globalThis.__okkhorMemorySearchRepository;
}
