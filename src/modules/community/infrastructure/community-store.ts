import {
  compareThreadsByCreatedDesc,
  getThreadCursor,
  isThreadAfterCursor,
} from "@/src/modules/community/domain/community-pagination";
import type {
  CommunityRepository,
  CommunityStore,
  CommunityReply,
} from "@/src/modules/community/domain/community-types";

declare global {
  var __okkhorCommunityStore: CommunityStore | undefined;
  var __okkhorMemoryCommunityRepository: CommunityRepository | undefined;
}

function createStore(): CommunityStore {
  return {
    threads: new Map(),
    replies: new Map(),
  };
}

function countRepliesForThread(threadId: string) {
  let count = 0;

  for (const reply of getCommunityStore().replies.values()) {
    if (reply.threadId === threadId && reply.moderationState === "visible") {
      count += 1;
    }
  }

  return count;
}

function compareRepliesByCreatedAsc(left: CommunityReply, right: CommunityReply): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

function createMemoryCommunityRepository(): CommunityRepository {
  return {
    async listThreads({ limit, cursor, includeHidden = false }) {
      const threads = Array.from(getCommunityStore().threads.values())
        .filter((thread) => includeHidden || thread.moderationState === "visible")
        .sort(compareThreadsByCreatedDesc);
      const remaining = cursor ? threads.filter((thread) => isThreadAfterCursor(thread, cursor)) : threads;
      const page = remaining.slice(0, limit);
      const last = page[page.length - 1];

      return {
        threads: page.map((thread) => ({ ...thread, replyCount: countRepliesForThread(thread.id) })),
        nextCursor: remaining.length > limit && last ? getThreadCursor(last) : undefined,
      };
    },
    async getThreadById(id) {
      return getCommunityStore().threads.get(id);
    },
    async listThreadsByAuthor(authorId, { limit }) {
      return Array.from(getCommunityStore().threads.values())
        .filter((thread) => thread.authorId === authorId && thread.moderationState === "visible")
        .sort(compareThreadsByCreatedDesc)
        .slice(0, limit)
        .map((thread) => ({ ...thread, replyCount: countRepliesForThread(thread.id) }));
    },
    async createThread(thread) {
      getCommunityStore().threads.set(thread.id, thread);
    },
    async listRepliesByThreadId(threadId, { includeHidden = false } = {}) {
      return Array.from(getCommunityStore().replies.values())
        .filter((reply) => reply.threadId === threadId && (includeHidden || reply.moderationState === "visible"))
        .sort(compareRepliesByCreatedAsc);
    },
    async createReply(reply) {
      getCommunityStore().replies.set(reply.id, reply);
    },
    async getReplyById(id) {
      return getCommunityStore().replies.get(id);
    },
    async updateThreadModeration(thread) {
      getCommunityStore().threads.set(thread.id, thread);
    },
    async updateReplyModeration(reply) {
      getCommunityStore().replies.set(reply.id, reply);
    },
  };
}

export function getCommunityStore(): CommunityStore {
  if (!globalThis.__okkhorCommunityStore) {
    globalThis.__okkhorCommunityStore = createStore();
  }

  return globalThis.__okkhorCommunityStore;
}

export function getMemoryCommunityRepository(): CommunityRepository {
  if (!globalThis.__okkhorMemoryCommunityRepository) {
    globalThis.__okkhorMemoryCommunityRepository = createMemoryCommunityRepository();
  }

  return globalThis.__okkhorMemoryCommunityRepository;
}

export function resetCommunityStoreForTesting() {
  globalThis.__okkhorCommunityStore = createStore();
  globalThis.__okkhorMemoryCommunityRepository = createMemoryCommunityRepository();
}
