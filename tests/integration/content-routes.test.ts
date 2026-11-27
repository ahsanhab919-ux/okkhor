import { NextRequest } from "next/server";

import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";

import { GET as getItem } from "@/app/api/content/items/[id]/route";
import { GET as listItems } from "@/app/api/content/items/route";

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

function itemContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("content routes", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("lists published items and excludes drafts", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(publishedItem("a", "2026-01-01T00:00:00.000Z"));
    await repository.createItem({
      ...publishedItem("draft", "2026-02-01T00:00:00.000Z"),
      status: "draft",
    });

    const response = await listItems(new NextRequest("http://localhost/api/content/items"));
    const payload = (await response.json()) as { items: { id: string }[] };

    expect(response.status).toBe(200);
    expect(payload.items.map((item) => item.id)).toEqual(["a"]);
  });

  it("returns a single published item", async () => {
    await getMemoryContentRepository().createItem(publishedItem("a", "2026-01-01T00:00:00.000Z"));

    const response = await getItem(new NextRequest("http://localhost/api/content/items/a"), itemContext("a"));
    const payload = (await response.json()) as { item: { id: string } };

    expect(response.status).toBe(200);
    expect(payload.item.id).toBe("a");
  });

  it("returns 404 with the standard error envelope for unknown ids", async () => {
    const response = await getItem(new NextRequest("http://localhost/api/content/items/missing"), itemContext("missing"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("CONTENT_ITEM_NOT_FOUND");
  });

  it("rejects an invalid pagination cursor", async () => {
    const response = await listItems(new NextRequest("http://localhost/api/content/items?cursor=%7Cbad"));
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("CONTENT_INVALID_CURSOR");
  });
});
