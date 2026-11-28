import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/src/modules/notifications/application/notification-service";
import { NotificationError } from "@/src/modules/notifications/domain/notification-errors";
import {
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  MAX_NOTIFICATION_PAGE_SIZE,
  listNotificationsSchema,
} from "@/src/modules/notifications/domain/notification-schemas";
import type {
  CreateNotificationInput,
  NotificationActor,
} from "@/src/modules/notifications/domain/notification-types";
import {
  getMemoryNotificationRepository,
  resetNotificationStoreForTesting,
} from "@/src/modules/notifications/infrastructure/notification-store";
import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";

const channelState = vi.hoisted(() => ({ channels: [] as NotificationChannel[] }));

vi.mock("@/src/modules/platform/infrastructure/notification-channel", () => ({
  getNotificationChannels: () => channelState.channels,
}));

const member: NotificationActor = { id: "u-member" };
const other: NotificationActor = { id: "u-other" };

function captureChannel() {
  const send = vi.fn().mockResolvedValue(undefined);

  return { channel: { kind: "log", send } as NotificationChannel, send };
}

function input(overrides: Partial<CreateNotificationInput> = {}): CreateNotificationInput {
  return {
    recipientId: member.id,
    type: "content_hidden",
    title: "Your reply was hidden",
    body: "An administrator hid your reply in a community discussion.",
    href: "/community/thread-1",
    dedupeKey: "content_hidden:reply-1",
    ...overrides,
  };
}

describe("notifications schemas", () => {
  it("clamps the inbox limit and never fails a parse", () => {
    expect(listNotificationsSchema.parse({}).limit).toBe(DEFAULT_NOTIFICATION_PAGE_SIZE);
    expect(listNotificationsSchema.parse({ limit: undefined }).limit).toBe(DEFAULT_NOTIFICATION_PAGE_SIZE);
    expect(listNotificationsSchema.parse({ limit: 5 }).limit).toBe(5);
    expect(listNotificationsSchema.parse({ limit: 0 }).limit).toBe(DEFAULT_NOTIFICATION_PAGE_SIZE);
    expect(listNotificationsSchema.parse({ limit: -3 }).limit).toBe(DEFAULT_NOTIFICATION_PAGE_SIZE);
    expect(listNotificationsSchema.parse({ limit: 999 }).limit).toBe(MAX_NOTIFICATION_PAGE_SIZE);
    expect(listNotificationsSchema.parse({ limit: "7.9" }).limit).toBe(7);
  });
});

describe("notification service", () => {
  beforeEach(() => {
    resetNotificationStoreForTesting();
    channelState.channels = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("persists and delivers a created notification", async () => {
    const { channel, send } = captureChannel();
    channelState.channels = [channel];

    const result = await createNotification(
      input({ destination: { phoneNumber: "+8801712345678", email: "member@example.com" } }),
    );

    expect(result.created).toBe(true);
    expect(result.notification).toMatchObject({
      recipientId: member.id,
      type: "content_hidden",
      dedupeKey: "content_hidden:reply-1",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      destination: { phoneNumber: "+8801712345678", email: "member@example.com" },
      subject: "Your reply was hidden",
      body: "An administrator hid your reply in a community discussion.",
    });
    expect(await listNotifications(member)).toHaveLength(1);
  });

  it("is idempotent on (recipientId, dedupeKey) and never re-sends", async () => {
    const { channel, send } = captureChannel();
    channelState.channels = [channel];

    const first = await createNotification(input({ destination: { phoneNumber: "+8801" } }));
    const second = await createNotification(
      input({ title: "Different title", destination: { phoneNumber: "+8801" } }),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await listNotifications(member)).toHaveLength(1);
  });

  it("delivers only when a destination is resolved", async () => {
    const { channel, send } = captureChannel();
    channelState.channels = [channel];

    const result = await createNotification(input());

    expect(result.created).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("logs and does not throw when no channel is configured", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    channelState.channels = [];

    const result = await createNotification(input({ destination: { phoneNumber: "+8801" } }));

    expect(result.created).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("swallows a channel failure so the row still stands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    channelState.channels = [{ kind: "sms", send: vi.fn().mockRejectedValue(new Error("gateway down")) }];

    const result = await createNotification(input({ destination: { phoneNumber: "+8801" } }));

    expect(result.created).toBe(true);
    expect(await listNotifications(member)).toHaveLength(1);
  });

  it("stores and delivers a reply_posted notification, one row per recipient per reply", async () => {
    const { channel, send } = captureChannel();
    channelState.channels = [channel];

    const reply = input({
      type: "reply_posted",
      title: "New reply in a discussion you're part of",
      body: "Someone replied to a community thread you're part of. Open it to catch up.",
      href: "/community/thread-1",
      dedupeKey: "reply_posted:reply-9",
      destination: { phoneNumber: "+8801" },
    });

    const first = await createNotification(reply);
    const sameRecipientAgain = await createNotification(reply);
    const otherRecipient = await createNotification({ ...reply, recipientId: other.id });

    expect(first.created).toBe(true);
    expect(first.notification.type).toBe("reply_posted");
    expect(sameRecipientAgain.created).toBe(false);
    expect(otherRecipient.created).toBe(true);
    expect(await listNotifications(member)).toHaveLength(1);
    expect(await listNotifications(other)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keys a verification notification on the decision, so a re-decision notifies again", async () => {
    const { channel, send } = captureChannel();
    channelState.channels = [channel];

    const firstDecision = input({
      type: "verification_rejected",
      title: "Your scholar verification was rejected",
      body: "An administrator reviewed your scholar verification and did not approve it. You can update and resubmit your application.",
      href: "/scholar-verify",
      dedupeKey: "verification_rejected:app-1:2026-07-01T00:00:00.000Z",
      destination: { phoneNumber: "+8801" },
    });

    const first = await createNotification(firstDecision);
    const retried = await createNotification(firstDecision);
    // The same application decided again at a later time is a new decision → a new row.
    const reDecided = await createNotification({
      ...firstDecision,
      dedupeKey: "verification_rejected:app-1:2026-08-01T00:00:00.000Z",
    });

    expect(first.created).toBe(true);
    expect(first.notification.type).toBe("verification_rejected");
    expect(retried.created).toBe(false);
    expect(reDecided.created).toBe(true);
    expect(reDecided.notification.id).not.toBe(first.notification.id);
    expect(await listNotifications(member)).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("lists only the member's notifications, newest first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      await createNotification(input({ dedupeKey: "a" }));
      vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
      await createNotification(input({ dedupeKey: "b" }));
      await createNotification(input({ recipientId: other.id, dedupeKey: "c" }));

      const list = await listNotifications(member);

      expect(list.map((notification) => notification.dedupeKey)).toEqual(["b", "a"]);
      expect(list.every((notification) => notification.recipientId === member.id)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks one read idempotently and rejects a foreign id", async () => {
    const { notification } = await createNotification(input());

    const read = await markNotificationRead(member, notification.id);

    expect(read.readAt).toBeTruthy();

    const again = await markNotificationRead(member, notification.id);

    expect(again.readAt).toBe(read.readAt);

    const foreign = await createNotification(input({ recipientId: other.id, dedupeKey: "other" }));

    await expect(markNotificationRead(member, foreign.notification.id)).rejects.toMatchObject({
      code: "NOTIFICATION_NOT_FOUND",
      status: 404,
    });
    await expect(markNotificationRead(member, "missing")).rejects.toBeInstanceOf(NotificationError);
  });

  it("marks all read and returns the count, then zero on a repeat", async () => {
    await createNotification(input({ dedupeKey: "a" }));
    await createNotification(input({ dedupeKey: "b" }));
    await createNotification(input({ recipientId: other.id, dedupeKey: "c" }));

    expect(await markAllNotificationsRead(member)).toBe(2);
    expect(await markAllNotificationsRead(member)).toBe(0);
    expect((await listNotifications(member)).every((notification) => notification.readAt)).toBe(true);
  });
});

describe("notifications memory repository", () => {
  beforeEach(() => {
    resetNotificationStoreForTesting();
  });

  it("creates idempotently on (recipientId, dedupeKey)", async () => {
    const repository = getMemoryNotificationRepository();

    const first = await repository.createNotification({
      id: "n-1",
      recipientId: "u-1",
      type: "content_hidden",
      title: "First",
      body: "First body",
      href: "/community",
      dedupeKey: "same-key",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const again = await repository.createNotification({
      id: "n-2",
      recipientId: "u-1",
      type: "content_hidden",
      title: "Second",
      body: "Second body",
      href: "/community",
      dedupeKey: "same-key",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.notification.id).toBe("n-1");
    expect(await repository.listNotifications("u-1", { limit: 10 })).toHaveLength(1);
  });
});
