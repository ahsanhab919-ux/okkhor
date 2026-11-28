import type { NotificationChannel, NotificationMessage } from "@/src/modules/platform/domain/notification-types";

declare global {
  var __okkhorLastNotificationMessage: NotificationMessage | undefined;
}

/**
 * The development/test channel. It does not call a gateway; it records the last message on
 * `globalThis` so unit and integration tests can assert delivery without a network call, and it
 * logs the message. This is the only channel that surfaces a reset code, and only outside
 * production (`password-reset-delivery-slice.md` §6, §9).
 */
export function createLogNotificationChannel(): NotificationChannel {
  return {
    kind: "log",
    async send(message) {
      globalThis.__okkhorLastNotificationMessage = message;
      console.info(`[notification:log] ${message.destination.phoneNumber} :: ${message.body}`);
    },
  };
}

let channel: NotificationChannel | undefined;

export function getLogNotificationChannel(): NotificationChannel {
  channel ??= createLogNotificationChannel();

  return channel;
}

/** The most recent message the `log` channel recorded, or `undefined`. Test-only. */
export function getLastNotificationMessageForTesting(): NotificationMessage | undefined {
  return globalThis.__okkhorLastNotificationMessage;
}

export function resetLogNotificationChannelForTesting() {
  channel = undefined;
  globalThis.__okkhorLastNotificationMessage = undefined;
}
