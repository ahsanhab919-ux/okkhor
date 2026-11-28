import { z } from "zod";

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;
export const MAX_SEARCH_QUERY_LENGTH = 120;

/**
 * The raw `/api/search` query parameters. `limit` is parsed and clamped by the service
 * (`normalizeSearchLimit`) rather than rejected, so out-of-range values never 400.
 */
export type SearchQueryInput = {
  q?: string;
  kind?: string;
  tag?: string;
  category?: string;
  author?: string;
  sort?: string;
  limit?: string | number;
};

/**
 * The validated query payload. `q` is required and bounded; `kind` and `sort` are closed enums
 * that default to `all` and `relevance`. An empty or over-long `q`, or an unknown `kind`/`sort`,
 * fails validation and surfaces as `SEARCH_VALIDATION_FAILED`.
 */
export const searchQuerySchema = z.object({
  q: z
    .string({ message: "A search query is required." })
    .trim()
    .min(1, "A search query is required.")
    .max(MAX_SEARCH_QUERY_LENGTH, "The search query is too long."),
  kind: z.enum(["all", "research", "thread"], { message: "The search kind is not supported." }).default("all"),
  tag: z.string().trim().min(1, "The tag filter is invalid.").max(60, "The tag filter is too long.").optional(),
  category: z
    .string()
    .trim()
    .min(1, "The category filter is invalid.")
    .max(60, "The category filter is too long.")
    .optional(),
  author: z.string().trim().min(1, "The author filter is invalid.").max(64, "The author filter is too long.").optional(),
  sort: z.enum(["relevance", "newest"], { message: "The sort order is not supported." }).default("relevance"),
});

export type SearchQueryPayload = z.infer<typeof searchQuerySchema>;

/**
 * Splits a query into lower-cased, de-duplicated terms. Order is preserved so the token list is
 * deterministic. Multi-word phrases and reordering are intentionally not handled in this slice.
 */
export function tokenizeQuery(query: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const raw of query.toLowerCase().split(/\s+/)) {
    const token = raw.trim();

    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}
