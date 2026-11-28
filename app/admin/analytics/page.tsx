import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { listDistinctCategories } from "@/src/modules/community/application/community-service";
import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { listContentItems, listDistinctPublishedTags } from "@/src/modules/content/application/content-service";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { listApplicationsForReview } from "@/src/modules/verification/application/verification-service";
import type { VerificationStatus } from "@/src/modules/verification/domain/verification-types";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics & Insights | Okkhor",
  description: "The composition of the archive, the community, and the verification record.",
};

const APPLICATION_STATUSES: readonly VerificationStatus[] = ["draft", "submitted", "approved", "rejected"];

/**
 * The share of `value` against the largest value in its distribution, as a whole percentage. The
 * distribution sets its own scale, so the longest bar is always full width.
 */
function shareOf(value: number, max: number): number {
  return max === 0 ? 0 : Math.round((value / max) * 100);
}

/**
 * The `/admin/analytics` view — the Stitch "Analytics & Insights" ("Intelligence Canvas") screen,
 * adapted to what the domain actually holds. The Stitch screen charts course churn, conversion
 * funnels, and enrollment cohorts; none of those records exist here, so this view shows the real
 * distributions instead — research by topic, threads by category, and applications by status — and
 * invents nothing (`ADR-001`).
 */
export default async function AdminAnalyticsPage() {
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Analytics & Insights">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open analytics."
                : "Sign in with an administrator account to open analytics."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const [items, topics, categories, applications] = await Promise.all([
    listContentItems(),
    listDistinctPublishedTags(),
    listDistinctCategories(),
    listApplicationsForReview(viewer.actor),
  ]);

  const published = items.filter((item) => item.status === "published").length;
  const statusCounts = APPLICATION_STATUSES.map((status) => ({
    status,
    count: applications.filter((application) => application.status === status).length,
  }));

  const topicMax = topics.reduce((max, topic) => Math.max(max, topic.count), 0);
  const categoryMax = categories.reduce((max, category) => Math.max(max, category.count), 0);
  const statusMax = statusCounts.reduce((max, entry) => Math.max(max, entry.count), 0);

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Analytics & Insights">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">Intelligence Canvas</h1>
            <p className="page-hero__lead">
              How the archive, the community, and the verification record are composed. Every figure is
              counted from the records themselves.
            </p>
          </div>
          <div className="page-hero__actions">
            <span className="page-hero__count">
              <strong>{items.length + applications.length}</strong>
              <span>Records</span>
            </span>
          </div>
        </header>

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Composition</p>
              <h2>Research by topic</h2>
            </div>
            <p>
              {topics.length} topics · {published} published items
            </p>
          </div>
          {topics.length === 0 ? (
            <p>No published research has been tagged yet.</p>
          ) : (
            <ul className="meter-list">
              {topics.map((topic) => (
                <li key={topic.tag} className="meter-row">
                  <Link className="meter-row__label" href={`/tags/${encodeURIComponent(topic.tag)}`}>
                    {topic.tag}
                  </Link>
                  <span className="meter-row__bar">
                    <span style={{ width: `${shareOf(topic.count, topicMax)}%` }} />
                  </span>
                  <span className="meter-row__value">{topic.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Composition</p>
              <h2>Visible threads by category</h2>
            </div>
            <p>
              {categories.length} categories · {categories.reduce((total, entry) => total + entry.count, 0)}{" "}
              visible threads
            </p>
          </div>
          {categories.length === 0 ? (
            <p>No discussions have been started yet.</p>
          ) : (
            <ul className="meter-list">
              {categories.map((entry) => (
                <li key={entry.category} className="meter-row">
                  <Link
                    className="meter-row__label"
                    href={`/categories/${encodeURIComponent(entry.category)}`}
                  >
                    {entry.category}
                  </Link>
                  <span className="meter-row__bar">
                    <span style={{ width: `${shareOf(entry.count, categoryMax)}%` }} />
                  </span>
                  <span className="meter-row__value">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="topic-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Review</p>
              <h2>Applications by status</h2>
            </div>
            <p>{applications.length} applications</p>
          </div>
          {applications.length === 0 ? (
            <p>No verification applications have been started yet.</p>
          ) : (
            <ul className="meter-list">
              {statusCounts.map((entry) => (
                <li key={entry.status} className="meter-row">
                  <span className="meter-row__label">{entry.status}</span>
                  <span className="meter-row__bar">
                    <span style={{ width: `${shareOf(entry.count, statusMax)}%` }} />
                  </span>
                  <span className="meter-row__value">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </ProtectedWorkspaceShell>
  );
}
