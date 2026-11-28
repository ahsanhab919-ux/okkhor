import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_LIBRARY_PAGE_SIZE,
  isItemSaved,
  listSavedItems,
  parseSaveItemInput,
  removeSavedItem,
  saveItem,
} from "@/src/modules/library/application/library-service";
import { LibraryError } from "@/src/modules/library/domain/library-errors";
import { saveItemSchema } from "@/src/modules/library/domain/library-schemas";
import type { LibraryActor } from "@/src/modules/library/domain/library-types";
import {
  getMemoryLibraryRepository,
  resetLibraryStoreForTesting,
} from "@/src/modules/library/infrastructure/library-store";

const member: LibraryActor = { id: "u-member", roles: ["learner"] };
const other: LibraryActor = { id: "u-other", roles: ["scholar"] };

describe("library domain rules", () => {
  it("requires a non-empty item id", () => {
    expect(saveItemSchema.parse({ itemId: "  item-1  " }).itemId).toBe("item-1");
    expect(() => saveItemSchema.parse({ itemId: "" })).toThrow();
    expect(() => saveItemSchema.parse({ itemId: "x".repeat(201) })).toThrow();
    expect(() => saveItemSchema.parse({})).toThrow();
  });

  it("converts a schema failure into a 400 LIBRARY_VALIDATION_FAILED", () => {
    expect(() => parseSaveItemInput({ itemId: "" })).toThrow(LibraryError);
    expect(() => parseSaveItemInput({ itemId: "" })).toThrow(
      expect.objectContaining({ code: "LIBRARY_VALIDATION_FAILED", status: 400 }),
    );
  });
});

describe("library service", () => {
  beforeEach(() => {
    resetLibraryStoreForTesting();
  });

  it("saves an item idempotently", async () => {
    const first = await saveItem(member, { itemId: "item-1" });
    const second = await saveItem(member, { itemId: "item-1" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.item).toEqual(first.item);

    expect(await listSavedItems(member)).toHaveLength(1);
  });

  it("lists saves newest-saved first, tie-broken by item id", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      await saveItem(member, { itemId: "b" });
      await saveItem(member, { itemId: "a" });
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
      await saveItem(member, { itemId: "c" });

      const saves = await listSavedItems(member);

      expect(saves.map((save) => save.itemId)).toEqual(["c", "b", "a"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("scopes a library to the acting member", async () => {
    await saveItem(member, { itemId: "item-1" });
    await saveItem(other, { itemId: "item-2" });

    expect((await listSavedItems(member)).map((save) => save.itemId)).toEqual(["item-1"]);
    expect(await isItemSaved(other, "item-1")).toBe(false);
  });

  it("caps the list at the page size", async () => {
    for (let index = 0; index < MAX_LIBRARY_PAGE_SIZE + 5; index += 1) {
      await saveItem(member, { itemId: `item-${index}` });
    }

    expect(await listSavedItems(member, { limit: 999 })).toHaveLength(MAX_LIBRARY_PAGE_SIZE);
  });

  it("reports false when removing a save that does not exist", async () => {
    expect(await removeSavedItem(member, "missing")).toBe(false);

    await saveItem(member, { itemId: "item-1" });

    expect(await removeSavedItem(member, "item-1")).toBe(true);
    expect(await isItemSaved(member, "item-1")).toBe(false);
  });
});

describe("library memory repository", () => {
  beforeEach(() => {
    resetLibraryStoreForTesting();
  });

  it("upserts on the composite key and truncates to the limit", async () => {
    const repository = getMemoryLibraryRepository();

    const stored = await repository.saveItem({
      userId: "u-1",
      itemId: "i-1",
      savedAt: "2026-01-01T00:00:00.000Z",
    });
    const again = await repository.saveItem({
      userId: "u-1",
      itemId: "i-1",
      savedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(stored.savedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(again.savedAt).toBe("2026-01-01T00:00:00.000Z");

    await repository.saveItem({ userId: "u-1", itemId: "i-2", savedAt: "2026-03-01T00:00:00.000Z" });

    const page = await repository.listSavedItems("u-1", { limit: 1 });

    expect(page.map((save) => save.itemId)).toEqual(["i-2"]);
  });
});
