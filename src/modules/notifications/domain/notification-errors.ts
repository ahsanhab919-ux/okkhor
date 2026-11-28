export type NotificationErrorCode = "NOTIFICATION_NOT_FOUND";

export class NotificationError extends Error {
  constructor(
    message: string,
    public readonly code: NotificationErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NotificationError";
  }
}
