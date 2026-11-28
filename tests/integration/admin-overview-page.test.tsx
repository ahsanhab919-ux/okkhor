import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminOverviewPage from "@/app/admin/page";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";
import type { ResearchItem, ResearchItemStatus } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
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
  usePathname: () => "/admin",
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

async function seedItem(id: string, status: ResearchItemStatus) {
  await getMemoryContentRepository().createItem({
    id,
    title: `Item ${id}`,
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags: ["climate"],
    status,
    publishedAt: status === "published" ? "2026-02-10T00:00:00.000Z" : undefined,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  } satisfies ResearchItem);
}

async function seedThread(id: string, category = "General", moderationState: "visible" | "hidden" = "visible") {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId: "u-author",
    title: `Thread ${id}`,
    body: "A discussion about the Lothal excavation record.",
    category,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    moderationState,
    locked: false,
  });
}

async function seedApplication(id: string, status: VerificationStatus) {
  await getMemoryVerificationRepository().create({
    id,
    applicantId: `u-${id}`,
    status,
    displayName: `Scholar ${id}`,
    degrees: [],
    affiliations: [],
    portfolio: "",
    specializations: [],
    languages: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  } satisfies ScholarVerification);
}

function statValue(label: string): string | undefined {
  const card = screen.getByText(label).closest(".stat-card");

  return card?.querySelector("strong")?.textContent ?? undefined;
}

describe("admin overview page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
    resetContentStoreForTesting();
    resetVerificationStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    render(await AdminOverviewPage());

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Published research")).toBeNull();
  });

  it("counts the archive, community, and review queues for an administrator", async () => {
    await signInAs(["admin"]);

    await seedItem("c1", "published");
    await seedItem("c2", "published");
    await seedItem("c3", "draft");

    await seedThread("t1", "General");
    await seedThread("t2", "General");
    await seedThread("t3", "General", "hidden");

    await seedApplication("v1", "submitted");
    await seedApplication("v2", "approved");
    await seedApplication("v3", "rejected");

    render(await AdminOverviewPage());

    expect(await screen.findByText("At a glance")).toBeInTheDocument();

    expect(statValue("Published research")).toBe("2");
    expect(statValue("Draft research")).toBe("1");
    // The hidden thread is not a visible thread, so the archive count stays at two.
    expect(statValue("Visible threads")).toBe("2");
    expect(statValue("Categories")).toBe("1");
    expect(statValue("Open reports")).toBe("0");
    expect(statValue("Awaiting review")).toBe("1");
    expect(statValue("Approved scholars")).toBe("1");
    expect(statValue("Rejected applications")).toBe("1");

    expect(screen.getByRole("link", { name: "Community queue" })).toHaveAttribute(
      "href",
      "/admin/community",
    );
    expect(screen.getByRole("link", { name: "Report queue" })).toHaveAttribute(
      "href",
      "/admin/community/reports",
    );
    expect(screen.getByRole("link", { name: "Scholar queue" })).toHaveAttribute(
      "href",
      "/admin/verifications",
    );
  });

  it("renders zeroed queues for an empty archive", async () => {
    await signInAs(["admin"]);

    render(await AdminOverviewPage());

    expect(await screen.findByText("At a glance")).toBeInTheDocument();

    expect(statValue("Published research")).toBe("0");
    expect(statValue("Visible threads")).toBe("0");
    expect(statValue("Approved scholars")).toBe("0");
    expect(screen.getByText("0 open")).toBeInTheDocument();
    expect(screen.getByText("0 awaiting review")).toBeInTheDocument();
  });
});
