import { CommunityError } from "@/src/modules/community/domain/community-errors";
import type { CommunityCursor, CommunityThread } from "@/src/modules/community/domain/community-types";

export function encodeThreadCursor(cursor: CommunityCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeThreadCursor(value: string): CommunityCursor {
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const separatorIndex = decoded.lastIndexOf("|");

  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) {
    throw new CommunityError("Pagination cursor is invalid.", "COMMUNITY_INVALID_CURSOR", 400);
  }

  return {
    createdAt: decoded.slice(0, separatorIndex),
    id: decoded.slice(separatorIndex + 1),
  };
}

export function getThreadCursor(thread: CommunityThread): CommunityCursor {
  return { createdAt: thread.createdAt, id: thread.id };
}

/**
 * Orders threads newest-first. `createdAt` is an ISO-8601 UTC string, so a lexicographic
 * comparison is chronological; `id` breaks ties deterministically.
 */
export function compareThreadsByCreatedDesc(left: CommunityThread, right: CommunityThread): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

export function isThreadAfterCursor(thread: CommunityThread, cursor: CommunityCursor): boolean {
  if (thread.createdAt !== cursor.createdAt) {
    return thread.createdAt < cursor.createdAt;
  }

  return thread.id < cursor.id;
}
