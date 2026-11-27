import {
  decodeContentCursor,
  encodeContentCursor,
  getPublishedItem,
  listPublishedItems,
} from "@/src/modules/content/application/content-service";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";

function publishedItem(id: string, publishedAt: string): ResearchItem {
  return {
    id,
    title: `Title ${id}`,
    abstract: "Abstract",
    summaryBn: "সারসংক্ষেপ",
    sourceLanguage: "en",
    tags: [],
    status: "published",
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
  };
}

describe("content service", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("round-trips a cursor through encode and decode", () => {
    const cursor = { publishedAt: "2026-01-01T00:00:00.000Z", id: "abc" };

    expect(decodeContentCursor(encodeContentCursor(cursor))).toEqual(cursor);
  });

  it("rejects a malformed cursor", () => {
    const noSeparator = Buffer.from("nopipe", "utf8").toString("base64url");

    expect(() => decodeContentCursor(noSeparator)).toThrow(ContentError);
  });

  it("returns an encoded nextCursor for paged reads", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(publishedItem("a", "2026-01-01T00:00:00.000Z"));
    await repository.createItem(publishedItem("b", "2026-02-01T00:00:00.000Z"));

    const page = await listPublishedItems({ limit: 1 });

    expect(page.items.map((item) => item.id)).toEqual(["b"]);
    expect(page.nextCursor).toBeTypeOf("string");
    expect(decodeContentCursor(String(page.nextCursor))).toEqual({
      publishedAt: "2026-02-01T00:00:00.000Z",
      id: "b",
    });
  });

  it("throws a not-found content error for unknown published ids", async () => {
    await expect(getPublishedItem("missing")).rejects.toMatchObject({
      code: "CONTENT_ITEM_NOT_FOUND",
      status: 404,
    });
  });
});
