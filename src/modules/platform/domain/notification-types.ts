/**
 * The notification port lives in `platform` — the leaf dependency for cross-cutting
 * infrastructure — so a domain module (today `identity`) can deliver a message without importing
 * a transport, and `platform` stays free of any domain type
 * (`password-reset-delivery-slice.md` §5, §8).
 */

/**
 * The recipient's contact points. SMS reaches `phoneNumber`; email reaches `email` when it is
 * present. A channel skips itself silently when the contact point it needs is missing.
 */
export type NotificationDestination = {
  phoneNumber: string;
  email?: string;
};

/** A single outbound message. The port carries text and contact points, never a domain entity. */
export type NotificationMessage = {
  destination: NotificationDestination;
  subject: string;
  body: string;
};

/** The swappable delivery backend. `kind` lets the driver selector and tests tell channels apart. */
export type NotificationChannel = {
  kind: "sms" | "email" | "log";
  send(message: NotificationMessage): Promise<void>;
};
