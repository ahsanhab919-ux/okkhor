import Link from "next/link";
import { notFound } from "next/navigation";
import React from "react";

import { getApplicationForReview } from "@/src/modules/verification/application/verification-service";
import { VerificationError } from "@/src/modules/verification/domain/verification-errors";
import { VerificationDecisionForm } from "@/src/modules/verification/ui/verification-review";

import { getVerificationViewer } from "../../../verification-session";

export const dynamic = "force-dynamic";

type AdminVerificationPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminVerificationPage({ params }: AdminVerificationPageProps) {
  const { id } = await params;
  const viewer = await getVerificationViewer();

  if (!viewer) {
    notFound();
  }

  const application = await getApplicationForReview(viewer.actor, id).catch((error: unknown) => {
    if (error instanceof VerificationError && error.code === "VERIFICATION_APPLICATION_NOT_FOUND") {
      notFound();
    }

    throw error;
  });

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <p className="eyebrow eyebrow--blue">Review</p>
          <h1>{application.displayName}</h1>
        </div>
        <Link className="inline-link" href="/admin/verifications">
          Back to the queue
        </Link>
      </div>

      <span className="pill">{application.status}</span>

      <section className="form-panel">
        <div className="form-panel__header">
          <div>
            <h2>Academic Degrees</h2>
          </div>
        </div>
        {application.degrees.length === 0 ? (
          <p>No degrees recorded.</p>
        ) : (
          <ul>
            {application.degrees.map((degree, index) => (
              <li key={`degree-${index}`}>
                {degree.degreeType} · {degree.institution} · {degree.year}
                {degree.evidenceUrl ? ` · ${degree.evidenceUrl}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="form-panel">
        <div className="form-panel__header">
          <div>
            <h2>Professional Affiliations</h2>
          </div>
        </div>
        {application.affiliations.length === 0 ? (
          <p>No affiliations recorded.</p>
        ) : (
          <ul>
            {application.affiliations.map((entry, index) => (
              <li key={`affiliation-${index}`}>
                {entry.role} · {entry.organization} · since {entry.since}
                {entry.evidenceUrl ? ` · ${entry.evidenceUrl}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="form-panel">
        <div className="form-panel__header">
          <div>
            <h2>Research Portfolio</h2>
            <p>{application.portfolio || "No portfolio provided."}</p>
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-panel__header">
          <div>
            <h2>Specialization</h2>
            <p>Specializations: {application.specializations.join(", ") || "None"}</p>
            <p>Languages: {application.languages.join(", ") || "None"}</p>
          </div>
        </div>
      </section>

      {application.reviewNote ? (
        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Previous review note</h2>
              <p>{application.reviewNote}</p>
            </div>
          </div>
        </section>
      ) : null}

      <VerificationDecisionForm
        applicationId={application.id}
        reviewable={application.status === "submitted"}
        updatedAt={application.updatedAt}
      />
    </section>
  );
}
