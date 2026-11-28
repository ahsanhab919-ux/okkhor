import { NextRequest } from "next/server";

import { POST as reportsRoute } from "@/app/api/community/reports/route";
import { GET as reportsQueueRoute } from "@/app/api/community/moderation/reports/route";
import { POST as resolveReportRoute } from "@/app/api/community/moderation/reports/[id]/route";
import { POST as moderateThreadRoute } from "@/app/api/community/moderation/threads/[id]/route";
import { POST as createReplyRoute } from "@/app/api/community/threads/[id]/replies/route";
import { POST as createThreadRoute } from "@/app/api/community/threads/route";
import { resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

const THREADS_URL = "http://localhost/api/community/threads";
const REPORTS_URL = "http://localhost/api/community/reports";
const REPORTS_QUEUE_URL = "http://localhost/api/community/moderation/reports";

type ErrorPayload = {
  error: { code: string };
};

type ReportQueuePayload = {
  entries: {
    report: { id: string; status: string; reporterId: string; targetType: string };
    thread: { id: string };
    reply?: { id: string };
  }[];
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = REPORTS_QUEUE_URL) {
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

async function createReplyFor(token: string, threadId: string) {
  const response = await createReplyRoute(
    jsonRequest("POST", { body: "a reply" }, token, THREADS_URL),
    idContext(threadId),
  );

  return ((await response.json()) as { reply: { id: string } }).reply.id;
}

describe("community report routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("rejects an unauthenticated report with 401", async () => {
    const response = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: "t1", reason: "spam" }, undefined, REPORTS_URL),
    );

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("takes a member report through the queue and closes it", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Reported thread");

    const created = await reportsRoute(
      jsonRequest(
        "POST",
        { targetType: "thread", targetId: threadId, reason: "spam", detail: "please review" },
        member.token,
        REPORTS_URL,
      ),
    );

    expect(created.status).toBe(200);
    const report = (await created.json()) as { report: { id: string; status: string; reporterId: string } };

    expect(report.report).toMatchObject({ status: "open", reporterId: member.userId });

    const queue = await reportsQueueRoute(jsonRequest("GET", undefined, admin.token));

    expect(queue.status).toBe(200);
    const entries = ((await queue.json()) as ReportQueuePayload).entries;

    expect(entries.map((entry) => entry.report.id)).toEqual([report.report.id]);
    expect(entries[0].thread.id).toBe(threadId);

    const resolved = await resolveReportRoute(
      jsonRequest("POST", { action: "resolve", note: "hidden" }, admin.token),
      idContext(report.report.id),
    );

    expect(resolved.status).toBe(200);
    expect(
      ((await resolved.json()) as { report: { status: string; resolvedBy: string } }).report,
    ).toMatchObject({ status: "resolved", resolvedBy: admin.userId });

    const openQueue = await reportsQueueRoute(jsonRequest("GET", undefined, admin.token));

    expect(((await openQueue.json()) as ReportQueuePayload).entries).toEqual([]);
  });

  it("returns the same report on a duplicate report", async () => {
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    const first = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: threadId, reason: "spam" }, member.token, REPORTS_URL),
    );
    const second = await reportsRoute(
      jsonRequest(
        "POST",
        { targetType: "thread", targetId: threadId, reason: "harassment" },
        member.token,
        REPORTS_URL,
      ),
    );

    const firstId = ((await first.json()) as { report: { id: string } }).report.id;
    const secondBody = (await second.json()) as { report: { id: string; reason: string } };

    expect(secondBody.report.id).toBe(firstId);
    expect(secondBody.report.reason).toBe("spam");
  });

  it("returns 404 when the reported target is unknown or hidden", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");

    const unknown = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: "missing", reason: "spam" }, member.token, REPORTS_URL),
    );

    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as ErrorPayload).error.code).toBe("COMMUNITY_REPORT_TARGET_NOT_FOUND");

    const threadId = await createThreadFor(member.token);

    await moderateThreadRoute(
      jsonRequest("POST", { action: "hide" }, admin.token),
      idContext(threadId),
    );

    const hidden = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: threadId, reason: "spam" }, member.token, REPORTS_URL),
    );

    expect(hidden.status).toBe(404);
    expect(((await hidden.json()) as ErrorPayload).error.code).toBe("COMMUNITY_REPORT_TARGET_NOT_FOUND");
  });

  it("forbids a non-administrator from the queue and the triage route with 403", async () => {
    const member = await persona("01712345678");

    const queue = await reportsQueueRoute(jsonRequest("GET", undefined, member.token));

    expect(queue.status).toBe(403);
    expect(((await queue.json()) as ErrorPayload).error.code).toBe("COMMUNITY_FORBIDDEN");

    const triage = await resolveReportRoute(
      jsonRequest("POST", { action: "resolve" }, member.token),
      idContext("any-id"),
    );

    expect(triage.status).toBe(403);
    expect(((await triage.json()) as ErrorPayload).error.code).toBe("COMMUNITY_FORBIDDEN");
  });

  it("rejects an unknown triage action with 400 and an unknown report id with 404", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);
    const created = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: threadId, reason: "spam" }, member.token, REPORTS_URL),
    );
    const reportId = ((await created.json()) as { report: { id: string } }).report.id;

    const badAction = await resolveReportRoute(
      jsonRequest("POST", { action: "close" }, admin.token),
      idContext(reportId),
    );

    expect(badAction.status).toBe(400);
    expect(((await badAction.json()) as ErrorPayload).error.code).toBe("COMMUNITY_VALIDATION_FAILED");

    const missing = await resolveReportRoute(
      jsonRequest("POST", { action: "resolve" }, admin.token),
      idContext("missing"),
    );

    expect(missing.status).toBe(404);
    expect(((await missing.json()) as ErrorPayload).error.code).toBe("COMMUNITY_REPORT_NOT_FOUND");
  });

  it("queues a reply report with both the thread and the reply", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);
    const replyId = await createReplyFor(member.token, threadId);

    await reportsRoute(
      jsonRequest("POST", { targetType: "reply", targetId: replyId, reason: "harassment" }, member.token, REPORTS_URL),
    );

    const queue = await reportsQueueRoute(jsonRequest("GET", undefined, admin.token));
    const entries = ((await queue.json()) as ReportQueuePayload).entries;

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ thread: { id: threadId }, reply: { id: replyId } });
  });
});
