import { vi } from "vitest";

import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import {
  createReply,
  createThread,
  getThread,
  listThreads,
} from "@/src/modules/community/application/community-service";
import { CommunityError } from "@/src/modules/community/domain/community-errors";
import { decodeThreadCursor, encodeThreadCursor } from "@/src/modules/community/domain/community-pagination";
import { createReplySchema, createThreadSchema } from "@/src/modules/community/domain/community-schemas";
import type { CommunityActor } from "@/src/modules/community/domain/community-types";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";

const member: CommunityActor = { id: "u-member", roles: ["learner"] };
const other: CommunityActor = { id: "u-other", roles: ["scholar"] };

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
    });
    await repository.createThread({
      id: "t2",
      authorId: "a",
      title: "Two",
      body: "b",
      category: "General",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await repository.createReply({
      id: "r1",
      threadId: "t2",
      authorId: "a",
      body: "hi",
      createdAt: "2026-01-02T01:00:00.000Z",
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
