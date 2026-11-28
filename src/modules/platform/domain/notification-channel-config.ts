import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";

/**
 * The notification delivery configuration, resolved from the environment with the documented
 * defaults (`docs/configuration.md`). The defaults live here, once, and the channel selector
 * (`notification-channel.ts`) reads through these resolvers — so the channels a send uses and the
 * channels an admin surface reports are the same list.
 */

/** `auto` resolves by environment; the other values force that exact set. */
export type NotificationChannelDriver = "auto" | "log" | "sms" | "email" | "sms+email";

/** A channel's kind, matching the port's discriminant (`notification-types.ts`). */
export type NotificationChannelKind = NotificationChannel["kind"];

/**
 * `NOTIFICATION_CHANNEL_DRIVER`, or `"auto"` when it is absent or unrecognised. Mirrors the
 * `summary-provider.ts` driver precedent.
 */
export function resolveNotificationChannelDriver(): NotificationChannelDriver {
  const driver = process.env.NOTIFICATION_CHANNEL_DRIVER;

  if (driver === "log" || driver === "sms" || driver === "email" || driver === "sms+email") {
    return driver;
  }

  return "auto";
}

/**
 * The channel kinds a send would resolve *without constructing a transport*, so an admin surface
 * can report them. A forced driver returns its exact set; `auto` uses the `log` channel under test,
 * otherwise every channel whose gateway URL is configured; when nothing is configured it falls back
 * to `log` outside production, and to no channels in production so the `log` channel never runs
 * there (`password-reset-delivery-slice.md` §8, §9).
 */
export function resolveNotificationChannelKinds(): NotificationChannelKind[] {
  const driver = resolveNotificationChannelDriver();

  if (driver === "log") {
    return ["log"];
  }

  if (driver === "sms") {
    return ["sms"];
  }

  if (driver === "email") {
    return ["email"];
  }

  if (driver === "sms+email") {
    return ["sms", "email"];
  }

  if (process.env.NODE_ENV === "test") {
    return ["log"];
  }

  const kinds: NotificationChannelKind[] = [];

  if (process.env.NOTIFICATION_SMS_WEBHOOK_URL) {
    kinds.push("sms");
  }

  if (process.env.NOTIFICATION_EMAIL_WEBHOOK_URL) {
    kinds.push("email");
  }

  if (kinds.length > 0) {
    return kinds;
  }

  return process.env.NODE_ENV === "production" ? [] : ["log"];
}
