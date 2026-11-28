import { NextRequest } from "next/server";

import { POST as moderateReplyRoute } from "@/app/api/community/moderation/replies/[id]/route";
import {
  GET as getModerationThread,
  POST as moderateThreadRoute,
} from "@/app/api/community/moderation/threads/[id]/route";
import { GET as getModerationQueue } from "@/app/api/community/moderation/threads/route";
import { GET as getThreadRoute } from "@/app/api/community/threads/[id]/route";
import { POST as createReplyRoute } from "@/app/api/community/threads/[id]/replies/route";
import { GET as listThreadsRoute, POST as createThreadRoute } from "@/app/api/community/threads/route";
import { resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

const THREADS_URL = "http://localhost/api/community/threads";
const MODERATION_QUEUE_URL = "http://localhost/api/community/moderation/threads";

type ErrorPayload = {
  error: { code: string };
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = MODERATION_QUEUE_URL) {
  const request = new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (token) {
    request.cookies.set(ACCESS_TOKEN_COOKIE, token);
  }

  return request;
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function persona(phoneNumber: string, roles: UserRole[] = ["learner"]) {
  const result = await registerUser({
    phoneNumber,
    displayName: "Community Member",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  return { token: result.tokens.accessToken, userId: result.user.id };
}

async function createThreadFor(token: string, title = "A thread") {
  const response = await createThreadRoute(jsonRequest("POST", { title, body: "Body" }, token, THREADS_URL));

  return ((await response.json()) as { thread: { id: string } }).thread.id;
}

function threadIds(payload: { threads: { id: string }[] }) {
  return payload.threads.map((thread) => thread.id);
}

describe("community moderation routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("rejects an unauthenticated queue read with 401", async () => {
    const response = await getModerationQueue(jsonRequest("GET"));

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("forbids a signed-in non-administrator from the queue with 403", async () => {
    const member = await persona("01712345678");
    const response = await getModerationQueue(jsonRequest("GET", undefined, member.token));

    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_FORBIDDEN");
  });

  it("hides a thread from the member read, keeps it in the queue, and restores it", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Visible thread");

    await createReplyRoute(
      jsonRequest("POST", { body: "a reply" }, member.token, THREADS_URL),
      idContext(threadId),
    );

    const hidden = await moderateThreadRoute(
      jsonRequest("POST", { action: "hide", note: "off topic" }, admin.token),
      idContext(threadId),
    );
    const hiddenBody = (await hidden.json()) as { thread: { moderationState: string; moderatedBy: string } };

    expect(hidden.status).toBe(200);
    expect(hiddenBody.thread).toMatchObject({ moderationState: "hidden", moderatedBy: admin.userId });

    const memberList = await listThreadsRoute(jsonRequest("GET", undefined, member.token, THREADS_URL));

    expect(threadIds((await memberList.json()) as { threads: { id: string }[] })).toEqual([]);

    const memberDetail = await getThreadRoute(
      jsonRequest("GET", undefined, member.token, THREADS_URL),
      idContext(threadId),
    );

    expect(memberDetail.status).toBe(404);

    const queue = await getModerationQueue(jsonRequest("GET", undefined, admin.token));

    expect(queue.status).toBe(200);
    expect(threadIds((await queue.json()) as { threads: { id: string }[] })).toEqual([threadId]);

    const restored = await moderateThreadRoute(
      jsonRequest("POST", { action: "restore" }, admin.token),
      idContext(threadId),
    );

    expect(((await restored.json()) as { thread: { moderationState: string } }).thread.moderationState).toBe(
      "visible",
    );

    const restoredList = await listThreadsRoute(jsonRequest("GET", undefined, member.token, THREADS_URL));

    expect(threadIds((await restoredList.json()) as { threads: { id: string }[] })).toEqual([threadId]);
  });

  it("refuses a reply to a locked thread with 409", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    await moderateThreadRoute(
      jsonRequest("POST", { action: "lock" }, admin.token),
      idContext(threadId),
    );

    const response = await createReplyRoute(
      jsonRequest("POST", { body: "late" }, member.token, THREADS_URL),
      idContext(threadId),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_THREAD_LOCKED");
  });

  it("hides a reply from the member detail and the reply count", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    const replyResponse = await createReplyRoute(
      jsonRequest("POST", { body: "hide me" }, member.token, THREADS_URL),
      idContext(threadId),
    );
    const replyId = ((await replyResponse.json()) as { reply: { id: string } }).reply.id;

    const hidden = await moderateReplyRoute(
      jsonRequest("POST", { action: "hide" }, admin.token),
      idContext(replyId),
    );

    expect(hidden.status).toBe(200);
    expect(((await hidden.json()) as { reply: { moderationState: string } }).reply.moderationState).toBe(
      "hidden",
    );

    const detail = await getThreadRoute(
      jsonRequest("GET", undefined, member.token, THREADS_URL),
      idContext(threadId),
    );

    expect(((await detail.json()) as { replies: { id: string }[] }).replies).toEqual([]);

    const list = await listThreadsRoute(jsonRequest("GET", undefined, member.token, THREADS_URL));

    expect(((await list.json()) as { threads: { replyCount: number }[] }).threads[0].replyCount).toBe(0);
  });

  it("returns the full moderator thread with hidden replies", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    const replyResponse = await createReplyRoute(
      jsonRequest("POST", { body: "hidden" }, member.token, THREADS_URL),
      idContext(threadId),
    );
    const replyId = ((await replyResponse.json()) as { reply: { id: string } }).reply.id;

    await moderateReplyRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(replyId));

    const detail = await getModerationThread(
      jsonRequest("GET", undefined, admin.token),
      idContext(threadId),
    );

    expect(detail.status).toBe(200);
    expect(
      ((await detail.json()) as { replies: { id: string; moderationState: string }[] }).replies.map(
        (reply) => reply.id,
      ),
    ).toEqual([replyId]);
  });

  it("rejects an unknown moderation action with 400", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    const response = await moderateThreadRoute(
      jsonRequest("POST", { action: "delete" }, admin.token),
      idContext(threadId),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_VALIDATION_FAILED");
  });

  it("returns 404 for an unknown reply id", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const response = await moderateReplyRoute(
      jsonRequest("POST", { action: "hide" }, admin.token),
      idContext("missing"),
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_REPLY_NOT_FOUND");
  });
});
