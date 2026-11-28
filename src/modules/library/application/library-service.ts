import { ZodError } from "zod";

import { LibraryError } from "@/src/modules/library/domain/library-errors";
import { saveItemSchema } from "@/src/modules/library/domain/library-schemas";
import type {
  LibraryActor,
  ListSavedItemsInput,
  SaveItemInput,
  SavedItem,
} from "@/src/modules/library/domain/library-types";
import { getLibraryRepository } from "@/src/modules/library/infrastructure/library-repository";

export const DEFAULT_LIBRARY_PAGE_SIZE = 20;
export const MAX_LIBRARY_PAGE_SIZE = 50;

function parseLibrarySchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Library request failed validation.";
      throw new LibraryError(detail, "LIBRARY_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIBRARY_PAGE_SIZE;
  }

  return Math.min(Math.floor(limit), MAX_LIBRARY_PAGE_SIZE);
}

/** Validates a save payload, converting a schema failure into a 400 `LIBRARY_VALIDATION_FAILED`. */
export function parseSaveItemInput(input: unknown): SaveItemInput {
  return parseLibrarySchema(saveItemSchema, input);
}

export type SaveItemResult = {
  item: SavedItem;
  /** `false` when the item was already saved (idempotent re-save). */
  created: boolean;
};

/** The member's saved items, newest-saved first, capped at the page size. */
export async function listSavedItems(
  actor: LibraryActor,
  input: ListSavedItemsInput = {},
): Promise<SavedItem[]> {
  return getLibraryRepository().listSavedItems(actor.id, { limit: normalizeLimit(input.limit) });
}

/** Whether the acting member has saved the item. */
export async function isItemSaved(actor: LibraryActor, itemId: string): Promise<boolean> {
  return getLibraryRepository().isItemSaved(actor.id, itemId);
}

/** The exact number of items the acting member has saved — the profile rollup. */
export async function countSavedItems(actor: LibraryActor): Promise<number> {
  return getLibraryRepository().countSavedItems(actor.id);
}

/**
 * Saves a research item for the acting member. The write is idempotent on `(userId, itemId)`, so a
 * second save succeeds without a duplicate and returns the save that is already stored.
 */
export async function saveItem(actor: LibraryActor, input: SaveItemInput): Promise<SaveItemResult> {
  const parsed = parseSaveItemInput(input);
  const repository = getLibraryRepository();
  const alreadySaved = await repository.isItemSaved(actor.id, parsed.itemId);
  const stored = await repository.saveItem({
    userId: actor.id,
    itemId: parsed.itemId,
    savedAt: new Date().toISOString(),
  });

  return { item: stored, created: !alreadySaved };
}

/** Removes a saved item. Removing a save that does not exist is a no-op that returns `false`. */
export async function removeSavedItem(actor: LibraryActor, itemId: string): Promise<boolean> {
  return getLibraryRepository().removeSavedItem(actor.id, itemId);
}
