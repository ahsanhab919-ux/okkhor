import React from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import AdminScholarsPage from "@/app/admin/scholars/page";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import type {
  ScholarVerification,
  VerificationStatus,
} from "@/src/modules/verification/domain/verification-types";
import {
  getMemoryVerificationRepository,
  resetVerificationStoreForTesting,
} from "@/src/modules/verification/infrastructure/verification-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/scholars",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function sessionUser(roles: UserRole[], id: string) {
  return {
    id,
    phoneNumber: "+8801712345678",
    displayName: "Ahsan Habib",
    locale: "bn-BD",
    roles,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function signInAs(roles: UserRole[]): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: sessionUser(roles, result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

type SeedOptions = {
  displayName?: string;
  specializations?: string[];
  degrees?: number;
  affiliations?: number;
};

async function seedApplication(id: string, status: VerificationStatus, options: SeedOptions = {}) {
  const degrees = Array.from({ length: options.degrees ?? 1 }, (_unused, index) => ({
    degreeType: "PhD",
    institution: `University ${index + 1}`,
    year: "2018",
  }));
  const affiliations = Array.from({ length: options.affiliations ?? 0 }, (_unused, index) => ({
    role: "Professor",
    organization: `Institute ${index + 1}`,
    since: "2020",
  }));

  await getMemoryVerificationRepository().create({
    id,
    applicantId: `u-${id}`,
    status,
    displayName: options.displayName ?? `Scholar ${id}`,
    degrees,
    affiliations,
    portfolio: "Archive Cities of the Bay (2024)",
    specializations: options.specializations ?? ["history of science"],
    languages: ["bn", "en"],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  } satisfies ScholarVerification);
}

function scholarCard(name: string): HTMLElement {
  const card = screen.getByText(name).closest(".scholar-card");

  if (!card) {
    throw new Error(`No scholar card for ${name}`);
  }

  return card as HTMLElement;
}

function statValue(card: HTMLElement, label: string): string | undefined {
  const block = Array.from(card.querySelectorAll(".scholar-card__stat")).find(
    (element) => element.querySelector("span")?.textContent === label,
  );

  return block?.querySelector("strong")?.textContent ?? undefined;
}

async function renderRoster(status?: string) {
  return render(await AdminScholarsPage({ searchParams: Promise.resolve({ status }) }));
}

describe("admin scholars page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetVerificationStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderRoster();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Degrees")).toBeNull();
  });

  it("lists verified scholars and pending applications with figures from the record", async () => {
    await signInAs(["admin"]);

    await seedApplication("v1", "approved", {
      displayName: "Dr. Ariful Haque",
      specializations: ["Linguistics", "Phonology"],
      degrees: 2,
      affiliations: 1,
    });
    await seedApplication("v2", "submitted", {
      displayName: "Nadia Sultana",
      specializations: ["Comparative Literature"],
      degrees: 1,
      affiliations: 0,
    });
    // Drafts and rejected applications are not scholars, so they stay out of the roster.
    await seedApplication("d1", "draft", { displayName: "Draft Applicant" });
    await seedApplication("r1", "rejected", { displayName: "Rejected Applicant" });

    await renderRoster();

    expect(await screen.findByText(/Review, verify, and monitor the scholars/i)).toBeInTheDocument();

    const verifiedCard = scholarCard("Dr. Ariful Haque");
    expect(statValue(verifiedCard, "Degrees")).toBe("2");
    expect(statValue(verifiedCard, "Affiliations")).toBe("1");
    expect(within(verifiedCard).getByText("Linguistics · Phonology")).toBeInTheDocument();
    expect(verifiedCard.querySelector(".chip--accent")?.textContent).toBe("Verified");
    expect(within(verifiedCard).getByRole("link", { name: "View profile" })).toHaveAttribute(
      "href",
      "/u/u-v1",
    );

    const pendingCard = scholarCard("Nadia Sultana");
    expect(statValue(pendingCard, "Degrees")).toBe("1");
    expect(statValue(pendingCard, "Affiliations")).toBe("0");
    expect(pendingCard.querySelector(".chip--outline")?.textContent).toBe("Pending");
    expect(within(pendingCard).getByRole("link", { name: "Review application" })).toHaveAttribute(
      "href",
      "/admin/verifications/v2",
    );

    expect(screen.queryByText("Draft Applicant")).toBeNull();
    expect(screen.queryByText("Rejected Applicant")).toBeNull();

    const counts = Array.from(document.querySelectorAll(".page-hero__count")).map(
      (element) => element.textContent,
    );
    expect(counts).toContain("1Verified");
    expect(counts).toContain("1Pending");
  });

  it("filters the roster to verified scholars", async () => {
    await signInAs(["admin"]);

    await seedApplication("v1", "approved", { displayName: "Dr. Ariful Haque" });
    await seedApplication("v2", "submitted", { displayName: "Nadia Sultana" });

    await renderRoster("verified");

    expect(await screen.findByText("Dr. Ariful Haque")).toBeInTheDocument();
    expect(screen.queryByText("Nadia Sultana")).toBeNull();
    expect(screen.getByRole("link", { name: "Verified" })).toHaveClass("tab-row__tab--active");
  });

  it("filters the roster to pending applications", async () => {
    await signInAs(["admin"]);

    await seedApplication("v1", "approved", { displayName: "Dr. Ariful Haque" });
    await seedApplication("v2", "submitted", { displayName: "Nadia Sultana" });

    await renderRoster("pending");

    expect(await screen.findByText("Nadia Sultana")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Ariful Haque")).toBeNull();
  });

  it("explains an empty roster", async () => {
    await signInAs(["admin"]);

    await renderRoster("pending");

    expect(await screen.findByText("No applications are awaiting a decision.")).toBeInTheDocument();
  });
});
