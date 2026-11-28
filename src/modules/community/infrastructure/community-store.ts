import {
  compareThreadsByCreatedDesc,
  getThreadCursor,
  isThreadAfterCursor,
} from "@/src/modules/community/domain/community-pagination";
import type {
  CategoryCount,
  CommunityReport,
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
    reports: new Map(),
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

/** Orders categories by popularity, then by category ascending, matching the SQL `order by count desc, category asc`. */
function compareCategoryCounts(left: CategoryCount, right: CategoryCount): number {
  if (left.count !== right.count) {
    return right.count - left.count;
  }

  return left.category < right.category ? -1 : left.category > right.category ? 1 : 0;
}

/** Orders reports `createdAt` descending, then `id` descending, matching the queue's SQL order. */
function compareReportsByCreatedDesc(left: CommunityReport, right: CommunityReport): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
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
    async listDistinctCategories() {
      const counts = new Map<string, number>();

      for (const thread of getCommunityStore().threads.values()) {
        if (thread.moderationState !== "visible") {
          continue;
        }

        counts.set(thread.category, (counts.get(thread.category) ?? 0) + 1);
      }

      return Array.from(counts, ([category, count]): CategoryCount => ({ category, count })).sort(
        compareCategoryCounts,
      );
    },
    async listThreadsByCategory(category, { limit, cursor }) {
      const threads = Array.from(getCommunityStore().threads.values())
        .filter((thread) => thread.moderationState === "visible" && thread.category === category)
        .sort(compareThreadsByCreatedDesc);
      const remaining = cursor ? threads.filter((thread) => isThreadAfterCursor(thread, cursor)) : threads;
      const page = remaining.slice(0, limit);
      const last = page[page.length - 1];

      return {
        threads: page.map((thread) => ({ ...thread, replyCount: countRepliesForThread(thread.id) })),
        nextCursor: remaining.length > limit && last ? getThreadCursor(last) : undefined,
      };
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
    async createReport(report) {
      const store = getCommunityStore();
      const existing = findReportByTarget(store, report.reporterId, report.targetType, report.targetId);

      if (existing) {
        return existing;
      }

      store.reports.set(report.id, report);

      return report;
    },
    async getReportById(id) {
      return getCommunityStore().reports.get(id);
    },
    async listReports({ status, limit }) {
      return Array.from(getCommunityStore().reports.values())
        .filter((report) => status === undefined || report.status === status)
        .sort(compareReportsByCreatedDesc)
        .slice(0, limit);
    },
    async updateReport(report) {
      getCommunityStore().reports.set(report.id, report);
    },
  };
}

/** The idempotency lookup: the member's existing report for a target, if any (`member-reporting-slice.md` §9). */
function findReportByTarget(
  store: CommunityStore,
  reporterId: string,
  targetType: CommunityReport["targetType"],
  targetId: string,
): CommunityReport | undefined {
  for (const report of store.reports.values()) {
    if (
      report.reporterId === reporterId &&
      report.targetType === targetType &&
      report.targetId === targetId
    ) {
      return report;
    }
  }

  return undefined;
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
