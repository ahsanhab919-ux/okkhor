import {
  resolveNotificationChannelKinds,
  type NotificationChannelKind,
} from "@/src/modules/platform/domain/notification-channel-config";
import type { NotificationChannel } from "@/src/modules/platform/domain/notification-types";
import { getEmailNotificationChannel } from "@/src/modules/platform/infrastructure/email-notification-channel";
import { getLogNotificationChannel } from "@/src/modules/platform/infrastructure/log-notification-channel";
import { getSmsNotificationChannel } from "@/src/modules/platform/infrastructure/sms-notification-channel";

function getChannel(kind: NotificationChannelKind): NotificationChannel {
  if (kind === "sms") {
    return getSmsNotificationChannel();
  }

  if (kind === "email") {
    return getEmailNotificationChannel();
  }

  return getLogNotificationChannel();
}

/**
 * Resolves the notification channels from `NOTIFICATION_CHANNEL_DRIVER`, following the
 * `summary-provider.ts` driver precedent. The driver and the resolved set are computed once in
 * `notification-channel-config.ts`, so the channels a send uses and the channels an admin surface
 * reports are the same list; this function only builds the transports
 * (`password-reset-delivery-slice.md` §8, §9).
 */
export function getNotificationChannels(): NotificationChannel[] {
  return resolveNotificationChannelKinds().map(getChannel);
}
