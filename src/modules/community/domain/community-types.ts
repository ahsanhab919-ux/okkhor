import type { UserRole } from "@/src/modules/identity/domain/auth-types";

/**
 * Whether members can see a thread or reply. Hidden content is a reversible moderator action:
 * nothing is deleted, and the read path filters hidden rows out.
 */
export type ModerationState = "visible" | "hidden";

/** The moderation verbs. Threads accept all four; replies accept `hide` and `restore`. */
export type ModerationAction = "hide" | "restore" | "lock" | "unlock";

/** A member-authored discussion thread. Text only in this slice. */
export type CommunityThread = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  moderationState: ModerationState;
  /** A locked thread is readable but accepts no further replies. */
  locked: boolean;
  /**
   * The moderator audit trail. Stripped from member-facing responses; returned only by the
   * moderation endpoints (`community-moderation-slice.md` §7).
   */
  moderatedBy?: string;
  moderatedAt?: string;
  moderationNote?: string;
};

/** A flat reply to a thread. Replies are chronological and never nested. */
export type CommunityReply = {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
  moderationState: ModerationState;
  moderatedBy?: string;
  moderatedAt?: string;
  moderationNote?: string;
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

export type ModerateThreadInput = {
  action: ModerationAction;
  note?: string;
};

export type ModerateReplyInput = {
  action: Extract<ModerationAction, "hide" | "restore">;
  note?: string;
};

/** What a member can report. Reporting stays inside the discussion surface (`member-reporting-slice.md` §13). */
export type ReportTargetType = "thread" | "reply";

/** A report's lifecycle. `resolved` means action was taken; `dismissed` means none was needed. */
export type ReportStatus = "open" | "resolved" | "dismissed";

/** The reporting verbs a member chooses from. */
export type ReportReason = "spam" | "harassment" | "misinformation" | "off-topic" | "other";

/**
 * A member's report of a thread or reply. A report is a record, never a moderation action: hiding
 * content is a separate, attributed moderation write, so "this was reported" and "this was hidden"
 * stay distinct (`member-reporting-slice.md` §5, §13 decision 3).
 */
export type CommunityReport = {
  id: string;
  /**
   * The reporting member. Moderator-only — stripped from every member-facing response, like
   * `moderatedBy` (`member-reporting-slice.md` §7).
   */
  reporterId: string;
  targetType: ReportTargetType;
  /** A bare content id with no foreign key; polymorphic, so it cannot carry a single FK. */
  targetId: string;
  reason: ReportReason;
  detail?: string;
  status: ReportStatus;
  createdAt: string;
  /** The triage audit trail. Moderator-only. */
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
};

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail?: string;
};

export type ResolveReportInput = {
  action: "resolve" | "dismiss";
  note?: string;
};

/** A report plus the content it points at, so the queue can render it. */
export type ReportQueueEntry = {
  report: CommunityReport;
  thread: CommunityThread;
  reply?: CommunityReply;
};

export type ListReportsOptions = {
  status?: ReportStatus;
  limit: number;
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
  /** The moderator queue reads hidden rows; every member-facing read omits them. */
  includeHidden?: boolean;
};

export type ListRepliesOptions = {
  /** The moderator read includes hidden replies; the member read omits them. */
  includeHidden?: boolean;
};

export type ListThreadsResult = {
  threads: CommunityThreadSummary[];
  nextCursor?: CommunityCursor;
};

/** A distinct category with how many visible threads sit in it (`topic-browse-slice.md` §5). */
export type CategoryCount = {
  category: string;
  count: number;
};

export type CommunityRepository = {
  listThreads(options: ListThreadsOptions): Promise<ListThreadsResult>;
  /**
   * The author's threads as summaries, `createdAt` descending then `id` descending, truncated to
   * `limit`. Used by the composition root to render a member profile. Always visible-only: a
   * member profile is a member-facing surface.
   */
  listThreadsByAuthor(authorId: string, options: ListThreadsOptions): Promise<CommunityThreadSummary[]>;
  /**
   * Every distinct `category` across visible threads, each with how many visible threads sit in
   * it; `count` descending, then `category` ascending. Always visible-only, so a hidden thread is
   * absent from the counts (`topic-browse-slice.md` §5).
   */
  listDistinctCategories(): Promise<CategoryCount[]>;
  /**
   * The visible threads in `category` exactly, as summaries, `createdAt` descending then `id`
   * descending, keyset-paginated like `listThreads`. Always visible-only.
   */
  listThreadsByCategory(category: string, options: ListThreadsOptions): Promise<ListThreadsResult>;
  getThreadById(id: string): Promise<CommunityThread | undefined>;
  createThread(thread: CommunityThread): Promise<void>;
  /** Replies for a thread, oldest first. Hidden replies are omitted unless asked for. */
  listRepliesByThreadId(threadId: string, options?: ListRepliesOptions): Promise<CommunityReply[]>;
  createReply(reply: CommunityReply): Promise<void>;
  getReplyById(id: string): Promise<CommunityReply | undefined>;
  /** Persists the moderation columns of an existing thread. */
  updateThreadModeration(thread: CommunityThread): Promise<void>;
  /** Persists the moderation columns of an existing reply. */
  updateReplyModeration(reply: CommunityReply): Promise<void>;
  /**
   * Insert unless a report already exists for `(reporterId, targetType, targetId)`, then return the
   * stored report — the new one, or the pre-existing one. **Idempotent**, mirroring the library
   * slice's `saveItem`, so a repeat report is a no-op (`member-reporting-slice.md` §5, §7).
   */
  createReport(report: CommunityReport): Promise<CommunityReport>;
  getReportById(id: string): Promise<CommunityReport | undefined>;
  /** Reports filtered by `status`, `createdAt` descending then `id` descending, truncated to `limit`. */
  listReports(options: ListReportsOptions): Promise<CommunityReport[]>;
  /** Persists the triage columns of an existing report. */
  updateReport(report: CommunityReport): Promise<void>;
};

export type CommunityStore = {
  threads: Map<string, CommunityThread>;
  replies: Map<string, CommunityReply>;
  reports: Map<string, CommunityReport>;
};
