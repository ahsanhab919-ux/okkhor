import { beforeEach, describe, expect, it } from "vitest";

import { listThreadsByAuthor } from "@/src/modules/community/application/community-service";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";
import { listPublishedItemsByAuthor } from "@/src/modules/content/application/content-service";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { getPublicProfile, registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { countSavedItems, saveItem } from "@/src/modules/library/application/library-service";
import type { LibraryActor } from "@/src/modules/library/domain/library-types";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";

function buildItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Sediment cores reveal rapid shifts",
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags: [],
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getPublicProfile", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
  });

  it("returns the public identity view and never the private fields", async () => {
    const { user } = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner", "scholar"],
    });

    const profile = await getPublicProfile(user.id);

    expect(profile).toEqual({
      id: user.id,
      displayName: "Ahsan Habib",
      roles: ["learner", "scholar"],
      createdAt: user.createdAt,
    });
    expect(profile).not.toHaveProperty("phoneNumber");
    expect(profile).not.toHaveProperty("passwordHash");
    expect(profile).not.toHaveProperty("passwordUpdatedAt");
  });

  it("returns undefined for an unknown id", async () => {
    expect(await getPublicProfile("missing")).toBeUndefined();
  });
});

describe("listPublishedItemsByAuthor", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("returns only the author's published items, newest-published first, capped", async () => {
    const repository = getMemoryContentRepository();

    await repository.createItem(buildItem({ id: "a", authorId: "u-1", publishedAt: "2026-01-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "b", authorId: "u-1", publishedAt: "2026-02-01T00:00:00.000Z" }));
    await repository.createItem(buildItem({ id: "draft", authorId: "u-1", status: "draft" }));
    await repository.createItem(buildItem({ id: "other", authorId: "u-2", publishedAt: "2026-03-01T00:00:00.000Z" }));

    expect((await listPublishedItemsByAuthor("u-1")).map((item) => item.id)).toEqual(["b", "a"]);
    expect((await listPublishedItemsByAuthor("u-1", { limit: 1 })).map((item) => item.id)).toEqual(["b"]);
    expect(await listPublishedItemsByAuthor("missing")).toEqual([]);
  });
});

describe("listThreadsByAuthor", () => {
  beforeEach(() => {
    resetCommunityStoreForTesting();
  });

  it("returns only the author's threads, newest first, with derived reply counts", async () => {
    const repository = getMemoryCommunityRepository();

    await repository.createThread({
      id: "older",
      authorId: "u-1",
      title: "Older",
      body: "b",
      category: "General",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await repository.createThread({
      id: "newer",
      authorId: "u-1",
      title: "Newer",
      body: "b",
      category: "General",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await repository.createThread({
      id: "other",
      authorId: "u-2",
      title: "Elsewhere",
      body: "b",
      category: "General",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await repository.createReply({
      id: "r1",
      threadId: "newer",
      authorId: "u-2",
      body: "hi",
      createdAt: "2026-02-02T00:00:00.000Z",
      moderationState: "visible",
    });

    const threads = await listThreadsByAuthor("u-1");

    expect(threads.map((thread) => thread.id)).toEqual(["newer", "older"]);
    expect(threads[0].replyCount).toBe(1);
    expect(threads[1].replyCount).toBe(0);
    expect(await listThreadsByAuthor("u-1", { limit: 1 })).toHaveLength(1);
    expect(await listThreadsByAuthor("missing")).toEqual([]);
  });
});

describe("countSavedItems", () => {
  beforeEach(() => {
    resetLibraryStoreForTesting();
  });

  it("counts only the acting member's saves", async () => {
    const member: LibraryActor = { id: "u-1", roles: ["learner"] };
    const other: LibraryActor = { id: "u-2", roles: ["learner"] };

    await saveItem(member, { itemId: "a" });
    await saveItem(member, { itemId: "b" });
    await saveItem(other, { itemId: "c" });

    expect(await countSavedItems(member)).toBe(2);
    expect(await countSavedItems({ id: "missing", roles: [] })).toBe(0);
  });
});
