import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";

const DEFAULT_TIMEOUT_MS = 10000;

function resolveTimeoutMs(): number {
  const raw = Number.parseInt(process.env.NOTIFICATION_SMS_TIMEOUT_MS ?? "", 10);

  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function buildRequestBody(message: { destination: { phoneNumber: string }; body: string }) {
  const sender = process.env.NOTIFICATION_SMS_SENDER;

  return {
    to: message.destination.phoneNumber,
    ...(sender ? { sender } : {}),
    body: message.body,
  };
}

/**
 * The SMS channel: it POSTs a small JSON body to the configured HTTPS gateway, mirroring
 * `gemini-summary-provider.ts` (no vendor SDK, no new dependency). A missing URL, a rejected
 * request, or a timeout throws — the caller isolates and logs the failure
 * (`password-reset-delivery-slice.md` §9).
 */
export function createSmsNotificationChannel(): NotificationChannel {
  return {
    kind: "sms",
    async send(message) {
      const url = process.env.NOTIFICATION_SMS_WEBHOOK_URL;

      if (!url) {
        throw new Error("SMS notifications are not configured: set NOTIFICATION_SMS_WEBHOOK_URL.");
      }

      const apiKey = process.env.NOTIFICATION_SMS_API_KEY;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify(buildRequestBody(message)),
        });

        if (!response.ok) {
          throw new Error(`The SMS gateway rejected the request (${response.status}).`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("The SMS gateway timed out.");
        }

        if (error instanceof Error) {
          throw error;
        }

        throw new Error("The SMS gateway could not be reached.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let channel: NotificationChannel | undefined;

export function getSmsNotificationChannel(): NotificationChannel {
  channel ??= createSmsNotificationChannel();

  return channel;
}

export function resetSmsNotificationChannelForTesting() {
  channel = undefined;
}
