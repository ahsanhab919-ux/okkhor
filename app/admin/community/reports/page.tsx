import Link from "next/link";
import React from "react";

import { listModerationReports } from "@/src/modules/community/application/community-service";
import { ModerationControls } from "@/src/modules/community/ui/moderation-controls";
import { ReportTriageControls } from "@/src/modules/community/ui/report-triage-controls";

import { getCommunityViewer } from "../../../community-session";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  misinformation: "Misinformation",
  "off-topic": "Off topic",
  other: "Other",
};

function excerpt(body: string) {
  return body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body;
}

/**
 * The report queue: open reports, newest first, each with the reported content. The layout already
 * restricts this route to administrators, so the use case here is the second line of defence
 * (`ADR-001`). The reporter is named here — it is a moderator-only surface (`member-reporting-slice.md`
 * §7).
 */
export default async function AdminCommunityReportsPage() {
  const viewer = await getCommunityViewer();
  const entries = viewer ? await listModerationReports(viewer.actor, { limit: 50 }) : [];

  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Moderation</p>
          <h1 className="page-hero__title">Report Queue</h1>
          <p className="page-hero__lead">
            Open member reports, newest first, each with the reported content and the inline moderation
            controls.
          </p>
        </div>
        <div className="page-hero__actions">
          <Link className="inline-link" href="/admin/community">
            Back to the queue
          </Link>
          <span className="page-hero__count">
            <strong>{entries.length}</strong>
            <span>Open</span>
          </span>
        </div>
      </header>

      {entries.length === 0 ? (
        <p>No open reports.</p>
      ) : (
        <section className="discussion-list">
          {entries.map(({ report, thread, reply }) => (
            <article key={report.id} className="discussion-card">
              <div className="discussion-card__body">
                <div className="discussion-card__meta">
                  <span className="pill">{REASON_LABELS[report.reason] ?? report.reason}</span>
                  <span className="pill">{reply ? "Reply" : "Thread"}</span>
                  <span>Reported {report.createdAt.slice(0, 10)}</span>
                </div>

                <h3>
                  <Link className="inline-link" href={`/admin/community/${thread.id}`}>
                    {thread.title}
                  </Link>
                </h3>

                <p>{excerpt(reply ? reply.body : thread.body)}</p>
                {report.detail ? <p>Report detail: {report.detail}</p> : null}
                <p>Reported by {report.reporterId}</p>

                {reply ? (
                  <ModerationControls
                    id={reply.id}
                    moderationState={reply.moderationState}
                    target="reply"
                  />
                ) : (
                  <ModerationControls
                    id={thread.id}
                    locked={thread.locked}
                    moderationState={thread.moderationState}
                    target="thread"
                  />
                )}

                <ReportTriageControls reportId={report.id} />
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
