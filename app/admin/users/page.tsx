import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { listMembers } from "@/src/modules/identity/application/auth-service";
import type { MemberRosterEntry, UserRole } from "@/src/modules/identity/domain/auth-types";
import { ProtectedWorkspaceShell } from "@/src/modules/identity/ui/protected-workspace-shell";

import { getCommunityViewer } from "../../community-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User Management | Okkhor",
  description: "Every member of the archive, with the roles they hold and when they last signed in.",
};

type RoleFilter = "all" | UserRole;

const FILTERS: readonly { key: RoleFilter; label: string; href: string }[] = [
  { key: "all", label: "All Users", href: "/admin/users" },
  { key: "learner", label: "Learners", href: "/admin/users?role=learner" },
  { key: "scholar", label: "Scholars", href: "/admin/users?role=scholar" },
  { key: "admin", label: "Administrators", href: "/admin/users?role=admin" },
];

function parseRoleFilter(value: string | undefined): RoleFilter {
  return value === "learner" || value === "scholar" || value === "admin" ? value : "all";
}

function matchesFilter(member: MemberRosterEntry, filter: RoleFilter): boolean {
  return filter === "all" || member.roles.includes(filter);
}

type AdminUsersPageProps = {
  searchParams: Promise<{ role?: string }>;
};

/**
 * The `/admin/users` roster — the Stitch "User Management" screen. It is a leaf route with its own
 * `ProtectedWorkspaceShell` (like `/admin`) and enforces the `admin` role server-side; the edge
 * middleware already covers `/admin/:path*`. Every figure is counted from the account itself: the
 * Stitch screen's plan tiers, suspension state, live-traffic count, and premium conversion have no
 * backing here, so they are omitted rather than faked (`ADR-001`). The read is projected by
 * identity's `listMembers`, which never returns a phone number or an email.
 */
export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const { role } = await searchParams;
  const filter = parseRoleFilter(role);
  const viewer = await getCommunityViewer();

  if (!viewer || !viewer.user.roles.includes("admin")) {
    return (
      <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="User Management">
        <section className="content-band" role="alert">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--blue">Restricted</p>
              <h2>Administrator access required</h2>
            </div>
            <p>
              {viewer
                ? "Only administrators can manage members."
                : "Sign in with an administrator account to manage members."}
            </p>
          </div>
        </section>
      </ProtectedWorkspaceShell>
    );
  }

  const members = await listMembers(viewer.actor);
  const visible = members.filter((member) => matchesFilter(member, filter));
  const countRole = (role: UserRole) => members.filter((member) => member.roles.includes(role)).length;

  const figures = [
    { label: "Members", value: members.length },
    { label: "Learners", value: countRole("learner") },
    { label: "Scholars", value: countRole("scholar") },
    { label: "Administrators", value: countRole("admin") },
  ];

  return (
    <ProtectedWorkspaceShell eyebrow="ADMINISTRATION" title="User Management">
      <section className="content-band">
        <header className="page-hero">
          <div>
            <p className="eyebrow eyebrow--blue">Administration</p>
            <h1 className="page-hero__title">User Management</h1>
            <p className="page-hero__lead">
              Every member of the archive, the roles they hold, and when they last signed in. Every figure
              is counted from the account itself.
            </p>
          </div>
          <div className="page-hero__actions">
            <span className="page-hero__count">
              <strong>{members.length}</strong>
              <span>Members</span>
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

        <nav className="tab-row" aria-label="Filter members">
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
            {filter === "all"
              ? "No members have registered yet."
              : `No members hold the ${filter} role.`}
          </p>
        ) : (
          <div className="roster-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last active</th>
                  <th scope="col" className="roster-table__actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <span className="roster-table__name">{member.displayName}</span>
                    </td>
                    <td>
                      <span className="roster-table__roles">
                        {member.roles.map((role) => (
                          <span key={role} className={role === "admin" ? "chip chip--accent" : "chip"}>
                            {role}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="roster-table__muted">{member.createdAt.slice(0, 10)}</td>
                    <td className="roster-table__muted">
                      {member.lastLoginAt ? member.lastLoginAt.slice(0, 10) : "Never"}
                    </td>
                    <td className="roster-table__actions">
                      <Link className="inline-link" href={`/u/${member.id}`}>
                        View profile
                      </Link>
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
