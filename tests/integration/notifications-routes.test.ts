import { NextRequest } from "next/server";
import { vi } from "vitest";

import { POST as resolveReportRoute } from "@/app/api/community/moderation/reports/[id]/route";
import { POST as moderateReplyRoute } from "@/app/api/community/moderation/replies/[id]/route";
import { POST as moderateThreadRoute } from "@/app/api/community/moderation/threads/[id]/route";
import { POST as reportsRoute } from "@/app/api/community/reports/route";
import { POST as createReplyRoute } from "@/app/api/community/threads/[id]/replies/route";
import { POST as createThreadRoute } from "@/app/api/community/threads/route";
import { POST as markReadRoute } from "@/app/api/notifications/[id]/read/route";
import { GET as listNotificationsRoute } from "@/app/api/notifications/route";
import { POST as markAllReadRoute } from "@/app/api/notifications/read-all/route";
import { PATCH as saveMyApplicationRoute, POST as createMyApplicationRoute } from "@/app/api/verification/application/route";
import { PATCH as decideApplicationRoute } from "@/app/api/verification/applications/[id]/route";
import { resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import type { Notification } from "@/src/modules/notifications/domain/notification-types";
import { resetNotificationStoreForTesting } from "@/src/modules/notifications/infrastructure/notification-store";
import {
  getLastNotificationMessageForTesting,
  getLogNotificationChannel,
  resetLogNotificationChannelForTesting,
} from "@/src/modules/platform/infrastructure/log-notification-channel";
import { resetVerificationStoreForTesting } from "@/src/modules/verification/infrastructure/verification-store";

const THREADS_URL = "http://localhost/api/community/threads";
const REPORTS_URL = "http://localhost/api/community/reports";
const NOTIFICATIONS_URL = "http://localhost/api/notifications";
const APPLICATION_URL = "http://localhost/api/verification/application";
const APPLICATIONS_URL = "http://localhost/api/verification/applications";

type ErrorPayload = {
  error: { code: string };
};

type NotificationListPayload = {
  notifications: Notification[];
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = NOTIFICATIONS_URL) {
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

async function listInbox(token: string) {
  const response = await listNotificationsRoute(jsonRequest("GET", undefined, token));
  const payload = (await response.json()) as NotificationListPayload;

  return { status: response.status, notifications: payload.notifications };
}

const COMPLETE_APPLICATION = {
  displayName: "Dr. Nadia Islam",
  degrees: [{ degreeType: "PhD", institution: "University of Dhaka", year: "2018" }],
  affiliations: [{ role: "Associate Professor", organization: "CRMH", since: "2021" }],
  portfolio: "Archive Cities of the Bay (2024)",
  specializations: ["history of science"],
  languages: ["bn", "en"],
};

async function submitApplicationFor(token: string) {
  const response = await createMyApplicationRoute(
    jsonRequest("POST", { ...COMPLETE_APPLICATION, status: "submitted" }, token, APPLICATION_URL),
  );

  return ((await response.json()) as { application: { id: string } }).application.id;
}

async function decideFor(token: string, applicationId: string, body: Record<string, unknown>) {
  return decideApplicationRoute(
    jsonRequest("PATCH", body, token, `${APPLICATIONS_URL}/${applicationId}`),
    idContext(applicationId),
  );
}

describe("notification routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
    resetNotificationStoreForTesting();
    resetLogNotificationChannelForTesting();
    resetVerificationStoreForTesting();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects every unauthenticated notification request with 401", async () => {
    const list = await listNotificationsRoute(jsonRequest("GET"));

    expect(list.status).toBe(401);
    expect(((await list.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");

    const readOne = await markReadRoute(jsonRequest("POST"), idContext("n1"));

    expect(readOne.status).toBe(401);
    expect(((await readOne.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");

    const readAll = await markAllReadRoute(jsonRequest("POST"));

    expect(readAll.status).toBe(401);
    expect(((await readAll.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("notifies a thread author when their thread is hidden, delivers it, and lets them read it", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Off-topic thread");

    const hidden = await moderateThreadRoute(
      jsonRequest("POST", { action: "hide", note: "off topic" }, admin.token),
      idContext(threadId),
    );

    expect(hidden.status).toBe(200);

    const inbox = await listInbox(member.token);

    expect(inbox.status).toBe(200);
    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      recipientId: member.userId,
      type: "content_hidden",
      title: "Your thread was hidden",
      href: "/community",
      dedupeKey: `content_hidden:${threadId}`,
    });
    expect(inbox.notifications[0].readAt).toBeUndefined();

    // The outbound `log` channel double recorded the same outcome.
    const delivered = getLastNotificationMessageForTesting();

    expect(delivered?.subject).toBe("Your thread was hidden");
    expect(delivered?.destination.phoneNumber).toContain("1712345678");

    const notificationId = inbox.notifications[0].id;

    const read = await markReadRoute(
      jsonRequest("POST", undefined, member.token, `${NOTIFICATIONS_URL}/${notificationId}/read`),
      idContext(notificationId),
    );
    const readBody = (await read.json()) as { notification: Notification };

    expect(read.status).toBe(200);
    expect(readBody.notification.readAt).toBeTruthy();

    const again = await markReadRoute(
      jsonRequest("POST", undefined, member.token, `${NOTIFICATIONS_URL}/${notificationId}/read`),
      idContext(notificationId),
    );

    expect(((await again.json()) as { notification: Notification }).notification.readAt).toBe(
      readBody.notification.readAt,
    );

    const afterRead = await listInbox(member.token);

    expect(afterRead.notifications[0].readAt).toBe(readBody.notification.readAt);
  });

  it("notifies a reply author when their reply is hidden", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);
    const replyId = await createReplyFor(member.token, threadId);

    await moderateReplyRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(replyId));

    const inbox = await listInbox(member.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      type: "content_hidden",
      title: "Your reply was hidden",
      href: `/community/${threadId}`,
      dedupeKey: `content_hidden:${replyId}`,
    });
    expect(getLastNotificationMessageForTesting()?.subject).toBe("Your reply was hidden");
  });

  it("notifies the reporter when their report is resolved", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Reported thread");

    const created = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: threadId, reason: "spam" }, member.token, REPORTS_URL),
    );
    const reportId = ((await created.json()) as { report: { id: string } }).report.id;

    await resolveReportRoute(
      jsonRequest("POST", { action: "resolve", note: "hidden" }, admin.token),
      idContext(reportId),
    );

    const inbox = await listInbox(member.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      type: "report_resolved",
      title: "Your report was resolved",
      href: "/community",
      dedupeKey: `report_resolved:${reportId}`,
    });
  });

  it("notifies the reporter when their report is dismissed", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Fine thread");

    const created = await reportsRoute(
      jsonRequest("POST", { targetType: "thread", targetId: threadId, reason: "spam" }, member.token, REPORTS_URL),
    );
    const reportId = ((await created.json()) as { report: { id: string } }).report.id;

    await resolveReportRoute(jsonRequest("POST", { action: "dismiss" }, admin.token), idContext(reportId));

    const inbox = await listInbox(member.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      type: "report_dismissed",
      title: "Your report was dismissed",
      dedupeKey: `report_dismissed:${reportId}`,
    });
  });

  it("creates no notification for a non-hiding thread action", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    await moderateThreadRoute(jsonRequest("POST", { action: "lock" }, admin.token), idContext(threadId));
    await moderateThreadRoute(jsonRequest("POST", { action: "unlock" }, admin.token), idContext(threadId));

    const inbox = await listInbox(member.token);

    expect(inbox.notifications).toEqual([]);
    expect(getLastNotificationMessageForTesting()).toBeUndefined();
  });

  it("does not re-notify when the same thread is hidden again", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);

    await moderateThreadRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(threadId));
    await moderateThreadRoute(jsonRequest("POST", { action: "restore" }, admin.token), idContext(threadId));
    await moderateThreadRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(threadId));

    const inbox = await listInbox(member.token);

    expect(inbox.notifications).toHaveLength(1);
  });

  it("suppresses the notification when the moderator is the author", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const threadId = await createThreadFor(admin.token, "Admin's own thread");

    await moderateThreadRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(threadId));

    const inbox = await listInbox(admin.token);

    expect(inbox.notifications).toEqual([]);
  });

  it("marks all of a member's notifications read and reports the count", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token);
    const replyId = await createReplyFor(member.token, threadId);

    await moderateThreadRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(threadId));
    await moderateReplyRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(replyId));

    const first = await markAllReadRoute(jsonRequest("POST", undefined, member.token));

    expect(first.status).toBe(200);
    expect(((await first.json()) as { updated: number }).updated).toBe(2);

    const second = await markAllReadRoute(jsonRequest("POST", undefined, member.token));

    expect(((await second.json()) as { updated: number }).updated).toBe(0);

    const inbox = await listInbox(member.token);

    expect(inbox.notifications.every((notification) => notification.readAt)).toBe(true);
  });

  it("returns 404 when marking another member's notification or an unknown id read", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const other = await persona("01798765432");
    const threadId = await createThreadFor(member.token);

    await moderateThreadRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(threadId));

    const notificationId = (await listInbox(member.token)).notifications[0].id;

    const foreign = await markReadRoute(
      jsonRequest("POST", undefined, other.token, `${NOTIFICATIONS_URL}/${notificationId}/read`),
      idContext(notificationId),
    );

    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as ErrorPayload).error.code).toBe("NOTIFICATION_NOT_FOUND");

    const missing = await markReadRoute(
      jsonRequest("POST", undefined, member.token, `${NOTIFICATIONS_URL}/missing/read`),
      idContext("missing"),
    );

    expect(missing.status).toBe(404);
    expect(((await missing.json()) as ErrorPayload).error.code).toBe("NOTIFICATION_NOT_FOUND");
  });

  it("keeps the moderation response when notification delivery fails", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const member = await persona("01712345678");
    const threadId = await createThreadFor(member.token, "Resilient thread");

    vi.spyOn(getLogNotificationChannel(), "send").mockRejectedValue(new Error("gateway down"));

    const hidden = await moderateThreadRoute(
      jsonRequest("POST", { action: "hide" }, admin.token),
      idContext(threadId),
    );

    expect(hidden.status).toBe(200);
    expect(((await hidden.json()) as { thread: { moderationState: string } }).thread.moderationState).toBe(
      "hidden",
    );

    // The notification was persisted before delivery, so the inbox still records the outcome.
    expect((await listInbox(member.token)).notifications).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("notifies the thread author and prior participants when a reply is posted, never the replier", async () => {
    const author = await persona("01710000001");
    const participant = await persona("01710000002");
    const replier = await persona("01710000003");
    const threadId = await createThreadFor(author.token, "Discuss");

    // The participant's own reply notifies the author only.
    await createReplyFor(participant.token, threadId);

    const authorAfterFirst = await listInbox(author.token);

    expect(authorAfterFirst.notifications).toHaveLength(1);
    expect(authorAfterFirst.notifications[0]).toMatchObject({
      recipientId: author.userId,
      type: "reply_posted",
      title: "New reply in a discussion you're part of",
      href: `/community/${threadId}`,
    });
    expect((await listInbox(participant.token)).notifications).toEqual([]);

    // The replier's later reply notifies the author and the prior participant, not the replier.
    const replyId = await createReplyFor(replier.token, threadId);

    expect((await listInbox(author.token)).notifications).toHaveLength(2);

    const participantInbox = await listInbox(participant.token);

    expect(participantInbox.notifications).toHaveLength(1);
    expect(participantInbox.notifications[0]).toMatchObject({
      type: "reply_posted",
      dedupeKey: `reply_posted:${replyId}`,
    });
    expect((await listInbox(replier.token)).notifications).toEqual([]);
    expect(getLastNotificationMessageForTesting()?.subject).toBe(
      "New reply in a discussion you're part of",
    );
  });

  it("notifies a member once when they are both the thread author and a prior replier", async () => {
    const author = await persona("01710000001");
    const other = await persona("01710000002");
    const threadId = await createThreadFor(author.token, "Thread");

    // The author replies to their own thread: nobody is notified.
    await createReplyFor(author.token, threadId);
    expect((await listInbox(author.token)).notifications).toEqual([]);

    // Another member replies: the author is both the thread author and a prior participant, yet is
    // notified exactly once for that reply.
    await createReplyFor(other.token, threadId);

    const inbox = await listInbox(author.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0].type).toBe("reply_posted");
  });

  it("does not notify the author of a hidden prior reply", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const author = await persona("01710000002");
    const hiddenParticipant = await persona("01710000003");
    const replier = await persona("01710000004");
    const threadId = await createThreadFor(author.token);

    const hiddenReplyId = await createReplyFor(hiddenParticipant.token, threadId);

    await moderateReplyRoute(jsonRequest("POST", { action: "hide" }, admin.token), idContext(hiddenReplyId));
    await createReplyFor(replier.token, threadId);

    // The author is notified; the hidden participant is not re-noticed about the new reply (their
    // only notification is the moderation outcome for their hidden reply).
    expect((await listInbox(author.token)).notifications.some((n) => n.type === "reply_posted")).toBe(true);

    const hiddenInbox = await listInbox(hiddenParticipant.token);

    expect(hiddenInbox.notifications.some((n) => n.type === "reply_posted")).toBe(false);
  });

  it("creates no reply notification when the reply is rejected", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const author = await persona("01710000002");
    const other = await persona("01710000003");

    const lockedThreadId = await createThreadFor(author.token, "Locked");

    await moderateThreadRoute(
      jsonRequest("POST", { action: "lock" }, admin.token),
      idContext(lockedThreadId),
    );

    const locked = await createReplyRoute(
      jsonRequest("POST", { body: "too late" }, other.token, THREADS_URL),
      idContext(lockedThreadId),
    );

    expect(locked.status).toBe(409);

    const hiddenThreadId = await createThreadFor(author.token, "Hidden");

    await moderateThreadRoute(
      jsonRequest("POST", { action: "hide" }, admin.token),
      idContext(hiddenThreadId),
    );

    const hidden = await createReplyRoute(
      jsonRequest("POST", { body: "gone" }, other.token, THREADS_URL),
      idContext(hiddenThreadId),
    );

    expect(hidden.status).toBe(404);

    const authorInbox = await listInbox(author.token);

    expect(authorInbox.notifications.some((n) => n.type === "reply_posted")).toBe(false);
  });

  it("keeps the reply response when reply notification delivery fails", async () => {
    const author = await persona("01710000001");
    const replier = await persona("01710000002");
    const threadId = await createThreadFor(author.token, "Resilient thread");

    vi.spyOn(getLogNotificationChannel(), "send").mockRejectedValue(new Error("gateway down"));

    const response = await createReplyRoute(
      jsonRequest("POST", { body: "still works" }, replier.token, THREADS_URL),
      idContext(threadId),
    );

    expect(response.status).toBe(201);
    expect(((await response.json()) as { reply: { body: string } }).reply.body).toBe("still works");

    // The notification was persisted before delivery, so the author's inbox still records it.
    expect((await listInbox(author.token)).notifications).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("notifies the applicant when their scholar application is approved, leaving the response unchanged", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const applicant = await persona("01712345678");
    const applicationId = await submitApplicationFor(applicant.token);

    const response = await decideFor(admin.token, applicationId, { status: "approved", reviewNote: "Welcome." });
    const body = (await response.json()) as { application: { status: string } };

    expect(response.status).toBe(200);
    expect(body.application.status).toBe("approved");

    const inbox = await listInbox(applicant.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      recipientId: applicant.userId,
      type: "verification_approved",
      title: "Your scholar verification was approved",
      href: "/scholar-verify",
    });
    expect(inbox.notifications[0].dedupeKey).toMatch(/^verification_approved:.+:.+$/);
    // The notification never carries the review note or the reviewer's identity.
    expect(inbox.notifications[0].body).not.toContain("Welcome.");
    expect(inbox.notifications[0].body).not.toContain(admin.userId);
    expect(getLastNotificationMessageForTesting()?.subject).toBe("Your scholar verification was approved");
  });

  it("notifies the applicant when their scholar application is rejected", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const applicant = await persona("01712345678");
    const applicationId = await submitApplicationFor(applicant.token);

    const response = await decideFor(admin.token, applicationId, { status: "rejected", reviewNote: "More evidence." });

    expect(response.status).toBe(200);

    const inbox = await listInbox(applicant.token);

    expect(inbox.notifications).toHaveLength(1);
    expect(inbox.notifications[0]).toMatchObject({
      type: "verification_rejected",
      title: "Your scholar verification was rejected",
      href: "/scholar-verify",
    });
    expect(getLastNotificationMessageForTesting()?.subject).toBe("Your scholar verification was rejected");
  });

  it("notifies again when a rejected application is edited, resubmitted, then decided", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const applicant = await persona("01712345678");
    const applicationId = await submitApplicationFor(applicant.token);

    await decideFor(admin.token, applicationId, { status: "rejected" });

    // The applicant edits and resubmits the rejected application.
    const resubmit = await saveMyApplicationRoute(
      jsonRequest("PATCH", { status: "submitted" }, applicant.token, APPLICATION_URL),
    );

    expect(resubmit.status).toBe(200);

    await decideFor(admin.token, applicationId, { status: "approved" });

    const inbox = await listInbox(applicant.token);

    expect(inbox.notifications).toHaveLength(2);
    expect(inbox.notifications.map((n) => n.type).sort()).toEqual([
      "verification_approved",
      "verification_rejected",
    ]);
  });

  it("creates no verification notification when a decision is refused", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const applicant = await persona("01712345678");

    // A draft cannot be decided → 409, so the producer never runs.
    const created = await createMyApplicationRoute(
      jsonRequest("POST", COMPLETE_APPLICATION, applicant.token, APPLICATION_URL),
    );
    const applicationId = ((await created.json()) as { application: { id: string } }).application.id;

    const response = await decideFor(admin.token, applicationId, { status: "approved" });

    expect(response.status).toBe(409);
    expect((await listInbox(applicant.token)).notifications).toEqual([]);
  });

  it("suppresses the verification notification when the reviewer is the applicant", async () => {
    const adminApplicant = await persona("01710000001", ["admin"]);
    const applicationId = await submitApplicationFor(adminApplicant.token);

    const response = await decideFor(adminApplicant.token, applicationId, { status: "approved" });

    expect(response.status).toBe(200);
    expect((await listInbox(adminApplicant.token)).notifications).toEqual([]);
  });

  it("keeps the decision response when verification notification delivery fails", async () => {
    const admin = await persona("01710000001", ["admin"]);
    const applicant = await persona("01712345678");
    const applicationId = await submitApplicationFor(applicant.token);

    vi.spyOn(getLogNotificationChannel(), "send").mockRejectedValue(new Error("gateway down"));

    const response = await decideFor(admin.token, applicationId, { status: "rejected" });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { application: { status: string } }).application.status).toBe("rejected");

    // The notification was persisted before delivery, so the applicant's inbox still records it.
    expect((await listInbox(applicant.token)).notifications).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});
