import type { UserRole } from "@/src/modules/identity/domain/auth-types";

/** A member-authored discussion thread. Text only in this slice. */
export type CommunityThread = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

/** A flat reply to a thread. Replies are chronological and never nested. */
export type CommunityReply = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

/** A thread as it appears in the list read, carrying its derived reply count. */
export type CommunityThreadSummary = CommunityThread & { replyCount: number };

/** A thread together with its replies, for the detail read. */
export type CommunityThreadDetail = {
  thread: CommunityThread;
  replies: CommunityReply[];
};

/**
 * The acting user, passed into community use cases as plain data. The module treats it as an
 * opaque actor; the app layer resolves it from the identity module.
 */
export type CommunityActor = {
  id: string;
  roles: UserRole[];
};

export type CreateThreadInput = {
  title: string;
  body: string;
  category?: string;
};

export type CreateReplyInput = {
  body: string;
};

/**
 * Keyset cursor for the thread list. Ordering is `createdAt` descending, then `id`
 * descending, so a cursor is the position of the last thread already returned.
 */
export type CommunityCursor = {
  createdAt: string;
  id: string;
};

export type ListThreadsOptions = {
  limit: number;
  cursor?: CommunityCursor;
};

export type ListThreadsResult = {
  threads: CommunityThreadSummary[];
  nextCursor?: CommunityCursor;
};

export type CommunityRepository = {
  listThreads(options: ListThreadsOptions): Promise<ListThreadsResult>;
  /**
   * The author's threads as summaries, `createdAt` descending then `id` descending, truncated to
   * `limit`. Used by the composition root to render a member profile.
   */
  listThreadsByAuthor(authorId: string, options: ListThreadsOptions): Promise<CommunityThreadSummary[]>;
  getThreadById(id: string): Promise<CommunityThread | undefined>;
  createThread(thread: CommunityThread): Promise<void>;
  /** Replies for a thread, oldest first. */
  listRepliesByThreadId(threadId: string): Promise<CommunityReply[]>;
  createReply(reply: CommunityReply): Promise<void>;
};

export type CommunityStore = {
  threads: Map<string, CommunityThread>;
  replies: Map<string, CommunityReply>;
};
