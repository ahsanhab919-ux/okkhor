import { NextRequest } from "next/server";

import { GET as getThreadRoute } from "@/app/api/community/threads/[id]/route";
import { POST as createReplyRoute } from "@/app/api/community/threads/[id]/replies/route";
import { GET as listThreadsRoute, POST as createThreadRoute } from "@/app/api/community/threads/route";
import { resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

const THREADS_URL = "http://localhost/api/community/threads";

type ErrorPayload = {
  error: { code: string };
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = THREADS_URL) {
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

function threadContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function persona(phoneNumber: string) {
  const result = await registerUser({
    phoneNumber,
    displayName: "Community Member",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  return { token: result.tokens.accessToken, userId: result.user.id };
}

describe("community routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("rejects unauthenticated listing with 401", async () => {
    const response = await listThreadsRoute(jsonRequest("GET"));

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("creates a thread and lists it newest-first", async () => {
    const member = await persona("01712345678");
    const created = await createThreadRoute(
      jsonRequest("POST", { title: "Hello world", body: "First post" }, member.token),
    );
    const createdBody = (await created.json()) as {
      thread: { id: string; authorId: string; category: string };
    };

    expect(created.status).toBe(201);
    expect(createdBody.thread).toMatchObject({ authorId: member.userId, category: "General" });

    const response = await listThreadsRoute(jsonRequest("GET", undefined, member.token));
    const payload = (await response.json()) as { threads: { id: string; replyCount: number }[] };

    expect(response.status).toBe(200);
    expect(payload.threads.map((thread) => thread.id)).toEqual([createdBody.thread.id]);
    expect(payload.threads[0].replyCount).toBe(0);
  });

  it("rejects an invalid create payload with 400", async () => {
    const member = await persona("01712345678");
    const response = await createThreadRoute(jsonRequest("POST", { title: "" }, member.token));

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_VALIDATION_FAILED");
  });

  it("reads a thread with its replies", async () => {
    const member = await persona("01712345678");
    const created = (await (
      await createThreadRoute(jsonRequest("POST", { title: "T", body: "b" }, member.token))
    ).json()) as { thread: { id: string } };

    const reply = await createReplyRoute(
      jsonRequest("POST", { body: "a reply" }, member.token),
      threadContext(created.thread.id),
    );

    expect(reply.status).toBe(201);

    const detail = await getThreadRoute(
      jsonRequest("GET", undefined, member.token),
      threadContext(created.thread.id),
    );
    const payload = (await detail.json()) as { thread: { id: string }; replies: { body: string }[] };

    expect(detail.status).toBe(200);
    expect(payload.thread.id).toBe(created.thread.id);
    expect(payload.replies.map((entry) => entry.body)).toEqual(["a reply"]);
  });

  it("returns 404 for an unknown thread", async () => {
    const member = await persona("01712345678");
    const response = await getThreadRoute(jsonRequest("GET", undefined, member.token), threadContext("missing"));

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_THREAD_NOT_FOUND");
  });

  it("returns 404 when replying to an unknown thread", async () => {
    const member = await persona("01712345678");
    const response = await createReplyRoute(
      jsonRequest("POST", { body: "hi" }, member.token),
      threadContext("missing"),
    );

    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_THREAD_NOT_FOUND");
  });

  it("rejects a malformed cursor with 400", async () => {
    const member = await persona("01712345678");
    const response = await listThreadsRoute(
      jsonRequest("GET", undefined, member.token, `${THREADS_URL}?cursor=%7Cbad`),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("COMMUNITY_INVALID_CURSOR");
  });
});
