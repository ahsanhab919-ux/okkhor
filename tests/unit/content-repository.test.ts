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
});
