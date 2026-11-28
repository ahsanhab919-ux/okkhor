import {
  MAX_SEARCH_CANDIDATES,
  normalizeSearchLimit,
  scoreDocument,
  search,
} from "@/src/modules/search/application/search-service";
import { searchQuerySchema, tokenizeQuery } from "@/src/modules/search/domain/search-schemas";
import type { SearchDocument, SearchQuery } from "@/src/modules/search/domain/search-types";
import {
  getMemorySearchRepository,
} from "@/src/modules/search/infrastructure/search-store";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";

type SeedItem = {
  id: string;
  title: string;
  abstract?: string;
  summaryBn?: string;
  tags?: string[];
  status?: "draft" | "published";
  authorId?: string;
  createdAt?: string;
};

async function seedItem(input: SeedItem) {
  const createdAt = input.createdAt ?? "2026-01-01T00:00:00.000Z";

  await getMemoryContentRepository().createItem({
    id: input.id,
    title: input.title,
    abstract: input.abstract ?? "An abstract.",
    summaryBn: input.summaryBn ?? "বাংলা সারাংশ",
    sourceLanguage: "en",
    tags: input.tags ?? [],
    status: input.status ?? "published",
    authorId: input.authorId,
    createdAt,
    updatedAt: createdAt,
  });
}

type SeedThread = {
  id: string;
  title: string;
  body?: string;
  category?: string;
  authorId?: string;
  createdAt?: string;
};

async function seedThread(input: SeedThread) {
  const createdAt = input.createdAt ?? "2026-01-01T00:00:00.000Z";

  await getMemoryCommunityRepository().createThread({
    id: input.id,
    authorId: input.authorId ?? "author-a",
    title: input.title,
    body: input.body ?? "A thread body.",
    category: input.category ?? "General",
    createdAt,
    updatedAt: createdAt,
    moderationState: "visible",
    locked: false,
  });
}

function baseQuery(overrides: Partial<SearchQuery>): SearchQuery {
  return { tokens: [], limit: MAX_SEARCH_CANDIDATES, ...overrides };
}

describe("search query schema", () => {
  it("requires a non-empty, bounded query and defaults kind and sort", () => {
    const parsed = searchQuerySchema.parse({ q: "  Climate  " });

    expect(parsed.q).toBe("Climate");
    expect(parsed.kind).toBe("all");
    expect(parsed.sort).toBe("relevance");

    expect(() => searchQuerySchema.parse({ q: "" })).toThrow();
    expect(() => searchQuerySchema.parse({ q: "   " })).toThrow();
    expect(() => searchQuerySchema.parse({})).toThrow();
    expect(() => searchQuerySchema.parse({ q: "a".repeat(121) })).toThrow();
  });

  it("rejects an unknown kind or sort", () => {
    expect(() => searchQuerySchema.parse({ q: "x", kind: "nope" })).toThrow();
    expect(() => searchQuerySchema.parse({ q: "x", sort: "oldest" })).toThrow();
  });
});

describe("tokenizer", () => {
  it("lower-cases, splits on whitespace, trims, and de-duplicates", () => {
    expect(tokenizeQuery("  Climate   climate  RAG ")).toEqual(["climate", "rag"]);
    expect(tokenizeQuery("")).toEqual([]);
  });
});

describe("limit clamp", () => {
  it("defaults invalid limits and clamps over-long ones", () => {
    expect(normalizeSearchLimit(undefined)).toBe(20);
    expect(normalizeSearchLimit("")).toBe(20);
    expect(normalizeSearchLimit("0")).toBe(20);
    expect(normalizeSearchLimit("-3")).toBe(20);
    expect(normalizeSearchLimit("25")).toBe(25);
    expect(normalizeSearchLimit("7.9")).toBe(7);
    expect(normalizeSearchLimit("999")).toBe(50);
  });
});

describe("scoring", () => {
  const document: SearchDocument = {
    kind: "research",
    id: "x",
    title: "Climate adaptation",
    body: "flood resilience in delta regions",
    tags: ["water"],
    authorId: "author-a",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("weights title over tag over body and sums over tokens", () => {
    expect(scoreDocument(document, ["climate"])).toBe(3);
    expect(scoreDocument(document, ["water"])).toBe(2);
    expect(scoreDocument(document, ["resilience"])).toBe(1);
    expect(scoreDocument(document, ["climate", "water", "flood"])).toBe(6);
  });
});

describe("search service", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("merges research and community, ranking by relevance", async () => {
    await seedItem({ id: "i1", title: "Climate adaptation in Bengal", createdAt: "2026-01-01T00:00:00.000Z" });
    await seedThread({
      id: "t1",
      title: "Policy debate",
      body: "a climate policy argument",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const result = await search({ q: "climate" });

    expect(result.total).toBe(2);
    expect(result.hits.map((hit) => hit.id)).toEqual(["i1", "t1"]);
    expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
    expect(result.hits[0].href).toBe("/content/i1");
    expect(result.hits[1].href).toBe("/community/t1");
  });

  it("orders by recency when sort is newest", async () => {
    await seedItem({ id: "i1", title: "Climate adaptation", createdAt: "2026-01-01T00:00:00.000Z" });
    await seedThread({
      id: "t1",
      title: "Policy debate",
      body: "a climate policy argument",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const result = await search({ q: "climate", sort: "newest" });

    expect(result.hits.map((hit) => hit.id)).toEqual(["t1", "i1"]);
  });

  it("truncates to limit while reporting the pre-truncation total", async () => {
    await seedItem({ id: "i1", title: "Climate one", createdAt: "2026-01-01T00:00:00.000Z" });
    await seedItem({ id: "i2", title: "Climate two", createdAt: "2026-01-02T00:00:00.000Z" });

    const result = await search({ q: "climate", limit: 1 });

    expect(result.total).toBe(2);
    expect(result.hits).toHaveLength(1);
  });

  it("throws SEARCH_VALIDATION_FAILED for an empty query", async () => {
    await expect(search({ q: "" })).rejects.toMatchObject({ code: "SEARCH_VALIDATION_FAILED", status: 400 });
  });
});

describe("memory search repository", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("applies the AND-of-tokens rule, status, kind, tag, category, and author filters", async () => {
    await seedItem({
      id: "i1",
      title: "Climate adaptation",
      abstract: "flood resilience",
      tags: ["climate"],
      authorId: "author-a",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await seedItem({
      id: "i3",
      title: "Climate draft",
      tags: ["climate"],
      status: "draft",
      authorId: "author-a",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    await seedThread({
      id: "t1",
      title: "Climate policy",
      body: "a climate debate",
      category: "Policy",
      authorId: "author-a",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const repository = getMemorySearchRepository();

    const all = await repository.searchDocuments(baseQuery({ tokens: ["climate"] }));
    expect(all.map((document) => document.id).sort()).toEqual(["i1", "t1"]);

    const researchOnly = await repository.searchDocuments(baseQuery({ tokens: ["climate"], kind: "research" }));
    expect(researchOnly.map((document) => document.id)).toEqual(["i1"]);

    const threadOnly = await repository.searchDocuments(baseQuery({ tokens: ["debate"], kind: "thread" }));
    expect(threadOnly.map((document) => document.id)).toEqual(["t1"]);

    const byTag = await repository.searchDocuments(baseQuery({ tokens: ["climate"], tags: ["climate"] }));
    expect(byTag.map((document) => document.id)).toEqual(["i1"]);

    const byCategory = await repository.searchDocuments(baseQuery({ tokens: ["climate"], category: "Policy" }));
    expect(byCategory.map((document) => document.id)).toEqual(["t1"]);

    const byAuthor = await repository.searchDocuments(baseQuery({ tokens: ["climate"], authorId: "author-a" }));
    expect(byAuthor.map((document) => document.id).sort()).toEqual(["i1", "t1"]);

    const andTokens = await repository.searchDocuments(baseQuery({ tokens: ["climate", "flood"] }));
    expect(andTokens.map((document) => document.id)).toEqual(["i1"]);

    const missingToken = await repository.searchDocuments(baseQuery({ tokens: ["climate", "xyz"] }));
    expect(missingToken).toEqual([]);
  });

  it("maps a thread's category into its tags and a research item's body", async () => {
    await seedItem({ id: "i1", title: "T", abstract: "alpha", summaryBn: "beta" });
    await seedThread({ id: "t1", title: "S", body: "gamma", category: "History" });

    const repository = getMemorySearchRepository();
    const documents = await repository.searchDocuments(baseQuery({ tokens: [] }));

    const research = documents.find((document) => document.kind === "research");
    const thread = documents.find((document) => document.kind === "thread");

    expect(research?.body).toBe("alpha beta");
    expect(thread?.tags).toEqual(["History"]);
  });
});
