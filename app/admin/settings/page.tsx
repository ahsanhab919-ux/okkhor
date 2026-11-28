import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { AUTH_RATE_LIMITS } from "@/src/modules/identity/application/auth-rate-limit";
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  PASSWORD_RESET_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "@/src/modules/identity/domain/auth-config";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { getPlatformHighlights, getRuntimeStatus } from "@/src/modules/platform/domain/runtime-status";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Configuration | Okkhor",
  description: "The configuration this process resolves at runtime, read straight from the platform.",
};

const RATE_LIMIT_LABELS: Record<keyof typeof AUTH_RATE_LIMITS, string> = {
  login: "Sign in",
  register: "Registration",
  passwordResetRequest: "Reset request",
  passwordResetConfirm: "Reset confirmation",
};

/** A whole number of seconds as the largest unit it divides into exactly (604800 → "7 days"). */
function formatDuration(seconds: number): string {
  const units = [
    { seconds: 86_400, label: "day" },
    { seconds: 3_600, label: "hour" },
    { seconds: 60, label: "minute" },
  ] as const;

  for (const unit of units) {
    if (seconds >= unit.seconds && seconds % unit.seconds === 0) {
      const value = seconds / unit.seconds;

      return `${value} ${unit.label}${value === 1 ? "" : "s"}`;
    }
  }

  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * The `/admin/settings` surface — the Stitch "System Settings" screen, read-only. The Stitch screen
 * edits production API keys, webhook endpoints, regions, storage quotas, SSO/SAML, biometrics, and
 * automatic backups; the platform backs none of those, and it has no settings store and no settings
 * table, so this view edits nothing and persists nothing. Instead it reports the configuration the
 * process genuinely resolves — the runtime status, the session and reset-code lifetimes, and the
 * auth attempt budgets — and invents no control (`ADR-001`).
 */
export default async function AdminSettingsPage() {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="System Configuration">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open system configuration."
                : "Sign in with an administrator account to open system configuration."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const runtime = getRuntimeStatus();
  const highlights = getPlatformHighlights();

  const sessions = [
    { label: "Access token", value: formatDuration(ACCESS_TOKEN_MAX_AGE_SECONDS) },
    { label: "Refresh token", value: formatDuration(REFRESH_TOKEN_MAX_AGE_SECONDS) },
    { label: "Password reset code", value: formatDuration(PASSWORD_RESET_MAX_AGE_SECONDS) },
  ];

  const rateLimits = (Object.keys(AUTH_RATE_LIMITS) as (keyof typeof AUTH_RATE_LIMITS)[]).map((scope) => {
    const rule = AUTH_RATE_LIMITS[scope];

    return {
      label: RATE_LIMIT_LABELS[scope],
      value: `${rule.limit} per ${formatDuration(rule.windowSeconds)}`,
    };
  });

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="System Configuration">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">System Configuration</h1>
            <p className="page-hero__lead">
              The configuration this process resolves at runtime — the platform, the session lifetimes,
              and the attempt budgets. Every value is read from the running configuration.
            </p>
          </div>
          <div className="page-hero__actions">
            <Link className="inline-link" href="/admin">
              Console
            </Link>
            <span className="chip chip--outline">Read-only</span>
          </div>
        </header>

        <div className="config-grid">
          <section className="config-panel" aria-label="Runtime">
            <h3 className="config-panel__title">Runtime</h3>
            <dl className="config-list">
              <div className="config-row">
                <dt>Name</dt>
                <dd>{runtime.name}</dd>
              </div>
              <div className="config-row">
                <dt>Status</dt>
                <dd>{runtime.status}</dd>
              </div>
              <div className="config-row">
                <dt>Architecture</dt>
                <dd>{runtime.architecture}</dd>
              </div>
              <div className="config-row">
                <dt>Default locale</dt>
                <dd>{runtime.defaultLocale}</dd>
              </div>
            </dl>
            <p className="config-panel__hint">{runtime.summary}</p>
          </section>

          <section className="config-panel" aria-label="Sessions and access">
            <h3 className="config-panel__title">Sessions &amp; access</h3>
            <dl className="config-list">
              {sessions.map((entry) => (
                <div key={entry.label} className="config-row">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
            <p className="config-panel__hint">
              Token and reset-code lifetimes, from the identity module&apos;s configuration.
            </p>
          </section>

          <section className="config-panel" aria-label="Rate limiting">
            <h3 className="config-panel__title">Rate limiting</h3>
            <dl className="config-list">
              {rateLimits.map((entry) => (
                <div key={entry.label} className="config-row">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
            <p className="config-panel__hint">
              Attempt budgets per window, counted through the ephemeral store.
            </p>
          </section>

          <section className="config-panel" aria-label="Platform directives">
            <h3 className="config-panel__title">Platform directives</h3>
            <ul className="config-highlights">
              {highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </section>
        </div>

        <p className="config-note">
          This surface is read-only. The platform embeds no editable settings and persists no
          configuration, so every value above is read from the running process rather than stored.
        </p>
      </section>
    </ProtectedWorkspaceShell>
  );
}
