import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import {
  listDistinctCategories,
  listModerationReports,
} from "@/src/modules/community/application/community-service";
import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { listContentItems } from "@/src/modules/content/application/content-service";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { listApplicationsForReview } from "@/src/modules/verification/application/verification-service";

import { getCommunityViewer } from "../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Overview | Okkhor",
  description: "The administrator overview of the archive, the community, and the review queues.",
};

/**
 * The `/admin` overview — the Stitch "Dashboard Overview" landing page for the console. It is a
 * leaf route, so it renders its own `ProtectedWorkspaceShell` rather than nesting a second shell
 * inside the sibling `/admin/community` and `/admin/verifications` layouts. Every figure is
 * counted from the records the gated queues already read, so nothing decorative is invented
 * (`ADR-001`).
 */
export default async function AdminOverviewPage() {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="System Overview">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open the console."
                : "Sign in with an administrator account to open the console."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const [items, categories, reports, applications] = await Promise.all([
    listContentItems(),
    listDistinctCategories(),
    listModerationReports(viewer.actor, { limit: 50 }),
    listApplicationsForReview(viewer.actor),
  ]);

  const published = items.filter((item) => item.status === "published").length;
  const visibleThreads = categories.reduce((total, category) => total + category.count, 0);
  const countByStatus = (status: string) =>
    applications.filter((application) => application.status === status).length;
  const awaitingReview = countByStatus("submitted");

  const metrics = [
    { label: "Published research", value: published },
    { label: "Draft research", value: items.length - published },
    { label: "Visible threads", value: visibleThreads },
    { label: "Categories", value: categories.length },
    { label: "Open reports", value: reports.length },
    { label: "Awaiting review", value: awaitingReview },
    { label: "Approved scholars", value: countByStatus("approved") },
    { label: "Rejected applications", value: countByStatus("rejected") },
  ];

  const queues = [
    {
      href: "/admin/community",
      label: "Community queue",
      count: visibleThreads,
      unit: "visible threads",
    },
    {
      href: "/admin/community/reports",
      label: "Report queue",
      count: reports.length,
      unit: "open",
    },
    {
      href: "/admin/verifications",
      label: "Scholar queue",
      count: awaitingReview,
      unit: "awaiting review",
    },
  ];

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="System Overview">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">System Overview</h1>
            <p className="page-hero__lead">
              The state of the archive, the community, and the review queues in one place. Every figure
              is counted from the records the queues below already read.
            </p>
          </div>
          <div className="page-hero__actions">
            <Link className="inline-link" href="/admin/content">
              Content
            </Link>
            <Link className="inline-link" href="/admin/analytics">
              Analytics
            </Link>
            <Link className="inline-link" href="/admin/scholars">
              Scholars
            </Link>
            <Link className="inline-link" href="/admin/users">
              Users
            </Link>
            <Link className="inline-link" href="/admin/settings">
              Settings
            </Link>
            <Link className="inline-link" href="/admin/ai">
              AI
            </Link>
            <Link className="inline-link" href="/admin/communications">
              Communications
            </Link>
            <span className="page-hero__count">
              <strong>{awaitingReview}</strong>
              <span>To review</span>
            </span>
          </div>
        </header>

        <h2 className="topic-section__heading">At a glance</h2>
        <div className="stats-grid">
          {metrics.map((metric) => (
            <div key={metric.label} className="stat-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>

        <div className="topic-section">
          <h2 className="topic-section__heading">Queues</h2>
          <ul className="topic-grid">
            {queues.map((queue) => (
              <li key={queue.href} className="topic-card">
                <Link className="topic-card__link" href={queue.href}>
                  {queue.label}
                </Link>
                <span className="topic-card__count">
                  {queue.count} {queue.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </ProtectedWorkspaceShell>
  );
}
