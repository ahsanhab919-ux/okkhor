import Link from "next/link";
import React from "react";
import type { ReactNode, SVGProps } from "react";

import type { NavItem, VerificationStep } from "@/src/modules/experience/site-content";
import type { UserProfile } from "@/src/modules/identity/domain/auth-types";

type IconProps = SVGProps<SVGSVGElement> & {
  name:
    | "spark"
    | "play"
    | "book"
    | "community"
    | "scholar"
    | "search"
    | "settings"
    | "support"
    | "logout"
    | "arrow-right"
    | "shield"
    | "check"
    | "plus"
    | "bell";
};

export function Icon({ name, ...props }: IconProps) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "spark":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="m12 3 1.8 4.9L19 9.7l-4.2 2.8 1.4 5-4.2-2.9-4.2 2.9 1.4-5L5 9.7l5.2-1.8Z" />
        </svg>
      );
    case "play":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 8 6 4-6 4Z" />
        </svg>
      );
    case "book":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v15H7.5A2.5 2.5 0 0 0 5 21Z" />
          <path d="M5 6.5V21" />
        </svg>
      );
    case "community":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M3.5 19a4.5 4.5 0 0 1 9 0M13 19a3.5 3.5 0 0 1 7 0" />
        </svg>
      );
    case "scholar":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="m3 9 9-5 9 5-9 5-9-5Z" />
          <path d="M7 11.5V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5" />
        </svg>
      );
    case "search":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z" />
          <path d="M19 12a7.6 7.6 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L14.3 3h-4.6l-.3 2.9a8 8 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.5A7.6 7.6 0 0 0 5 12c0 .4 0 .7.1 1.1l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.9 1.1l.3 2.9h4.6l.3-2.9a8 8 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.1Z" />
        </svg>
      );
    case "support":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M4 13a8 8 0 1 1 16 0" />
          <path d="M4 13v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2Zm16 0v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z" />
        </svg>
      );
    case "logout":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case "shield":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M12 3 5 6v5c0 4.5 2.9 8.4 7 9.9 4.1-1.5 7-5.4 7-9.9V6l-7-3Z" />
        </svg>
      );
    case "check":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="m5 12 4.2 4L19 7" />
        </svg>
      );
    case "plus":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "bell":
      return (
        <svg aria-hidden="true" {...shared} {...props}>
          <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
  }
}

export function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-mark__orb" aria-hidden="true" />
      <span>Okkhor</span>
    </div>
  );
}

export function PublicTopNav({ items }: { items: NavItem[] }) {
  return (
    <header className="public-nav">
      <BrandMark />
      <nav className="public-nav__links" aria-label="Primary">
        {items.map((item) => (
          <Link key={item.label} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="public-nav__actions">
        <Link className="button button--ghost" href="/auth">
          Sign In
        </Link>
        <Link className="button button--primary" href="/auth">
          Get Started
        </Link>
      </div>
    </header>
  );
}

export function AppSidebar({
  items,
  activeHref,
  onLogout,
}: {
  items: NavItem[];
  activeHref: string;
  onLogout?: () => void;
}) {
  return (
    <aside className="app-sidebar">
      <BrandMark />
      <div className="app-sidebar__section">
        <p className="sidebar-kicker">Navigate</p>
        {items.map((item) => (
          <Link
            key={item.label}
            className={`sidebar-link${item.href === activeHref ? " sidebar-link--active" : ""}`}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="app-sidebar__section">
        <p className="sidebar-kicker">Workspace</p>
        <Link className="sidebar-link" href="/scholar-verify">
          Start Research
        </Link>
        <a className="sidebar-link" href="#settings">
          Settings
        </a>
        <a className="sidebar-link" href="#support">
          Support
        </a>
      </div>
      <button className="quick-logout" onClick={onLogout} type="button">
        <Icon className="icon-sm" name="logout" />
        Quick Logout
      </button>
    </aside>
  );
}

export function AppTopBar({
  eyebrow,
  title,
  user,
}: {
  eyebrow: string;
  title: string;
  user: UserProfile;
}) {
  return (
    <div className="app-topbar">
      <div>
        <p className="eyebrow eyebrow--blue">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="app-topbar__tools">
        <button className="icon-button" type="button" aria-label="Search archive">
          <Icon className="icon-sm" name="search" />
        </button>
        <button className="icon-button" type="button" aria-label="Settings">
          <Icon className="icon-sm" name="settings" />
        </button>
        <div className="topbar-user">
          <div className="topbar-user__meta">
            <strong>{user.displayName}</strong>
            <span>{user.roles.join(", ")}</span>
          </div>
          <div className="avatar-chip">{user.displayName.slice(0, 2).toUpperCase()}</div>
        </div>
      </div>
    </div>
  );
}

export function StepRail({ steps }: { steps: VerificationStep[] }) {
  return (
    <aside className="verification-rail">
      <p className="eyebrow eyebrow--blue">SCHOLARLY VERIFICATION</p>
      <h2>Step 2 of 4</h2>
      <p className="verification-rail__summary">
        Build trust with learners by showing verifiable evidence of scholarship and research authority.
      </p>
      <ol className="verification-steps">
        {steps.map((step) => (
          <li key={step.title} className={`verification-step verification-step--${step.status}`}>
            <span className="verification-step__icon" aria-hidden="true">
              {step.status === "completed" ? <Icon className="icon-xs" name="check" /> : null}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function GradientPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="gradient-panel">
      <p className="eyebrow">Introducing The Illuminated Archive</p>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
      {children}
    </div>
  );
}
