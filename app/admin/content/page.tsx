import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { canModerate } from "@/src/modules/community/domain/community-authorization";
import { listContentItems } from "@/src/modules/content/application/content-service";
import type { ResearchItemStatus } from "@/src/modules/content/domain/content-types";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content Register | Okkhor",
  description: "Every research item in the archive, with its classification, status, and summary state.",
};

type StatusFilter = "all" | ResearchItemStatus;

const FILTERS: readonly { key: StatusFilter; label: string; href: string }[] = [
  { key: "all", label: "All Content", href: "/admin/content" },
  { key: "published", label: "Published", href: "/admin/content?status=published" },
  { key: "draft", label: "Drafts", href: "/admin/content?status=draft" },
];

function parseStatusFilter(value: string | undefined): StatusFilter {
  return value === "published" || value === "draft" ? value : "all";
}

type AdminContentPageProps = {
  searchParams: Promise<{ status?: string }>;
};

/**
 * The `/admin/content` register — the honest reading of the Stitch "Bulk Upload & Ingestion" screen.
 * That screen is a file-ingestion workbench (drag-and-drop upload for video, PDF, and CSV, AI
 * tagging, column mapping, batch publish) with no backing: the platform has no file storage, no
 * upload endpoint, and no ingestion queue, so nothing here can be uploaded. What it does have is the
 * archive itself, so this view is a read-only register over it — the Stitch screen's batch columns
 * mapped to the real records (title, source language, tags, status, and whether the item carries the
 * Bangla summary a publish requires), each counted from `content`'s `listContentItems` (`ADR-001`).
 */
export default async function AdminContentPage({ searchParams }: AdminContentPageProps) {
  const { status } = await searchParams;
  const filter = parseStatusFilter(status);
  const viewer = await getCommunityViewer();

  if (!viewer || !canModerate(viewer.user.roles)) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Content Register">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can open the content register."
                : "Sign in with an administrator account to open the content register."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const items = await listContentItems();
  const published = items.filter((item) => item.status === "published");
  const summarized = published.filter((item) => item.summaryBn.trim().length > 0);
  const visible = items.filter((item) => filter === "all" || item.status === filter);

  const figures = [
    { label: "Items", value: items.length },
    { label: "Published", value: published.length },
    { label: "Drafts", value: items.length - published.length },
    { label: "Missing summary", value: published.length - summarized.length },
  ];

  const emptyCopy =
    filter === "all"
      ? "No research items have been registered yet."
      : filter === "published"
        ? "No research items have been published yet."
        : "No drafts are registered.";

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="Content Register">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">Content Register</h1>
            <p className="page-hero__lead">
              Every research item in the archive, with its classification, status, and whether it carries
              the Bangla summary a publish requires. Every figure is counted from the record.
            </p>
          </div>
          <div className="page-hero__actions">
            <Link className="inline-link" href="/admin">
              Console
            </Link>
            <span className="page-hero__count">
              <strong>{items.length}</strong>
              <span>Items</span>
            </span>
          </div>
        </header>

        <div className="stats-grid">
          {figures.map((figure) => (
            <div key={figure.label} className="stat-card">
              <strong>{figure.value}</strong>
              <span>{figure.label}</span>
            </div>
          ))}
        </div>

        <nav className="tab-row" aria-label="Filter content">
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
          <p>{emptyCopy}</p>
        ) : (
          <div className="roster-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Source language</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Status</th>
                  <th scope="col">Bangla summary</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.status === "published" ? (
                        <Link className="inline-link" href={`/content/${item.id}`}>
                          {item.title}
                        </Link>
                      ) : (
                        <span className="roster-table__name">{item.title}</span>
                      )}
                    </td>
                    <td className="roster-table__muted">{item.sourceLanguage}</td>
                    <td>
                      {item.tags.length === 0 ? (
                        <span className="roster-table__muted">None</span>
                      ) : (
                        <span className="roster-table__roles">
                          {item.tags.map((tag) => (
                            <span key={tag} className="chip">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={item.status === "published" ? "chip chip--accent" : "chip"}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.summaryBn.trim().length > 0 ? (
                        <span className="chip chip--accent">Present</span>
                      ) : (
                        <span className="chip chip--outline">Missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ProtectedWorkspaceShell>
  );
}
