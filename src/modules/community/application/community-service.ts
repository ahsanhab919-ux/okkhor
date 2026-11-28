import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import {
  decodeThreadCursor,
  encodeThreadCursor,
} from "@/src/modules/community/domain/community-pagination";
import {
  createReplySchema,
  createThreadSchema,
  moderateReplySchema,
  moderateThreadSchema,
} from "@/src/modules/community/domain/community-schemas";
import type {
  CategoryCount,
  CommunityActor,
  CommunityReply,
  CommunityThread,
  CommunityThreadDetail,
  CommunityThreadSummary,
  CreateReplyInput,
  CreateThreadInput,
  ModerateReplyInput,
  ModerateThreadInput,
  ModerationAction,
} from "@/src/modules/community/domain/community-types";
import { getCommunityRepository } from "@/src/modules/community/infrastructure/community-repository";

export const DEFAULT_COMMUNITY_PAGE_SIZE = 20;
export const MAX_COMMUNITY_PAGE_SIZE = 50;

function parseCommunitySchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Community request failed validation.";
      throw new CommunityError(detail, "COMMUNITY_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

function normalizeLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_COMMUNITY_PAGE_SIZE;
  }

  return Math.min(Math.floor(limit), MAX_COMMUNITY_PAGE_SIZE);
}

export type ListThreadsInput = {
  limit?: number;
  cursor?: string;
};

/**
 * The HTTP-facing page shape: the cursor is an opaque string here, not the domain
 * `CommunityCursor`. Encoding and decoding happen only at this boundary.
 */
export type ThreadPage = {
  threads: CommunityThreadSummary[];
  nextCursor?: string;
};

export async function listThreads(input: ListThreadsInput = {}): Promise<ThreadPage> {
  const result = await getCommunityRepository().listThreads({
    limit: normalizeLimit(input.limit),
    cursor: input.cursor ? decodeThreadCursor(input.cursor) : undefined,
  });

  return {
    threads: result.threads,
    nextCursor: result.nextCursor ? encodeThreadCursor(result.nextCursor) : undefined,
  };
}

export type ListThreadsByAuthorInput = {
  limit?: number;
};

/**
 * The author's threads, newest first, capped — the profile public read. Called by the composition
 * root, which owns the identity join; the module never resolves a name.
 */
export async function listThreadsByAuthor(
  authorId: string,
  input: ListThreadsByAuthorInput = {},
): Promise<CommunityThreadSummary[]> {
  return getCommunityRepository().listThreadsByAuthor(authorId, { limit: normalizeLimit(input.limit) });
}

/**
 * Every distinct category across visible threads with its visible-thread count, ordered by count
 * then category — the members-only browse index read. Called by the composition root.
 */
export async function listDistinctCategories(): Promise<CategoryCount[]> {
  return getCommunityRepository().listDistinctCategories();
}

export type ListThreadsByCategoryInput = {
  limit?: number;
  cursor?: string;
};

/**
 * The visible threads in `category` exactly, newest first, keyset-paginated — the
 * members-only threads-by-category read. Called by the composition root.
 */
export async function listThreadsByCategory(
  category: string,
  input: ListThreadsByCategoryInput = {},
): Promise<ThreadPage> {
  const result = await getCommunityRepository().listThreadsByCategory(category, {
    limit: normalizeLimit(input.limit),
    cursor: input.cursor ? decodeThreadCursor(input.cursor) : undefined,
  });

  return {
    threads: result.threads,
    nextCursor: result.nextCursor ? encodeThreadCursor(result.nextCursor) : undefined,
  };
}

export async function createThread(actor: CommunityActor, input: CreateThreadInput): Promise<CommunityThread> {
  const parsed = parseCommunitySchema(createThreadSchema, input);
  const now = new Date().toISOString();
  const thread: CommunityThread = {
    id: randomUUID(),
    authorId: actor.id,
    title: parsed.title,
    body: parsed.body,
    category: parsed.category,
    createdAt: now,
    updatedAt: now,
    moderationState: "visible",
    locked: false,
  };

  await getCommunityRepository().createThread(thread);

  return thread;
}

/**
 * The member-facing thread read. A hidden thread is reported as not found, so a moderated thread
 * is indistinguishable from an unknown one (`community-moderation-slice.md` §7).
 */
export async function getThread(id: string): Promise<CommunityThreadDetail> {
  const repository = getCommunityRepository();
  const thread = await repository.getThreadById(id);

  if (!thread || thread.moderationState === "hidden") {
    throw new CommunityError("Thread was not found.", "COMMUNITY_THREAD_NOT_FOUND", 404);
  }

  const replies = await repository.listRepliesByThreadId(id);

  return { thread, replies };
}

export async function createReply(
  actor: CommunityActor,
  threadId: string,
  input: CreateReplyInput,
): Promise<CommunityReply> {
  const parsed = parseCommunitySchema(createReplySchema, input);
  const repository = getCommunityRepository();
  const thread = await repository.getThreadById(threadId);

  if (!thread || thread.moderationState === "hidden") {
    throw new CommunityError("Thread was not found.", "COMMUNITY_THREAD_NOT_FOUND", 404);
  }

  if (thread.locked) {
    throw new CommunityError(
      "This thread is locked and cannot accept new replies.",
      "COMMUNITY_THREAD_LOCKED",
      409,
    );
  }

  const reply: CommunityReply = {
    id: randomUUID(),
    threadId,
    authorId: actor.id,
    body: parsed.body,
    createdAt: new Date().toISOString(),
    moderationState: "visible",
  };

  await repository.createReply(reply);

  return reply;
}

export type ListModerationQueueInput = {
  limit?: number;
};

function assertCanModerate(actor: CommunityActor) {
  if (!canModerate(actor.roles)) {
    throw new CommunityError(
      "Only administrators can moderate community content.",
      "COMMUNITY_FORBIDDEN",
      403,
    );
  }
}

/** The moderator queue: newest threads, hidden ones included. Administrators only. */
export async function listModerationQueue(
  actor: CommunityActor,
  input: ListModerationQueueInput = {},
): Promise<CommunityThreadSummary[]> {
  assertCanModerate(actor);

  const { threads } = await getCommunityRepository().listThreads({
    limit: normalizeLimit(input.limit),
    includeHidden: true,
  });

  return threads;
}

/** A thread with all of its replies, hidden ones included. Administrators only. */
export async function getModerationThread(actor: CommunityActor, id: string): Promise<CommunityThreadDetail> {
  assertCanModerate(actor);

  const repository = getCommunityRepository();
  const thread = await repository.getThreadById(id);

  if (!thread) {
    throw new CommunityError("Thread was not found.", "COMMUNITY_THREAD_NOT_FOUND", 404);
  }

  const replies = await repository.listRepliesByThreadId(id, { includeHidden: true });

  return { thread, replies };
}

function nextThreadState(thread: CommunityThread, action: ModerationAction) {
  switch (action) {
    case "hide":
      return { moderationState: "hidden" as const, locked: thread.locked };
    case "restore":
      return { moderationState: "visible" as const, locked: thread.locked };
    case "lock":
      return { moderationState: thread.moderationState, locked: true };
    case "unlock":
      return { moderationState: thread.moderationState, locked: false };
  }
}

/** Hides, restores, locks, or unlocks a thread. Administrators only. */
export async function moderateThread(
  actor: CommunityActor,
  threadId: string,
  input: ModerateThreadInput,
): Promise<CommunityThread> {
  assertCanModerate(actor);

  const parsed = parseCommunitySchema(moderateThreadSchema, input);
  const repository = getCommunityRepository();
  const existing = await repository.getThreadById(threadId);

  if (!existing) {
    throw new CommunityError("Thread was not found.", "COMMUNITY_THREAD_NOT_FOUND", 404);
  }

  const updated: CommunityThread = {
    ...existing,
    ...nextThreadState(existing, parsed.action),
    moderatedBy: actor.id,
    moderatedAt: new Date().toISOString(),
    moderationNote: parsed.note || undefined,
  };

  await repository.updateThreadModeration(updated);

  return updated;
}

/** Hides or restores a reply. Administrators only. */
export async function moderateReply(
  actor: CommunityActor,
  replyId: string,
  input: ModerateReplyInput,
): Promise<CommunityReply> {
  assertCanModerate(actor);

  const parsed = parseCommunitySchema(moderateReplySchema, input);
  const repository = getCommunityRepository();
  const existing = await repository.getReplyById(replyId);

  if (!existing) {
    throw new CommunityError("Reply was not found.", "COMMUNITY_REPLY_NOT_FOUND", 404);
  }

  const updated: CommunityReply = {
    ...existing,
    moderationState: parsed.action === "hide" ? "hidden" : "visible",
    moderatedBy: actor.id,
    moderatedAt: new Date().toISOString(),
    moderationNote: parsed.note || undefined,
  };

  await repository.updateReplyModeration(updated);

  return updated;
}
