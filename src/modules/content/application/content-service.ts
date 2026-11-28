import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { canAuthor } from "@/src/modules/content/domain/content-authorization";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import { createItemSchema, updateItemSchema } from "@/src/modules/content/domain/content-schemas";
import type {
  ContentAuthor,
  ContentCursor,
  CreateItemInput,
  ResearchItem,
  TagCount,
  UpdateItemInput,
} from "@/src/modules/content/domain/content-types";
import { getContentRepository } from "@/src/modules/content/infrastructure/content-repository";

export const DEFAULT_CONTENT_PAGE_SIZE = 20;
export const MAX_CONTENT_PAGE_SIZE = 50;

function parseContentSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Content request failed validation.";
      throw new ContentError(detail, "CONTENT_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

function assertCanAuthor(actor: ContentAuthor) {
  if (!canAuthor(actor.roles)) {
    throw new ContentError("You do not have permission to author research items.", "CONTENT_FORBIDDEN", 403);
  }
}

/**
 * The publish invariant: a published item must carry a non-empty Bangla summary. The composition
 * root fills a blank summary from the AI summarization module before this runs, so in the normal
 * flow it is always satisfied; this only guards direct or corrupt callers.
 */
function assertPublishableSummary(status: string, summaryBn: string) {
  if (status === "published" && !summaryBn) {
    throw new ContentError(
      "A published item must have a Bangla summary.",
      "CONTENT_VALIDATION_FAILED",
      400,
    );
  }
}

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

/**
 * The published items for the given ids, in the order requested; ids that no longer resolve to a
 * published item are omitted. Called by the composition root (the library slice) to hydrate a
 * member's saved list and to validate a save target.
 */
export async function getPublishedItemsByIds(ids: string[]): Promise<ResearchItem[]> {
  if (ids.length === 0) {
    return [];
  }

  return getContentRepository().getPublishedItemsByIds(ids);
}

export type ListItemsByAuthorInput = {
  limit?: number;
};

/**
 * The author's published items, newest-published first, capped — the profile public read. Called
 * by the composition root, which owns the identity join; the module never resolves a name.
 */
export async function listPublishedItemsByAuthor(
  authorId: string,
  input: ListItemsByAuthorInput = {},
): Promise<ResearchItem[]> {
  return getContentRepository().listPublishedItemsByAuthor(authorId, { limit: normalizeLimit(input.limit) });
}

/**
 * Every distinct published tag with its published-item count, ordered by count then tag — the
 * public browse index read. Called by the composition root.
 */
export async function listDistinctPublishedTags(): Promise<TagCount[]> {
  return getContentRepository().listDistinctPublishedTags();
}

export type ListPublishedItemsByTagInput = {
  limit?: number;
};

/**
 * The published items carrying `tag` exactly, newest-published first, capped — the public
 * research-by-tag read. Called by the composition root.
 */
export async function listPublishedItemsByTag(
  tag: string,
  input: ListPublishedItemsByTagInput = {},
): Promise<ResearchItem[]> {
  return getContentRepository().listPublishedItemsByTag(tag, { limit: normalizeLimit(input.limit) });
}

/** The authoring list: every item regardless of status, newest-edited first. */
export async function listContentItems(): Promise<ResearchItem[]> {
  return getContentRepository().listItems();
}

/** Fetches any item regardless of status — the authoring path. */
export async function getContentItem(id: string): Promise<ResearchItem> {
  const item = await getContentRepository().getItemById(id);

  if (!item) {
    throw new ContentError("Content item was not found.", "CONTENT_ITEM_NOT_FOUND", 404);
  }

  return item;
}

export async function createContentItem(actor: ContentAuthor, input: CreateItemInput): Promise<ResearchItem> {
  assertCanAuthor(actor);

  const parsed = parseContentSchema(createItemSchema, input);
  assertPublishableSummary(parsed.status, parsed.summaryBn);
  const now = new Date().toISOString();
  const item: ResearchItem = {
    id: randomUUID(),
    title: parsed.title,
    abstract: parsed.abstract,
    summaryBn: parsed.summaryBn,
    sourceLanguage: parsed.sourceLanguage,
    tags: parsed.tags,
    status: parsed.status,
    sourceUrl: parsed.sourceUrl || undefined,
    publishedAt: parsed.status === "published" ? now : undefined,
    authorId: actor.id,
    updatedBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  await getContentRepository().createItem(item);

  return item;
}

export async function updateContentItem(
  actor: ContentAuthor,
  id: string,
  input: UpdateItemInput,
): Promise<ResearchItem> {
  assertCanAuthor(actor);

  const parsed = parseContentSchema(updateItemSchema, input);
  const repository = getContentRepository();
  const existing = await repository.getItemById(id);

  if (!existing) {
    throw new ContentError("Content item was not found.", "CONTENT_ITEM_NOT_FOUND", 404);
  }

  if (parsed.updatedAt && parsed.updatedAt !== existing.updatedAt) {
    throw new ContentError(
      "The item was changed by another author. Reload it and try again.",
      "CONTENT_CONFLICT",
      409,
    );
  }

  const now = new Date().toISOString();
  const nextStatus = parsed.status ?? existing.status;
  const updated: ResearchItem = {
    ...existing,
    title: parsed.title ?? existing.title,
    abstract: parsed.abstract ?? existing.abstract,
    summaryBn: parsed.summaryBn ?? existing.summaryBn,
    sourceLanguage: parsed.sourceLanguage ?? existing.sourceLanguage,
    tags: parsed.tags ?? existing.tags,
    status: nextStatus,
    sourceUrl: parsed.sourceUrl !== undefined ? parsed.sourceUrl || undefined : existing.sourceUrl,
    publishedAt: nextStatus === "published" ? existing.publishedAt ?? now : existing.publishedAt,
    updatedBy: actor.id,
    updatedAt: now,
  };

  assertPublishableSummary(updated.status, updated.summaryBn);

  const written = await repository.updateItemIfUnchanged(updated, existing.updatedAt);

  if (!written) {
    throw new ContentError(
      "The item was changed by another author. Reload it and try again.",
      "CONTENT_CONFLICT",
      409,
    );
  }

  return updated;
}
