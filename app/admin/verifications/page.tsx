import Link from "next/link";
import React from "react";

import { listApplicationsForReview } from "@/src/modules/verification/application/verification-service";

import { getVerificationViewer } from "../../verification-session";

export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  const viewer = await getVerificationViewer();
  const applications = viewer ? await listApplicationsForReview(viewer.actor, "submitted") : [];

  return (
    <section className="content-band">
      <header className="page-hero">
        <div>
          <p className="eyebrow eyebrow--blue">Review</p>
          <h1 className="page-hero__title">Scholar Queue</h1>
          <p className="page-hero__lead">
            Submitted verification applications awaiting a decision. Open one to review the credentials and
            approve or reject it.
          </p>
        </div>
        <div className="page-hero__actions">
          <span className="page-hero__count">
            <strong>{applications.length}</strong>
            <span>Awaiting review</span>
          </span>
        </div>
      </header>

      {applications.length === 0 ? (
        <p>No applications are awaiting review.</p>
      ) : (
        <div className="archive-grid">
          {applications.map((application) => (
            <article key={application.id} className="archive-card">
              <div className="archive-card__body">
                <div>
                  <span className="pill">{application.status}</span>
                </div>
                <h3>{application.displayName}</h3>
                <p>
                  {application.degrees.length} degree(s) · {application.affiliations.length} affiliation(s)
                </p>
                <Link className="inline-link" href={`/admin/verifications/${application.id}`}>
                  Review application
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
