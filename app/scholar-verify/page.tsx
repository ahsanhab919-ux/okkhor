import Link from "next/link";
import React from "react";

import { StepRail } from "@/src/modules/experience/ui";
import type { VerificationStep } from "@/src/modules/experience/site-content";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { getMyApplication } from "@/src/modules/verification/application/verification-service";
import type {
  ScholarVerification,
  VerificationStatus,
} from "@/src/modules/verification/domain/verification-types";
import { VerificationForm } from "@/src/modules/verification/ui/verification-form";

import { getVerificationViewer } from "../verification-session";

export const dynamic = "force-dynamic";

const STEP_TITLES = [
  { title: "Identity", description: "Confirm who you are and how learners should recognize you." },
  { title: "Credentials", description: "Share verifiable academic and professional evidence." },
  { title: "Specialization", description: "Declare research areas, languages, and teaching strength." },
  { title: "Verification", description: "Final review by the Okkhor scholarly committee." },
];

/** Derives the four-step rail from the real application state instead of static mocks. */
function buildSteps(status?: VerificationStatus): VerificationStep[] {
  if (status === "approved") {
    return STEP_TITLES.map((step) => ({ ...step, status: "completed" }));
  }

  const activeIndex = status === undefined ? 0 : status === "draft" ? 1 : 3;
  const completedCount = status === undefined ? 0 : status === "draft" ? 1 : 3;

  return STEP_TITLES.map((step, index) => ({
    ...step,
    status: index < completedCount ? "completed" : index === activeIndex ? "active" : "upcoming",
  }));
}

function FrozenApplication({ application }: { application: ScholarVerification }) {
  return (
    <div className="verification-main verification-main--embedded">
      <section className="verification-card">
        <p className="eyebrow eyebrow--blue">{application.status === "approved" ? "Approved" : "In review"}</p>
        <h1>{application.status === "approved" ? "Verification complete" : "Application submitted"}</h1>
        <p className="verification-card__lead">
          {application.status === "approved"
            ? "Your scholar status is active, so the authoring studio is now open to you."
            : "The Okkhor scholarly committee is reviewing your credentials. You cannot edit the application while it is under review."}
        </p>

        {application.reviewNote ? (
          <section className="form-panel">
            <div className="form-panel__header">
              <div>
                <h2>Committee note</h2>
                <p>{application.reviewNote}</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="form-panel">
          <div className="form-panel__header">
            <div>
              <h2>Identity</h2>
              <p>{application.displayName}</p>
            </div>
          </div>
        </section>

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
      </section>
    </div>
  );
}

export default async function ScholarVerifyPage() {
  const viewer = await getVerificationViewer();

  if (!viewer) {
    return (
      <ProtectedWorkspaceShell eyebrow="SCHOLAR VERIFICATION" title="Credentials Review">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Sign in to verify your credentials</h2>
            </div>
            <p>Sign in to start or review your scholar verification application.</p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const application = (await getMyApplication(viewer.actor)) ?? null;
  const status = application?.status;
  const reviewable =
    application !== null && (application.status === "submitted" || application.status === "approved");
  const isAdmin = viewer.user.roles.includes("admin");

  return (
    <ProtectedWorkspaceShell eyebrow="SCHOLAR VERIFICATION" title="Credentials Review">
      {isAdmin ? (
        <div className="section-heading">
          <div />
          <Link className="inline-link" href="/admin/verifications">
            Open the review queue
          </Link>
        </div>
      ) : null}

      <div className="verification-shell verification-shell--embedded">
        <StepRail steps={buildSteps(status)} />

        {application && reviewable ? (
          <FrozenApplication application={application} />
        ) : (
          <VerificationForm application={application} defaultDisplayName={viewer.user.displayName} />
        )}
      </div>
    </ProtectedWorkspaceShell>
  );
}
