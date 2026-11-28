import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";
import { listApplicationsForReview } from "@/src/modules/verification/application/verification-service";
import { canReview } from "@/src/modules/verification/domain/verification-authorization";
import type { ScholarVerification } from "@/src/modules/verification/domain/verification-types";

import { getVerificationViewer } from "../../verification-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scholar Management | Okkhor",
  description: "The roster of verified scholars and the applications still awaiting a decision.",
};

type ScholarFilter = "all" | "verified" | "pending";

const FILTERS: readonly { key: ScholarFilter; label: string; href: string }[] = [
  { key: "all", label: "All", href: "/admin/scholars" },
  { key: "verified", label: "Verified", href: "/admin/scholars?status=verified" },
  { key: "pending", label: "Pending", href: "/admin/scholars?status=pending" },
];

/**
 * A roster entry is a scholar or a candidate: an approved application or one still awaiting a
 * decision. Drafts and rejected applications are not scholars, so they stay in the review queue.
 */
function isRosterEntry(application: ScholarVerification): boolean {
  return application.status === "approved" || application.status === "submitted";
}

function parseFilter(value: string | undefined): ScholarFilter {
  return value === "verified" || value === "pending" ? value : "all";
}

function matchesFilter(application: ScholarVerification, filter: ScholarFilter): boolean {
  if (filter === "verified") {
    return application.status === "approved";
  }

  if (filter === "pending") {
    return application.status === "submitted";
  }

  return true;
}

/** The discipline line the record already holds: specializations, else the leading degree. */
function disciplineOf(application: ScholarVerification): string {
  if (application.specializations.length > 0) {
    return application.specializations.join(" · ");
  }

  const [degree] = application.degrees;

  return degree ? `${degree.degreeType} · ${degree.institution}` : "No specialization recorded";
}

type AdminScholarsPageProps = {
  searchParams: Promise<{ status?: string }>;
};

/**
 * The `/admin/scholars` roster — the Stitch "Scholar Management" screen. It is a leaf route with its
 * own `ProtectedWorkspaceShell` (like `/admin`) and enforces the `admin` role server-side. Each card
 * counts only what the record actually holds (`degrees`, `affiliations`); the Stitch design's
 * contribution scores, publication counts, and network-health panels have no backing here and are
 * deliberately omitted (`ADR-001`).
 */
export default async function AdminScholarsPage({ searchParams }: AdminScholarsPageProps) {
  const { status } = await searchParams;
  const filter = parseFilter(status);
  const viewer = await getVerificationViewer();

  if (!viewer || !canReview(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Scholar Management">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can manage the scholar roster."
                : "Sign in with an administrator account to manage scholars."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const applications = await listApplicationsForReview(viewer.actor);
  const roster = applications.filter(isRosterEntry);
  const visible = roster.filter((application) => matchesFilter(application, filter));
  const verified = roster.filter((application) => application.status === "approved").length;
  const pending = roster.length - verified;

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Scholar Management">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">Scholar Management</h1>
            <p className="page-hero__lead">
              Review, verify, and monitor the scholars in the archive. Every figure is counted from the
              application record.
            </p>
          </div>
          <div className="page-hero__actions">
            <span className="page-hero__count">
              <strong>{verified}</strong>
              <span>Verified</span>
            </span>
            <span className="page-hero__count">
              <strong>{pending}</strong>
              <span>Pending</span>
            </span>
          </div>
        </header>

        <nav className="tab-row" aria-label="Filter scholars">
          {FILTERS.map((entry) => (
            <Link
              key={entry.key}
              className={`tab-row__tab${entry.key === filter ? " tab-row__tab--active" : ""}`}
              href={entry.href}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <p>
            {filter === "pending"
              ? "No applications are awaiting a decision."
              : filter === "verified"
                ? "No scholars have been verified yet."
                : "No scholars are on the roster yet."}
          </p>
        ) : (
          <ul className="scholar-grid">
            {visible.map((application) => {
              const approved = application.status === "approved";

              return (
                <li key={application.id} className="scholar-card">
                  <div className="scholar-card__head">
                    <div>
                      <h3 className="scholar-card__name">{application.displayName}</h3>
                      <p className="scholar-card__discipline">{disciplineOf(application)}</p>
                    </div>
                    <span className={approved ? "chip chip--accent" : "chip chip--outline"}>
                      {approved ? "Verified" : "Pending"}
                    </span>
                  </div>

                  <div className="scholar-card__stats">
                    <div className="scholar-card__stat">
                      <span>Degrees</span>
                      <strong>{application.degrees.length}</strong>
                    </div>
                    <div className="scholar-card__stat">
                      <span>Affiliations</span>
                      <strong>{application.affiliations.length}</strong>
                    </div>
                  </div>

                  <div className="scholar-card__actions">
                    {approved ? (
                      <Link className="inline-link" href={`/u/${application.applicantId}`}>
                        View profile
                      </Link>
                    ) : (
                      <Link className="inline-link" href={`/admin/verifications/${application.id}`}>
                        Review application
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </ProtectedWorkspaceShell>
  );
}
