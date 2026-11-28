import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";

const DEFAULT_TIMEOUT_MS = 10000;

function resolveTimeoutMs(): number {
  const raw = Number.parseInt(process.env.NOTIFICATION_EMAIL_TIMEOUT_MS ?? "", 10);

  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function buildRequestBody(message: { destination: { email?: string }; subject: string; body: string }) {
  const from = process.env.NOTIFICATION_EMAIL_FROM;

  return {
    to: message.destination.email,
    ...(from ? { from } : {}),
    subject: message.subject,
    body: message.body,
  };
}

/**
 * The email channel: it skips silently when the destination has no email (an account email is
 * optional, `password-reset-delivery-slice.md` §5), otherwise POSTs a small JSON body to the
 * configured HTTPS gateway. A missing URL, a rejected request, or a timeout throws — the caller
 * isolates and logs the failure (§9).
 */
export function createEmailNotificationChannel(): NotificationChannel {
  return {
    kind: "email",
    async send(message) {
      if (!message.destination.email) {
        return;
      }

      const url = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL;

      if (!url) {
        throw new Error("Email notifications are not configured: set NOTIFICATION_EMAIL_WEBHOOK_URL.");
      }

      const apiKey = process.env.NOTIFICATION_EMAIL_API_KEY;
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
          throw new Error(`The email gateway rejected the request (${response.status}).`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("The email gateway timed out.");
        }

        if (error instanceof Error) {
          throw error;
        }

        throw new Error("The email gateway could not be reached.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let channel: NotificationChannel | undefined;

export function getEmailNotificationChannel(): NotificationChannel {
  channel ??= createEmailNotificationChannel();

  return channel;
}

export function resetEmailNotificationChannelForTesting() {
  channel = undefined;
}
