import { ContentError } from "@/src/modules/content/domain/content-errors";
import type { ContentCursor, ResearchItem } from "@/src/modules/content/domain/content-types";
import { getContentRepository } from "@/src/modules/content/infrastructure/content-repository";

export const DEFAULT_CONTENT_PAGE_SIZE = 20;
export const MAX_CONTENT_PAGE_SIZE = 50;

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_CONTENT_PAGE_SIZE;
  }

  return Math.min(Math.floor(limit), MAX_CONTENT_PAGE_SIZE);
}

export function encodeContentCursor(cursor: ContentCursor) {
  return Buffer.from(`${cursor.publishedAt}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeContentCursor(value: string): ContentCursor {
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const separatorIndex = decoded.lastIndexOf("|");

  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) {
    throw new ContentError("Pagination cursor is invalid.", "CONTENT_INVALID_CURSOR", 400);
  }

  return {
    publishedAt: decoded.slice(0, separatorIndex),
    id: decoded.slice(separatorIndex + 1),
  };
}

export type ListPublishedItemsInput = {
  limit?: number;
  cursor?: string;
};

/**
 * The HTTP-facing page shape: the cursor is an opaque string here, not the domain
 * `ContentCursor`. Encoding and decoding happen only at this boundary.
 */
export type PublishedItemPage = {
  items: ResearchItem[];
  nextCursor?: string;
};

export async function listPublishedItems(input: ListPublishedItemsInput = {}): Promise<PublishedItemPage> {
  const result = await getContentRepository().listPublishedItems({
    limit: normalizeLimit(input.limit),
    cursor: input.cursor ? decodeContentCursor(input.cursor) : undefined,
  });

  return {
    items: result.items,
    nextCursor: result.nextCursor ? encodeContentCursor(result.nextCursor) : undefined,
  };
}

export async function getPublishedItem(id: string): Promise<ResearchItem> {
  const item = await getContentRepository().getPublishedItemById(id);

  if (!item) {
    throw new ContentError("Content item was not found.", "CONTENT_ITEM_NOT_FOUND", 404);
  }

  return item;
}
