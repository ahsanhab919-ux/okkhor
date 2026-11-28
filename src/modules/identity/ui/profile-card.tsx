import React from "react";

import type { PublicProfile } from "@/src/modules/identity/domain/auth-types";

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * The member header: display name, role badge(s), and the member-since date. Rendered by both
 * `/profile` and `/u/[id]`, so a profile has exactly one identity header
 * (`member-profile-slice.md` §8). It renders only the `PublicProfile` view, so it can never show
 * a phone number or password metadata (§7).
 */
export function ProfileCard({ profile }: { profile: PublicProfile }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow eyebrow--blue">Member</p>
        <h1>{profile.displayName}</h1>
      </div>
      <div className="discussion-card__meta">
        {profile.roles.map((role) => (
          <span key={role} className="pill">
            {roleLabel(role)}
          </span>
        ))}
        <span>Member since {profile.createdAt.slice(0, 10)}</span>
      </div>
    </div>
  );
}
