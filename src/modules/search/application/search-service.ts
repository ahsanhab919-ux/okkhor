import { ZodError } from "zod";

import { SearchError } from "@/src/modules/search/domain/search-errors";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  searchQuerySchema,
  type SearchQueryInput,
  type SearchQueryPayload,
  tokenizeQuery,
} from "@/src/modules/search/domain/search-schemas";
import type {
  SearchCriteria,
  SearchDocument,
  SearchHit,
  SearchResult,
} from "@/src/modules/search/domain/search-types";
import { getSearchRepository } from "@/src/modules/search/infrastructure/search-repository";

export { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT };

/** The candidate cap applied before scoring, measured in normalized documents. */
export const MAX_SEARCH_CANDIDATES = 200;

const EXCERPT_LENGTH = 180;

function parseSearchSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Search request failed validation.";
      throw new SearchError(detail, "SEARCH_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

/** Clamps `limit` to `[1, MAX_SEARCH_LIMIT]`, defaulting to `DEFAULT_SEARCH_LIMIT` when absent. */
export function normalizeSearchLimit(limit?: number | string): number {
  const parsed = typeof limit === "string" ? Number.parseInt(limit, 10) : (limit ?? Number.NaN);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_SEARCH_LIMIT);
}

/**
 * The deterministic relevance score: per token `+3` when it appears in the title, `+2` when it
 * appears in a tag/category, and `+1` when it appears only in the body — summed over tokens.
 */
export function scoreDocument(document: SearchDocument, tokens: string[]): number {
  const title = document.title.toLowerCase();
  const tags = document.tags.map((tag) => tag.toLowerCase());
  const body = document.body.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (title.includes(token)) {
      score += 3;
    } else if (tags.some((tag) => tag.includes(token))) {
      score += 2;
    } else if (body.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function documentHref(document: SearchDocument): string {
  return document.kind === "research" ? `/content/${document.id}` : `/community/${document.id}`;
}

function buildExcerpt(body: string): string {
  const trimmed = body.trim();

  return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH).trimEnd()}…` : trimmed;
}

function compareByIdDesc(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

function compareByRelevance(left: SearchHit, right: SearchHit): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return compareByIdDesc(left, right);
}

function toCriteria(payload: SearchQueryPayload, limit: number): SearchCriteria {
  return {
    query: payload.q,
    kind: payload.kind === "all" ? undefined : payload.kind,
    tag: payload.tag,
    category: payload.category,
    author: payload.author,
    sort: payload.sort,
    limit,
  };
}

function toHit(document: SearchDocument, tokens: string[]): SearchHit {
  return {
    kind: document.kind,
    id: document.id,
    title: document.title,
    excerpt: buildExcerpt(document.body),
    tags: document.tags,
    authorId: document.authorId,
    createdAt: document.createdAt,
    href: documentHref(document),
    score: scoreDocument(document, tokens),
  };
}

/**
 * The unified search use case: validate, tokenize, read normalized documents from the
 * repository, score and rank them, and return one page. `total` is the pre-truncation match
 * count (capped by the repository's candidate limit).
 */
export async function search(input: SearchQueryInput = {}): Promise<SearchResult> {
  const payload = parseSearchSchema(searchQuerySchema, input);
  const criteria = toCriteria(payload, normalizeSearchLimit(input.limit));
  const tokens = tokenizeQuery(criteria.query);

  const documents = await getSearchRepository().searchDocuments({
    tokens,
    kind: criteria.kind,
    tags: criteria.tag ? [criteria.tag] : undefined,
    category: criteria.category,
    authorId: criteria.author,
    limit: MAX_SEARCH_CANDIDATES,
  });

  const hits = documents.map((document) => toHit(document, tokens));

  hits.sort(criteria.sort === "newest" ? compareByIdDesc : compareByRelevance);

  return { hits: hits.slice(0, criteria.limit), total: hits.length };
}
