import { vi } from "vitest";

import {
  createContentItem,
  getContentItem,
  listContentItems,
  updateContentItem,
} from "@/src/modules/content/application/content-service";
import { canAuthor } from "@/src/modules/content/domain/content-authorization";
import { createItemSchema, updateItemSchema } from "@/src/modules/content/domain/content-schemas";
import type { ContentAuthor, ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";

const scholar: ContentAuthor = { id: "user-scholar", roles: ["scholar"] };
const learner: ContentAuthor = { id: "user-learner", roles: ["learner"] };

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

describe("content input schemas", () => {
  it("applies defaults for a minimal create payload", () => {
    const parsed = createItemSchema.parse({ title: "T", abstract: "A", summaryBn: "S" });

    expect(parsed).toMatchObject({ sourceLanguage: "en", tags: [], status: "draft" });
  });

  it("rejects an empty title", () => {
    const result = createItemSchema.safeParse({ title: "", abstract: "A", summaryBn: "S" });

    expect(result.success).toBe(false);
  });

  it("accepts a partial update and preserves the concurrency token", () => {
    const parsed = updateItemSchema.parse({ title: "Only the title", updatedAt: "2026-01-01T00:00:00.000Z" });

    expect(parsed).toEqual({ title: "Only the title", updatedAt: "2026-01-01T00:00:00.000Z" });
  });
});

describe("canAuthor", () => {
  it("allows scholars and admins and denies learners or nobody", () => {
    expect(canAuthor(["scholar"])).toBe(true);
    expect(canAuthor(["admin"])).toBe(true);
    expect(canAuthor(["learner"])).toBe(false);
    expect(canAuthor([])).toBe(false);
  });
});

describe("content authoring service", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("stamps authorship, timestamps, and a draft status on create", async () => {
    const item = await createContentItem(scholar, { title: "T", abstract: "A", summaryBn: "S" });

    expect(item.status).toBe("draft");
    expect(item.authorId).toBe(scholar.id);
    expect(item.updatedBy).toBe(scholar.id);
    expect(item.publishedAt).toBeUndefined();
    expect(item.createdAt).toBe(item.updatedAt);
  });

  it("stamps publishedAt when creating an item that is already published", async () => {
    const item = await createContentItem(scholar, {
      title: "T",
      abstract: "A",
      summaryBn: "S",
      status: "published",
    });

    expect(item.publishedAt).toBeTruthy();
  });

  it("denies learners with a 403 content error", async () => {
    await expect(createContentItem(learner, { title: "T", abstract: "A", summaryBn: "S" })).rejects.toMatchObject({
      code: "CONTENT_FORBIDDEN",
      status: 403,
    });
  });

  it("rejects an invalid create payload with a 400 content error", async () => {
    await expect(createContentItem(scholar, { title: "", abstract: "A", summaryBn: "S" })).rejects.toMatchObject({
      code: "CONTENT_VALIDATION_FAILED",
      status: 400,
    });
  });

  it("publishes an item on update and stamps publishedAt once", async () => {
    const created = await createContentItem(scholar, { title: "T", abstract: "A", summaryBn: "S" });

    const published = await updateContentItem(scholar, created.id, { status: "published" });

    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    const republished = await updateContentItem(scholar, created.id, { title: "T2", status: "published" });

    expect(republished.publishedAt).toBe(published.publishedAt);
  });

  it("returns 404 for an unknown id", async () => {
    await expect(updateContentItem(scholar, "missing", { title: "T" })).rejects.toMatchObject({
      code: "CONTENT_ITEM_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects a stale write with a 409 conflict", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));

    try {
      const created = await createContentItem(scholar, { title: "T", abstract: "A", summaryBn: "S" });

      vi.setSystemTime(new Date("2026-05-01T00:00:10.000Z"));
      const edited = await updateContentItem(scholar, created.id, { title: "First edit", updatedAt: created.updatedAt });

      expect(edited.updatedAt).not.toBe(created.updatedAt);

      vi.setSystemTime(new Date("2026-05-01T00:00:20.000Z"));

      await expect(
        updateContentItem(scholar, created.id, { title: "Stale edit", updatedAt: created.updatedAt }),
      ).rejects.toMatchObject({ code: "CONTENT_CONFLICT", status: 409 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists items regardless of status through the authoring read path", async () => {
    await createContentItem(scholar, { title: "Draft", abstract: "A", summaryBn: "S" });

    const items = await listContentItems();

    expect(items).toHaveLength(1);
    expect(await getContentItem(items[0].id)).toMatchObject({ title: "Draft", status: "draft" });
  });
});

describe("memory content repository authoring surface", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("returns drafts by id but hides missing ids", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "draft", status: "draft" }));

    expect((await repository.getItemById("draft"))?.id).toBe("draft");
    expect(await repository.getItemById("missing")).toBeUndefined();
  });

  it("orders the authoring list by last edit, newest first", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "b", updatedAt: "2026-03-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "c", updatedAt: "2026-02-01T00:00:00.000Z" }));

    expect((await repository.listItems()).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("writes only when the stored updatedAt still matches", async () => {
    const repository = getMemoryContentRepository();
    await repository.createItem(buildItem({ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const next = buildItem({ id: "a", title: "Edited", updatedAt: "2026-01-02T00:00:00.000Z" });

    expect(await repository.updateItemIfUnchanged(next, "2026-01-03T00:00:00.000Z")).toBe(false);

    expect(await repository.updateItemIfUnchanged(next, "2026-01-01T00:00:00.000Z")).toBe(true);
    expect((await repository.getItemById("a"))?.title).toBe("Edited");
  });
});
