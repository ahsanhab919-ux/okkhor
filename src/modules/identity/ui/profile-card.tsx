import React from "react";

import type { PublicProfile } from "@/src/modules/identity/domain/auth-types";

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** The two-letter monogram for the avatar ring; models carry no portrait image. */
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/**
 * The member hero, aligned to the Stitch profile header: an initials avatar in a gradient ring, the
 * display name, the member's role line, and the member-since date. Rendered by both `/profile` and
 * `/u/[id]`, so a profile has exactly one identity header (`member-profile-slice.md` §8). It renders
 * only the `PublicProfile` view, so it can never show a phone number or password metadata (§7).
 */
export function ProfileCard({ profile }: { profile: PublicProfile }) {
  return (
    <header className="profile-hero">
      <span aria-hidden="true" className="profile-hero__avatar">
        {initials(profile.displayName)}
      </span>

      <div className="profile-hero__body">
        <h1 className="profile-hero__name">{profile.displayName}</h1>
        <p className="profile-hero__role">{profile.roles.map(roleLabel).join(" · ")}</p>
        <p className="profile-hero__since">Member since {profile.createdAt.slice(0, 10)}</p>
      </div>
    </header>
  );
}
