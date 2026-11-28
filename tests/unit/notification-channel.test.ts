import { vi } from "vitest";

import type { NotificationMessage } from "@/src/modules/platform/domain/notification-types";
import { createEmailNotificationChannel } from "@/src/modules/platform/infrastructure/email-notification-channel";
import {
  getLastNotificationMessageForTesting,
  getLogNotificationChannel,
  resetLogNotificationChannelForTesting,
} from "@/src/modules/platform/infrastructure/log-notification-channel";
import { getNotificationChannels } from "@/src/modules/platform/infrastructure/notification-channel";
import {
  createSmsNotificationChannel,
  resetSmsNotificationChannelForTesting,
} from "@/src/modules/platform/infrastructure/sms-notification-channel";

const message: NotificationMessage = {
  destination: { phoneNumber: "+8801712345678", email: "member@example.com" },
  subject: "Your Okkhor password reset code",
  body: "Your Okkhor password reset code is 123456. It expires in 15 minutes.",
};

function kinds() {
  return getNotificationChannels().map((channel) => channel.kind);
}

describe("notification channel selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("forces the log channel", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "log");

    expect(kinds()).toEqual(["log"]);
  });

  it("forces the sms channel", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "sms");

    expect(kinds()).toEqual(["sms"]);
  });

  it("forces the email channel", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "email");

    expect(kinds()).toEqual(["email"]);
  });

  it("fans out to both channels for sms+email", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "sms+email");

    expect(kinds()).toEqual(["sms", "email"]);
  });

  it("uses the log channel under test for auto", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "auto");
    vi.stubEnv("NODE_ENV", "test");

    expect(kinds()).toEqual(["log"]);
  });

  it("uses every configured gateway outside test for auto", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "auto");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "https://mail.example/send");

    expect(kinds()).toEqual(["sms", "email"]);
  });

  it("falls back to the log channel outside production when nothing is configured", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "auto");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "");
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "");

    expect(kinds()).toEqual(["log"]);
  });

  it("resolves to no channel in production when nothing is configured", () => {
    vi.stubEnv("NOTIFICATION_CHANNEL_DRIVER", "auto");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "");
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "");

    expect(getNotificationChannels()).toEqual([]);
  });
});

describe("log notification channel", () => {
  beforeEach(() => {
    resetLogNotificationChannelForTesting();
  });

  it("records the last message for tests", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    await getLogNotificationChannel().send(message);

    expect(getLastNotificationMessageForTesting()).toEqual(message);
  });
});

describe("sms notification channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetSmsNotificationChannelForTesting();
  });

  it("posts the body and bearer credential to the gateway", async () => {
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubEnv("NOTIFICATION_SMS_API_KEY", "secret-key");
    vi.stubEnv("NOTIFICATION_SMS_SENDER", "Okkhor");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createSmsNotificationChannel().send(message);

    const init = fetchMock.mock.calls[0][1] as RequestInit;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sms.example/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer secret-key",
        }),
      }),
    );
    expect(JSON.parse(String(init.body))).toEqual({
      to: "+8801712345678",
      sender: "Okkhor",
      body: message.body,
    });
  });

  it("throws when the gateway is not configured", async () => {
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "");

    await expect(createSmsNotificationChannel().send(message)).rejects.toThrow(/not configured/i);
  });

  it("surfaces a rejected request as a send failure", async () => {
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })));

    await expect(createSmsNotificationChannel().send(message)).rejects.toThrow(/rejected the request \(502\)/);
  });

  it("surfaces a timeout as a send failure", async () => {
    vi.stubEnv("NOTIFICATION_SMS_WEBHOOK_URL", "https://sms.example/send");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );

    await expect(createSmsNotificationChannel().send(message)).rejects.toThrow(/timed out/i);
  });
});

describe("email notification channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("skips a destination without an email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await createEmailNotificationChannel().send({
      ...message,
      destination: { phoneNumber: "+8801712345678" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the subject and body to the gateway", async () => {
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "https://mail.example/send");
    vi.stubEnv("NOTIFICATION_EMAIL_API_KEY", "mail-key");
    vi.stubEnv("NOTIFICATION_EMAIL_FROM", "no-reply@okkhor.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createEmailNotificationChannel().send(message);

    const init = fetchMock.mock.calls[0][1] as RequestInit;

    expect(fetchMock).toHaveBeenCalledWith(
      "https://mail.example/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer mail-key" }),
      }),
    );
    expect(JSON.parse(String(init.body))).toEqual({
      to: "member@example.com",
      from: "no-reply@okkhor.test",
      subject: message.subject,
      body: message.body,
    });
  });

  it("throws when the gateway is not configured but an email is present", async () => {
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "");

    await expect(createEmailNotificationChannel().send(message)).rejects.toThrow(/not configured/i);
  });

  it("surfaces a timeout as a send failure", async () => {
    vi.stubEnv("NOTIFICATION_EMAIL_WEBHOOK_URL", "https://mail.example/send");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );

    await expect(createEmailNotificationChannel().send(message)).rejects.toThrow(/timed out/i);
  });
});
