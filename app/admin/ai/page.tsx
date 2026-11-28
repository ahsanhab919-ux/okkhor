import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { listContentItems } from "@/src/modules/content/application/content-service";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import {
  resolveAiSummaryDriver,
  resolveSummaryModel,
  resolveSummaryProviderName,
  resolveSummaryTimeoutMs,
  type AiSummaryDriver,
  type SummaryProviderName,
} from "@/src/modules/summarization/domain/summarization-config";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Summarization | Okkhor",
  description: "The summarization provider this process resolves, and how much of the archive carries a summary.",
};

const DRIVER_LABELS: Record<AiSummaryDriver, string> = {
  auto: "Auto",
  fake: "Offline (fake)",
  gemini: "Gemini",
};

const PROVIDER_LABELS: Record<SummaryProviderName, string> = {
  fake: "Offline (fake)",
  gemini: "Gemini",
  unavailable: "Not configured",
};

/** A timeout in milliseconds as seconds when it is a whole number of them, otherwise as ms. */
function formatTimeout(ms: number): string {
  const seconds = ms / 1000;

  return Number.isInteger(seconds) ? `${seconds} second${seconds === 1 ? "" : "s"}` : `${ms} ms`;
}

/**
 * The `/admin/ai` surface — the honest reading of the Stitch "AI Content Pipeline" screen. That
 * screen is a full authoring workbench (a prompt editor, tone and complexity parameters, live
 * progress, version history, regenerate) with no backing: the product never drafts an item, and
 * nothing here can be edited, run, or persisted. What the platform genuinely does is summarize —
 * it fills each published item's Bangla summary through the `summarization` module on publish — so
 * this view reports the provider a run would resolve and the coverage that summarization has
 * actually achieved across the archive, and invents no control (`ADR-001`).
 */
export default async function AdminAiPage() {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="AI Summarization">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open the AI summarization console."
                : "Sign in with an administrator account to open the AI summarization console."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const provider = [
    { label: "Driver", value: DRIVER_LABELS[resolveAiSummaryDriver()] },
    { label: "Resolved provider", value: PROVIDER_LABELS[resolveSummaryProviderName()] },
    { label: "Model", value: resolveSummaryModel() },
    { label: "Request timeout", value: formatTimeout(resolveSummaryTimeoutMs()) },
    { label: "API key", value: process.env.GEMINI_API_KEY ? "Configured" : "Not set" },
  ];

  const items = await listContentItems();
  const published = items.filter((item) => item.status === "published");
  const summarized = published.filter((item) => item.summaryBn.trim().length > 0);
  const coveragePercent = published.length === 0 ? 0 : Math.round((summarized.length / published.length) * 100);

  const coverage = [
    { label: "Total items", value: items.length },
    { label: "Published", value: published.length },
    { label: "Drafts", value: items.length - published.length },
    { label: "With Bangla summary", value: summarized.length },
    { label: "Missing Bangla summary", value: published.length - summarized.length },
  ];

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="AI Summarization">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">AI Summarization</h1>
            <p className="page-hero__lead">
              The summarization provider this process resolves — and how much of the archive carries a
              Bangla summary. Every value is read from the running configuration and the records.
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
          <section className="config-panel" aria-label="Provider">
            <h3 className="config-panel__title">Provider</h3>
            <dl className="config-list">
              {provider.map((entry) => (
                <div key={entry.label} className="config-row">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
            <p className="config-panel__hint">
              The provider a publish would use, resolved from the summarization configuration.
            </p>
          </section>

          <section className="config-panel" aria-label="Summary coverage">
            <h3 className="config-panel__title">Summary coverage</h3>
            <div className="coverage-meter" aria-hidden="true">
              <div className="coverage-meter__fill" style={{ width: `${coveragePercent}%` }} />
            </div>
            <p className="coverage-meter__caption">
              {summarized.length} of {published.length} published items carry a Bangla summary ({coveragePercent}%).
            </p>
            <dl className="config-list">
              {coverage.map((entry) => (
                <div key={entry.label} className="config-row">
                  <dt>{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
            <p className="config-panel__hint">
              Counted from the archive. A published item always carries a summary, filled on publish.
            </p>
          </section>
        </div>

        <p className="config-note">
          This surface is read-only. The platform does not author, draft, or regenerate research — it
          summarizes on publish — so this view reports the resolved provider and the coverage, and
          offers no pipeline to run.
        </p>
      </section>
    </ProtectedWorkspaceShell>
  );
}
