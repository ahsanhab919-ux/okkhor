import { vi } from "vitest";

import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import {
  createReply,
  createReport,
  createThread,
  getModerationThread,
  getThread,
  listModerationQueue,
  listModerationReports,
  listThreads,
  listThreadsByAuthor,
  moderateReply,
  moderateThread,
  resolveReport,
} from "@/src/modules/community/application/community-service";
import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { decodeThreadCursor, encodeThreadCursor } from "@/src/modules/community/domain/community-pagination";
import {
  createReplySchema,
  createReportSchema,
  createThreadSchema,
  moderateReplySchema,
  moderateThreadSchema,
  resolveReportSchema,
} from "@/src/modules/community/domain/community-schemas";
import type {
  CommunityActor,
  CommunityReply,
  CommunityThread,
  ModerationState,
} from "@/src/modules/community/domain/community-types";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";

const member: CommunityActor = { id: "u-member", roles: ["learner"] };
const other: CommunityActor = { id: "u-other", roles: ["scholar"] };
const admin: CommunityActor = { id: "u-admin", roles: ["admin"] };

describe("community domain rules", () => {
  it("validates the create-thread payload and defaults the category", () => {
    expect(createThreadSchema.parse({ title: "A title", body: "A body" })).toEqual({
      title: "A title",
      body: "A body",
      category: "General",
    });
    expect(createThreadSchema.parse({ title: "T", body: "B", category: "  History  " }).category).toBe("History");
    expect(() => createThreadSchema.parse({ title: "", body: "B" })).toThrow();
    expect(() => createThreadSchema.parse({ title: "T", body: "" })).toThrow();
    expect(() => createThreadSchema.parse({ title: "T", body: "B", category: "x" })).toThrow();
  });

  it("requires a non-empty reply body", () => {
    expect(createReplySchema.parse({ body: "  hello  " }).body).toBe("hello");
    expect(() => createReplySchema.parse({ body: "" })).toThrow();
  });

  it("round-trips the keyset cursor and rejects malformed input", () => {
    const cursor = { createdAt: "2026-03-01T00:00:00.000Z", id: "t-1" };

    expect(decodeThreadCursor(encodeThreadCursor(cursor))).toEqual(cursor);

    const noSeparator = Buffer.from("nopipe", "utf8").toString("base64url");

    expect(() => decodeThreadCursor(noSeparator)).toThrow(CommunityError);
    expect(() => decodeThreadCursor("")).toThrow(CommunityError);
  });
});

describe("community service", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("creates a thread and stamps the author", async () => {
    const thread = await createThread(member, { title: "First thread", body: "Body" });

    expect(thread).toMatchObject({
      authorId: "u-member",
      title: "First thread",
      body: "Body",
      category: "General",
    });
    expect(thread.createdAt).toBeTruthy();
    expect(thread.updatedAt).toBe(thread.createdAt);
  });

  it("rejects an invalid create payload with 400", async () => {
    await expect(createThread(member, { title: "", body: "b" })).rejects.toMatchObject({
      code: "COMMUNITY_VALIDATION_FAILED",
      status: 400,
    });
  });

  it("lists threads newest-first with a derived reply count", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
      const older = await createThread(member, { title: "Older", body: "b" });
      vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
      const newer = await createThread(other, { title: "Newer", body: "b" });

      await createReply(member, newer.id, { body: "reply one" });
      await createReply(other, newer.id, { body: "reply two" });

      const page = await listThreads();

      expect(page.threads.map((thread) => thread.id)).toEqual([newer.id, older.id]);
      expect(page.threads[0].replyCount).toBe(2);
      expect(page.threads[1].replyCount).toBe(0);
      expect(page.nextCursor).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("paginates with a keyset cursor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      const ids: string[] = [];

      for (let index = 0; index < 3; index += 1) {
        vi.setSystemTime(new Date(`2026-03-0${index + 1}T00:00:00.000Z`));
        ids.push((await createThread(member, { title: `T${index}`, body: "b" })).id);
      }

      const first = await listThreads({ limit: 2 });

      expect(first.threads.map((thread) => thread.id)).toEqual([ids[2], ids[1]]);
      expect(first.nextCursor).toBeTruthy();

      const second = await listThreads({ limit: 2, cursor: first.nextCursor });

      expect(second.threads.map((thread) => thread.id)).toEqual([ids[0]]);
      expect(second.nextCursor).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a thread with its replies in chronological order", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
      const thread = await createThread(member, { title: "T", body: "b" });
      vi.setSystemTime(new Date("2026-04-01T00:00:10.000Z"));
      await createReply(other, thread.id, { body: "first" });
      vi.setSystemTime(new Date("2026-04-01T00:00:20.000Z"));
      await createReply(member, thread.id, { body: "second" });

      const detail = await getThread(thread.id);

      expect(detail.thread.id).toBe(thread.id);
      expect(detail.replies.map((reply) => reply.body)).toEqual(["first", "second"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 404 for an unknown thread", async () => {
    await expect(getThread("missing")).rejects.toMatchObject({
      code: "COMMUNITY_THREAD_NOT_FOUND",
      status: 404,
    });
  });

  it("refuses to reply to an unknown thread with 404", async () => {
    await expect(createReply(member, "missing", { body: "hi" })).rejects.toMatchObject({
      code: "COMMUNITY_THREAD_NOT_FOUND",
      status: 404,
    });
  });
});

describe("community memory repository", () => {
  beforeEach(() => {
    resetCommunityStoreForTesting();
  });

  it("derives reply counts and pages by keyset", async () => {
    const repository = getMemoryCommunityRepository();

    await repository.createThread({
      id: "t1",
      authorId: "a",
      title: "One",
      body: "b",
      category: "General",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await repository.createThread({
      id: "t2",
      authorId: "a",
      title: "Two",
      body: "b",
      category: "General",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await repository.createReply({
      id: "r1",
      threadId: "t2",
      authorId: "a",
      body: "hi",
      createdAt: "2026-01-02T01:00:00.000Z",
      moderationState: "visible",
    });

    const page = await repository.listThreads({ limit: 10 });

    expect(page.threads.map((thread) => thread.id)).toEqual(["t2", "t1"]);
    expect(page.threads[0].replyCount).toBe(1);
    expect(page.threads[1].replyCount).toBe(0);

    const first = await repository.listThreads({ limit: 1 });

    expect(first.threads.map((thread) => thread.id)).toEqual(["t2"]);
    expect(first.nextCursor).toEqual({ createdAt: "2026-01-02T00:00:00.000Z", id: "t2" });

    const second = await repository.listThreads({ limit: 1, cursor: first.nextCursor });

    expect(second.threads.map((thread) => thread.id)).toEqual(["t1"]);
  });
});

describe("community moderation", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("grants moderation to administrators only", () => {
    expect(canModerate(["admin"])).toBe(true);
    expect(canModerate(["learner", "admin"])).toBe(true);
    expect(canModerate(["learner"])).toBe(false);
    expect(canModerate(["scholar"])).toBe(false);
    expect(canModerate([])).toBe(false);
  });

  it("validates the moderation payloads", () => {
    for (const action of ["hide", "restore", "lock", "unlock"] as const) {
      expect(moderateThreadSchema.parse({ action }).action).toBe(action);
    }

    expect(() => moderateThreadSchema.parse({ action: "delete" })).toThrow();
    expect(moderateReplySchema.parse({ action: "hide" }).action).toBe("hide");
    expect(moderateReplySchema.parse({ action: "restore" }).action).toBe("restore");
    expect(() => moderateReplySchema.parse({ action: "lock" })).toThrow();
    expect(moderateThreadSchema.parse({ action: "hide", note: "  spam  " }).note).toBe("spam");
    expect(() => moderateThreadSchema.parse({ action: "hide", note: "x".repeat(501) })).toThrow();
  });

  it("rejects a non-administrator from every moderation use case with 403", async () => {
    await expect(listModerationQueue(member)).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
    await expect(getModerationThread(member, "t1")).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
    await expect(moderateThread(member, "t1", { action: "hide" })).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
    await expect(moderateReply(member, "r1", { action: "hide" })).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
  });

  it("hides a thread from every member read, keeps it in the queue, and restores it", async () => {
    const thread = await createThread(member, { title: "Visible thread", body: "b" });

    await createReply(other, thread.id, { body: "a reply" });

    const hidden = await moderateThread(admin, thread.id, { action: "hide", note: "off topic" });

    expect(hidden.moderationState).toBe("hidden");
    expect(hidden.moderatedBy).toBe("u-admin");
    expect(hidden.moderatedAt).toBeTruthy();
    expect(hidden.moderationNote).toBe("off topic");

    expect((await listThreads()).threads).toEqual([]);
    await expect(getThread(thread.id)).rejects.toMatchObject({ code: "COMMUNITY_THREAD_NOT_FOUND" });
    expect(await listThreadsByAuthor("u-member")).toEqual([]);
    expect((await listModerationQueue(admin)).map((entry) => entry.id)).toEqual([thread.id]);

    const restored = await moderateThread(admin, thread.id, { action: "restore" });

    expect(restored.moderationState).toBe("visible");
    expect((await listThreads()).threads.map((entry) => entry.id)).toEqual([thread.id]);
  });

  it("locks a thread so new replies are refused with 409", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });

    await moderateThread(admin, thread.id, { action: "lock" });

    await expect(createReply(other, thread.id, { body: "late" })).rejects.toMatchObject({
      code: "COMMUNITY_THREAD_LOCKED",
      status: 409,
    });
    await expect(getThread(thread.id)).resolves.toMatchObject({
      thread: { locked: true },
    });

    await moderateThread(admin, thread.id, { action: "unlock" });
    await expect(createReply(other, thread.id, { body: "ok" })).resolves.toMatchObject({ body: "ok" });
  });

  it("hides a reply from the detail read and the reply count", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });
    const reply = await createReply(other, thread.id, { body: "first" });

    await createReply(other, thread.id, { body: "second" });

    const hidden = await moderateReply(admin, reply.id, { action: "hide" });

    expect(hidden.moderationState).toBe("hidden");
    expect(hidden.moderatedBy).toBe("u-admin");
    expect(hidden.moderatedAt).toBeTruthy();

    const detail = await getThread(thread.id);

    expect(detail.replies.map((entry) => entry.body)).toEqual(["second"]);
    expect((await listThreads()).threads[0].replyCount).toBe(1);

    const moderationDetail = await getModerationThread(admin, thread.id);

    expect(moderationDetail.replies.map((entry) => entry.body).sort()).toEqual(["first", "second"]);
  });

  it("returns 404 for an unknown reply or thread", async () => {
    await expect(moderateReply(admin, "missing", { action: "hide" })).rejects.toMatchObject({
      code: "COMMUNITY_REPLY_NOT_FOUND",
      status: 404,
    });
    await expect(moderateThread(admin, "missing", { action: "hide" })).rejects.toMatchObject({
      code: "COMMUNITY_THREAD_NOT_FOUND",
      status: 404,
    });
    await expect(getModerationThread(admin, "missing")).rejects.toMatchObject({
      code: "COMMUNITY_THREAD_NOT_FOUND",
      status: 404,
    });
  });
});

describe("community moderation repository", () => {
  beforeEach(() => {
    resetCommunityStoreForTesting();
  });

  async function seedThread(id: string, moderationState: ModerationState = "visible") {
    await getMemoryCommunityRepository().createThread({
      id,
      authorId: "a",
      title: id,
      body: "b",
      category: "General",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      moderationState,
      locked: false,
    });
  }

  async function seedReply(id: string, threadId: string, moderationState: ModerationState = "visible") {
    await getMemoryCommunityRepository().createReply({
      id,
      threadId,
      authorId: "a",
      body: id,
      createdAt: "2026-01-01T00:00:00.000Z",
      moderationState,
    });
  }

  it("omits hidden threads and replies unless asked to include them", async () => {
    const repository = getMemoryCommunityRepository();

    await seedThread("visible");
    await seedThread("hidden", "hidden");
    await seedReply("r1", "visible");
    await seedReply("r2", "visible", "hidden");

    expect((await repository.listThreads({ limit: 10 })).threads.map((entry) => entry.id)).toEqual([
      "visible",
    ]);
    expect(
      (await repository.listThreads({ limit: 10, includeHidden: true })).threads
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["hidden", "visible"]);
    expect((await repository.listThreads({ limit: 10 })).threads[0].replyCount).toBe(1);
    expect((await repository.listThreadsByAuthor("a", { limit: 10 })).map((entry) => entry.id)).toEqual([
      "visible",
    ]);
    expect((await repository.listRepliesByThreadId("visible")).map((entry) => entry.id)).toEqual(["r1"]);
    expect(
      (await repository.listRepliesByThreadId("visible", { includeHidden: true }))
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["r1", "r2"]);
    expect(await repository.getReplyById("r2")).toMatchObject({ moderationState: "hidden" });
    expect(await repository.getReplyById("missing")).toBeUndefined();
  });

  it("persists the moderation columns on a thread and a reply", async () => {
    const repository = getMemoryCommunityRepository();

    await seedThread("t1");
    await seedReply("r1", "t1");

    const thread = (await repository.getThreadById("t1")) as CommunityThread;

    await repository.updateThreadModeration({
      ...thread,
      moderationState: "hidden",
      locked: true,
      moderatedBy: "u-admin",
      moderatedAt: "2026-02-01T00:00:00.000Z",
      moderationNote: "note",
    });

    const reply = (await repository.getReplyById("r1")) as CommunityReply;

    await repository.updateReplyModeration({
      ...reply,
      moderationState: "hidden",
      moderatedBy: "u-admin",
    });

    expect(await repository.getThreadById("t1")).toMatchObject({
      moderationState: "hidden",
      locked: true,
      moderatedBy: "u-admin",
      moderationNote: "note",
    });
    expect(await repository.getReplyById("r1")).toMatchObject({
      moderationState: "hidden",
      moderatedBy: "u-admin",
    });
  });
});

describe("community topic browse repository", () => {
  beforeEach(() => {
    resetCommunityStoreForTesting();
  });

  async function seedThread(
    id: string,
    category: string,
    createdAt: string,
    moderationState: ModerationState = "visible",
    locked = false,
  ) {
    await getMemoryCommunityRepository().createThread({
      id,
      authorId: "a",
      title: id,
      body: "b",
      category,
      createdAt,
      updatedAt: createdAt,
      moderationState,
      locked,
    });
  }

  it("counts visible threads per category, ordered by count then category", async () => {
    const repository = getMemoryCommunityRepository();

    await seedThread("t1", "General", "2026-01-01T00:00:00.000Z");
    await seedThread("t2", "General", "2026-01-02T00:00:00.000Z");
    await seedThread("t3", "History", "2026-01-03T00:00:00.000Z");
    // A hidden thread's category is never counted.
    await seedThread("hidden", "History", "2026-01-04T00:00:00.000Z", "hidden");

    expect(await repository.listDistinctCategories()).toEqual([
      { category: "General", count: 2 },
      { category: "History", count: 1 },
    ]);
  });

  it("returns visible threads in a category, newest first, paginated, locked included", async () => {
    const repository = getMemoryCommunityRepository();

    await seedThread("a", "General", "2026-01-01T00:00:00.000Z");
    await seedThread("locked", "General", "2026-01-15T00:00:00.000Z", "visible", true);
    await seedThread("b", "General", "2026-02-01T00:00:00.000Z");
    await seedThread("c", "General", "2026-03-01T00:00:00.000Z");
    await seedThread("hidden", "General", "2026-04-01T00:00:00.000Z", "hidden");
    await seedThread("other", "History", "2026-05-01T00:00:00.000Z");

    expect(
      (await repository.listThreadsByCategory("General", { limit: 10 })).threads.map((thread) => thread.id),
    ).toEqual(["c", "b", "locked", "a"]);

    const first = await repository.listThreadsByCategory("General", { limit: 2 });

    expect(first.threads.map((thread) => thread.id)).toEqual(["c", "b"]);
    expect(first.nextCursor).toEqual({ createdAt: "2026-02-01T00:00:00.000Z", id: "b" });

    const second = await repository.listThreadsByCategory("General", {
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(second.threads.map((thread) => thread.id)).toEqual(["locked", "a"]);
    expect(second.nextCursor).toBeUndefined();

    expect(await repository.listThreadsByCategory("missing", { limit: 10 })).toEqual({
      threads: [],
      nextCursor: undefined,
    });
  });
});

describe("community reporting", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("validates the report payloads", () => {
    for (const reason of ["spam", "harassment", "misinformation", "off-topic", "other"] as const) {
      expect(
        createReportSchema.parse({ targetType: "thread", targetId: "t1", reason }).reason,
      ).toBe(reason);
    }

    expect(createReportSchema.parse({ targetType: "reply", targetId: "r1", reason: "spam" })).toEqual({
      targetType: "reply",
      targetId: "r1",
      reason: "spam",
    });
    expect(createReportSchema.parse({ targetType: "thread", targetId: " t1 ", reason: "spam" }).targetId).toBe(
      "t1",
    );
    expect(
      createReportSchema.parse({ targetType: "thread", targetId: "t1", reason: "spam", detail: " ok " }).detail,
    ).toBe("ok");

    expect(() => createReportSchema.parse({ targetType: "content", targetId: "t1", reason: "spam" })).toThrow();
    expect(() => createReportSchema.parse({ targetType: "thread", targetId: "", reason: "spam" })).toThrow();
    expect(() => createReportSchema.parse({ targetType: "thread", targetId: "t1", reason: "meh" })).toThrow();
    expect(() =>
      createReportSchema.parse({ targetType: "thread", targetId: "t1", reason: "spam", detail: "x".repeat(1001) }),
    ).toThrow();

    expect(resolveReportSchema.parse({ action: "resolve" }).action).toBe("resolve");
    expect(resolveReportSchema.parse({ action: "dismiss" }).action).toBe("dismiss");
    expect(resolveReportSchema.parse({ action: "resolve", note: "  done  " }).note).toBe("done");
    expect(() => resolveReportSchema.parse({ action: "close" })).toThrow();
    expect(() => resolveReportSchema.parse({ action: "resolve", note: "x".repeat(501) })).toThrow();
  });

  it("stores an open report for a visible target", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });
    const report = await createReport(other, {
      targetType: "thread",
      targetId: thread.id,
      reason: "spam",
      detail: "not ok",
    });

    expect(report).toMatchObject({
      reporterId: "u-other",
      targetType: "thread",
      targetId: thread.id,
      reason: "spam",
      detail: "not ok",
      status: "open",
    });
    expect(report.createdAt).toBeTruthy();
  });

  it("is idempotent: a repeat report returns the same report and adds no row", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });
    const first = await createReport(other, { targetType: "thread", targetId: thread.id, reason: "spam" });
    const second = await createReport(other, {
      targetType: "thread",
      targetId: thread.id,
      reason: "harassment",
    });

    expect(second.id).toBe(first.id);
    expect(second.reason).toBe("spam");

    const entries = await listModerationReports(admin);

    expect(entries).toHaveLength(1);
  });

  it("returns 404 for an unknown or hidden target", async () => {
    await expect(
      createReport(member, { targetType: "thread", targetId: "missing", reason: "spam" }),
    ).rejects.toMatchObject({ code: "COMMUNITY_REPORT_TARGET_NOT_FOUND", status: 404 });

    const thread = await createThread(member, { title: "T", body: "b" });
    const reply = await createReply(other, thread.id, { body: "hide me" });

    await moderateThread(admin, thread.id, { action: "hide" });
    await moderateReply(admin, reply.id, { action: "hide" });

    await expect(
      createReport(member, { targetType: "thread", targetId: thread.id, reason: "spam" }),
    ).rejects.toMatchObject({ code: "COMMUNITY_REPORT_TARGET_NOT_FOUND", status: 404 });
    await expect(
      createReport(member, { targetType: "reply", targetId: reply.id, reason: "spam" }),
    ).rejects.toMatchObject({ code: "COMMUNITY_REPORT_TARGET_NOT_FOUND", status: 404 });
  });

  it("rejects a non-administrator from every triage use case with 403", async () => {
    await expect(listModerationReports(member)).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
    await expect(resolveReport(member, "r1", { action: "resolve" })).rejects.toMatchObject({
      code: "COMMUNITY_FORBIDDEN",
      status: 403,
    });
  });

  it("queues reports with their content and closes them as resolved or dismissed", async () => {
    const thread = await createThread(member, { title: "Reported thread", body: "b" });
    const reply = await createReply(member, thread.id, { body: "reported reply" });

    const threadReport = await createReport(other, {
      targetType: "thread",
      targetId: thread.id,
      reason: "spam",
    });
    const replyReport = await createReport(member, {
      targetType: "reply",
      targetId: reply.id,
      reason: "harassment",
    });

    const entries = await listModerationReports(admin);

    expect(entries.map((entry) => entry.report.id).sort()).toEqual(
      [replyReport.id, threadReport.id].sort(),
    );

    const replyEntry = entries.find((entry) => entry.report.targetType === "reply");
    const threadEntry = entries.find((entry) => entry.report.targetType === "thread");

    expect(replyEntry).toMatchObject({
      report: { targetType: "reply", reporterId: "u-member" },
      thread: { id: thread.id },
      reply: { id: reply.id },
    });
    expect(threadEntry).toMatchObject({
      report: { targetType: "thread", reporterId: "u-other" },
      thread: { id: thread.id },
    });
    expect(threadEntry?.reply).toBeUndefined();

    const resolved = await resolveReport(admin, threadReport.id, {
      action: "resolve",
      note: "hidden",
    });

    expect(resolved).toMatchObject({
      status: "resolved",
      resolvedBy: "u-admin",
      resolutionNote: "hidden",
    });
    expect(resolved.resolvedAt).toBeTruthy();

    const dismissed = await resolveReport(admin, replyReport.id, { action: "dismiss" });

    expect(dismissed.status).toBe("dismissed");
    expect((await listModerationReports(admin)).length).toBe(0);
    expect((await listModerationReports(admin, { status: "resolved" })).map((e) => e.report.id)).toEqual([
      threadReport.id,
    ]);
  });

  it("returns 404 for an unknown report id", async () => {
    await expect(resolveReport(admin, "missing", { action: "resolve" })).rejects.toMatchObject({
      code: "COMMUNITY_REPORT_NOT_FOUND",
      status: 404,
    });
  });

  it("keeps the reporter identity on the moderation queue only", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });

    await createReport(other, { targetType: "thread", targetId: thread.id, reason: "spam" });

    const detail = await getThread(thread.id);

    expect(JSON.stringify(detail)).not.toContain("reporterId");

    const entries = await listModerationReports(admin);

    expect(entries[0].report.reporterId).toBe("u-other");
  });

  it("closing a report does not change the content's visibility", async () => {
    const thread = await createThread(member, { title: "T", body: "b" });
    const report = await createReport(other, { targetType: "thread", targetId: thread.id, reason: "spam" });

    await resolveReport(admin, report.id, { action: "resolve" });

    expect((await getThread(thread.id)).thread.moderationState).toBe("visible");
  });
});

describe("community reporting repository", () => {
  beforeEach(() => {
    resetCommunityStoreForTesting();
  });

  const baseReport = {
    reporterId: "u-1",
    targetType: "thread" as const,
    targetId: "t1",
    reason: "spam" as const,
    status: "open" as const,
  };

  it("creates idempotently and returns the pre-existing report", async () => {
    const repository = getMemoryCommunityRepository();

    const created = await repository.createReport({
      ...baseReport,
      id: "rep-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(created.id).toBe("rep-1");

    const duplicate = await repository.createReport({
      ...baseReport,
      id: "rep-2",
      reason: "harassment",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(duplicate.id).toBe("rep-1");
    expect(duplicate.reason).toBe("spam");
    expect(await repository.listReports({ limit: 10 })).toHaveLength(1);
  });

  it("filters by status, orders newest first, and updates the triage columns", async () => {
    const repository = getMemoryCommunityRepository();

    await repository.createReport({ ...baseReport, id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    await repository.createReport({
      ...baseReport,
      id: "b",
      targetId: "t2",
      status: "resolved",
      createdAt: "2026-01-03T00:00:00.000Z",
    });
    await repository.createReport({ ...baseReport, id: "c", targetId: "t3", createdAt: "2026-01-02T00:00:00.000Z" });

    expect((await repository.listReports({ limit: 10 })).map((report) => report.id)).toEqual(["b", "c", "a"]);
    expect((await repository.listReports({ limit: 10, status: "open" })).map((report) => report.id)).toEqual([
      "c",
      "a",
    ]);
    expect((await repository.listReports({ limit: 10, status: "resolved" })).map((report) => report.id)).toEqual([
      "b",
    ]);

    const stored = (await repository.getReportById("a")) as NonNullable<
      Awaited<ReturnType<typeof repository.getReportById>>
    >;

    await repository.updateReport({
      ...stored,
      status: "dismissed",
      resolvedBy: "u-admin",
      resolvedAt: "2026-02-01T00:00:00.000Z",
      resolutionNote: "no action",
    });

    expect(await repository.getReportById("a")).toMatchObject({
      status: "dismissed",
      resolvedBy: "u-admin",
      resolutionNote: "no action",
    });
  });
});
