import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { CommunityError } from "@/src/modules/community/domain/community-errors";
import {
  decodeThreadCursor,
  encodeThreadCursor,
} from "@/src/modules/community/domain/community-pagination";
import { createReplySchema, createThreadSchema } from "@/src/modules/community/domain/community-schemas";
import type {
  CommunityActor,
  CommunityReply,
  CommunityThread,
  CommunityThreadDetail,
  CommunityThreadSummary,
  CreateReplyInput,
  CreateThreadInput,
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
  };

  await getCommunityRepository().createThread(thread);

  return thread;
}

export async function getThread(id: string): Promise<CommunityThreadDetail> {
  const repository = getCommunityRepository();
  const thread = await repository.getThreadById(id);

  if (!thread) {
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

  if (!thread) {
    throw new CommunityError("Thread was not found.", "COMMUNITY_THREAD_NOT_FOUND", 404);
  }

  const reply: CommunityReply = {
    id: randomUUID(),
    threadId,
    authorId: actor.id,
    body: parsed.body,
    createdAt: new Date().toISOString(),
  };

  await repository.createReply(reply);

  return reply;
}
