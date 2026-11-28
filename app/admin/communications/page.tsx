import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import type { NotificationType } from "@/src/modules/notifications/domain/notification-types";
import {
  resolveNotificationChannelDriver,
  resolveNotificationChannelKinds,
  type NotificationChannelDriver,
  type NotificationChannelKind,
} from "@/src/modules/platform/domain/notification-channel-config";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Communications | Okkhor",
  description: "The delivery channels a notification resolves to, and the outcomes the platform sends members.",
};

const DRIVER_LABELS: Record<NotificationChannelDriver, string> = {
  auto: "Auto",
  log: "Log (server console)",
  sms: "SMS",
  email: "Email",
  "sms+email": "SMS and email",
};

const CHANNEL_LABELS: Record<NotificationChannelKind, string> = {
  log: "Log",
  sms: "SMS",
  email: "Email",
};

/** The resolved channels as a readable list — "None" when a send would reach no channel. */
function formatChannels(kinds: NotificationChannelKind[]): string {
  return kinds.length === 0 ? "None" : kinds.map((kind) => CHANNEL_LABELS[kind]).join(", ");
}

/**
 * Every outcome the platform produces, keyed by the `NotificationType` it records — so a new type
 * is a compile error here until it is described. Each row is the member-facing outcome, never a copy
 * of moderator- or reporter-only data (`notifications-slice.md` §5, §7).
 */
const OUTCOMES: Record<NotificationType, { label: string; description: string }> = {
  content_hidden: {
    label: "Content hidden",
    description: "A member's thread or reply was hidden by a moderator.",
  },
  report_resolved: {
    label: "Report resolved",
    description: "A report a member filed was resolved.",
  },
  report_dismissed: {
    label: "Report dismissed",
    description: "A report a member filed was dismissed.",
  },
  reply_posted: {
    label: "New reply",
    description: "A new reply was posted in a thread the member is part of.",
  },
  verification_approved: {
    label: "Verification approved",
    description: "A member's scholar verification was approved.",
  },
  verification_rejected: {
    label: "Verification rejected",
    description: "A member's scholar verification was rejected.",
  },
};

/**
 * The `/admin/communications` surface — the honest reading of the Stitch "Communications" screen.
 * That screen is a "Broadcast Center": a segmented composer (title, body, target segment, delivery
 * channel, live preview, send) over a communication history table. The product backs none of it —
 * there is no broadcast, no segment, and no composer, and members are notified only about outcomes
 * that touch them. What the platform genuinely does is deliver individual outcome notifications
 * through the `notifications` module, so this view reports the channels a send would resolve to and
 * the outcomes the platform produces, and invents no message to compose (`ADR-001`).
 */
export default async function AdminCommunicationsPage() {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Communications">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open the communications console."
                : "Sign in with an administrator account to open the communications console."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const kinds = resolveNotificationChannelKinds();

  const delivery = [
    { label: "Driver", value: DRIVER_LABELS[resolveNotificationChannelDriver()] },
    { label: "Resolved channels", value: formatChannels(kinds) },
    { label: "Channel count", value: String(kinds.length) },
    { label: "SMS gateway", value: process.env.NOTIFICATION_SMS_WEBHOOK_URL ? "Configured" : "Not set" },
    { label: "Email gateway", value: process.env.NOTIFICATION_EMAIL_WEBHOOK_URL ? "Configured" : "Not set" },
  ];

  const outcomes = Object.values(OUTCOMES);

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Communications">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">Communications</h1>
            <p className="page-hero__lead">
              The channels a member notification would resolve to, and the outcomes the platform sends.
              Every value is read from the running configuration and the notification records.
            </p>
          </div>
          <div className="page-hero__actions">
            <Link className="inline-link" href="/admin">
              Console
            </Link>
            <Link className="inline-link" href="/admin/settings">
              Settings
            </Link>
            <span className="chip chip--outline">Read-only</span>
          </div>
        </header>

        <div className="config-grid">
          <section className="config-panel" aria-label="Delivery channels">
            <h3 className="config-panel__title">Delivery channels</h3>
            <dl className="config-list">
              {delivery.map((entry) => (
                <div key={entry.label} className="config-row">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
            <p className="config-panel__hint">
              The channels a send would use, resolved from the notification configuration.
            </p>
          </section>

          <section className="config-panel" aria-label="Member outcomes">
            <h3 className="config-panel__title">Member outcomes</h3>
            <ul className="outcome-list">
              {outcomes.map((outcome) => (
                <li key={outcome.label} className="outcome-item">
                  <span className="outcome-item__label">{outcome.label}</span>
                  <span className="outcome-item__desc">{outcome.description}</span>
                </li>
              ))}
            </ul>
            <p className="config-panel__hint">
              The notifications the platform sends members. Each is recorded in the recipient&apos;s inbox
              and, when a contact point is on file, delivered through the channels above.
            </p>
          </section>
        </div>

        <p className="config-note">
          This surface is read-only. The platform has no broadcast or segment composer — members are
          notified individually about the outcomes that touch them — so this view reports the delivery
          channels and the outcomes, and offers no message to send.
        </p>
      </section>
    </ProtectedWorkspaceShell>
  );
}
