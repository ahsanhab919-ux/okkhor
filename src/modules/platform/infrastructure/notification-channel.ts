import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";
import { getEmailNotificationChannel } from "@/src/modules/platform/infrastructure/email-notification-channel";
import { getLogNotificationChannel } from "@/src/modules/platform/infrastructure/log-notification-channel";
import { getSmsNotificationChannel } from "@/src/modules/platform/infrastructure/sms-notification-channel";

type NotificationChannelDriver = "auto" | "log" | "sms" | "email" | "sms+email";

function getNotificationChannelDriver(): NotificationChannelDriver {
  const driver = process.env.NOTIFICATION_CHANNEL_DRIVER;

  if (driver === "log" || driver === "sms" || driver === "email" || driver === "sms+email") {
    return driver;
  }

  return "auto";
}

/**
 * Resolves the notification channels from `NOTIFICATION_CHANNEL_DRIVER`, following the
 * `summary-provider.ts` driver precedent. `auto` uses the `log` channel under test, otherwise
 * every channel whose gateway URL is configured; when nothing is configured it falls back to the
 * `log` channel outside production, and to no channels in production so the `log` channel never
 * runs there (`password-reset-delivery-slice.md` §8, §9).
 */
export function getNotificationChannels(): NotificationChannel[] {
  const driver = getNotificationChannelDriver();

  if (driver === "log") {
    return [getLogNotificationChannel()];
  }

  if (driver === "sms") {
    return [getSmsNotificationChannel()];
  }

  if (driver === "email") {
    return [getEmailNotificationChannel()];
  }

  if (driver === "sms+email") {
    return [getSmsNotificationChannel(), getEmailNotificationChannel()];
  }

  if (process.env.NODE_ENV === "test") {
    return [getLogNotificationChannel()];
  }

  const channels: NotificationChannel[] = [];

  if (process.env.NOTIFICATION_SMS_WEBHOOK_URL) {
    channels.push(getSmsNotificationChannel());
  }

  if (process.env.NOTIFICATION_EMAIL_WEBHOOK_URL) {
    channels.push(getEmailNotificationChannel());
  }

  if (channels.length > 0) {
    return channels;
  }

  return process.env.NODE_ENV === "production" ? [] : [getLogNotificationChannel()];
}
