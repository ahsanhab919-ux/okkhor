import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";

function buildItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Title",
    abstract: "Abstract",
    summaryBn: "সারসংক্ষেপ",
    sourceLanguage: "en",
    tags: [],
    status: "published",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("memory content repository", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("lists only published items, newest first", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "a", publishedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "c", publishedAt: "2026-03-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "b", publishedAt: "2026-02-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "draft", status: "draft" }));

    const result = await repository.listPublishedItems({ limit: 10 });

    expect(result.items.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("paginates with a keyset cursor", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "a", publishedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "b", publishedAt: "2026-02-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "c", publishedAt: "2026-03-01T00:00:00.000Z" }));

    const firstPage = await repository.listPublishedItems({ limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["c", "b"]);
    expect(firstPage.nextCursor).toEqual({ publishedAt: "2026-02-01T00:00:00.000Z", id: "b" });

    const secondPage = await repository.listPublishedItems({ limit: 2, cursor: firstPage.nextCursor });

    expect(secondPage.items.map((item) => item.id)).toEqual(["a"]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("returns published items by id and hides drafts or missing items", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "published", publishedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "draft", status: "draft" }));

    expect((await repository.getPublishedItemById("published"))?.id).toBe("published");
    expect(await repository.getPublishedItemById("draft")).toBeUndefined();
    expect(await repository.getPublishedItemById("missing")).toBeUndefined();
  });

  it("counts published tags only, ordered by count then tag", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(
      buildItem({ id: "a", tags: ["ai", "climate"], publishedAt: "2026-01-01T00:00:00.000Z" }),
    );
    await repository.createItem(buildItem({ id: "b", tags: ["ai"], publishedAt: "2026-02-01T00:00:00.000Z" }));
    // A draft's tags are never counted.
    await repository.createItem(buildItem({ id: "draft", status: "draft", tags: ["ai", "hidden"] }));

    expect(await repository.listDistinctPublishedTags()).toEqual([
      { tag: "ai", count: 2 },
      { tag: "climate", count: 1 },
    ]);
  });

  it("orders equal-count tags alphabetically", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(
      buildItem({ id: "a", tags: ["zebra", "alpha"], publishedAt: "2026-01-01T00:00:00.000Z" }),
    );

    expect((await repository.listDistinctPublishedTags()).map((entry) => entry.tag)).toEqual([
      "alpha",
      "zebra",
    ]);
  });

  it("lists published items by exact tag, newest first, capped", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "old", tags: ["ai"], publishedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "new", tags: ["ai"], publishedAt: "2026-03-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "other", tags: ["bio"], publishedAt: "2026-04-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "draft", status: "draft", tags: ["ai"] }));

    expect((await repository.listPublishedItemsByTag("ai", { limit: 10 })).map((item) => item.id)).toEqual([
      "new",
      "old",
    ]);
    expect((await repository.listPublishedItemsByTag("ai", { limit: 1 })).map((item) => item.id)).toEqual([
      "new",
    ]);
    expect(await repository.listPublishedItemsByTag("missing", { limit: 10 })).toEqual([]);
  });
});
