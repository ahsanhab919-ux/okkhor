import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminAnalyticsPage from "@/app/admin/analytics/page";
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
  usePathname: () => "/admin/analytics",
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

async function seedItem(id: string, status: ResearchItemStatus, tags: string[]) {
  await getMemoryContentRepository().createItem({
    id,
    title: `Item ${id}`,
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags,
    status,
    publishedAt: status === "published" ? "2026-02-10T00:00:00.000Z" : undefined,
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
  } satisfies ResearchItem);
}

async function seedThread(id: string, category: string) {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId: "u-author",
    title: `Thread ${id}`,
    body: "A discussion about the Lothal excavation record.",
    category,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    moderationState: "visible",
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

function meter(label: string): HTMLElement {
  const row = screen.getByText(label).closest(".meter-row");

  if (!row) {
    throw new Error(`No meter row for ${label}`);
  }

  return row as HTMLElement;
}

function meterValue(label: string): string | undefined {
  return meter(label).querySelector(".meter-row__value")?.textContent ?? undefined;
}

function meterWidth(label: string): string | undefined {
  const bar = meter(label).querySelector(".meter-row__bar span");

  return (bar as HTMLElement | null)?.style.width ?? undefined;
}

describe("admin analytics page", () => {
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

    render(await AdminAnalyticsPage());

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Intelligence Canvas")).toBeNull();
  });

  it("charts the real distributions across the archive, community, and review record", async () => {
    await signInAs(["admin"]);

    await seedItem("c1", "published", ["climate", "history"]);
    await seedItem("c2", "published", ["climate"]);
    await seedItem("c3", "published", ["climate"]);
    // A draft's tag is not a published topic, so it stays out of the composition.
    await seedItem("c4", "draft", ["unpublished"]);

    await seedThread("t1", "General");
    await seedThread("t2", "General");
    await seedThread("t3", "Method");

    await seedApplication("a1", "approved");
    await seedApplication("a2", "approved");
    await seedApplication("a3", "submitted");

    render(await AdminAnalyticsPage());

    expect(await screen.findByText(/How the archive, the community, and the verification record/i)).toBeInTheDocument();

    expect(screen.getByText("2 topics · 3 published items")).toBeInTheDocument();
    expect(meterValue("climate")).toBe("3");
    expect(meterWidth("climate")).toBe("100%");
    expect(meterValue("history")).toBe("1");
    expect(meterWidth("history")).toBe("33%");
    expect(screen.queryByText("unpublished")).toBeNull();
    expect(screen.getByRole("link", { name: "climate" })).toHaveAttribute("href", "/tags/climate");

    expect(meterValue("General")).toBe("2");
    expect(meterWidth("General")).toBe("100%");
    expect(meterValue("Method")).toBe("1");
    expect(meterWidth("Method")).toBe("50%");
    expect(screen.getByRole("link", { name: "General" })).toHaveAttribute("href", "/categories/General");

    expect(meterValue("approved")).toBe("2");
    expect(meterValue("submitted")).toBe("1");
    expect(meterValue("draft")).toBe("0");
    expect(meterValue("rejected")).toBe("0");
    expect(meterWidth("approved")).toBe("100%");

    const counts = Array.from(document.querySelectorAll(".page-hero__count")).map(
      (element) => element.textContent,
    );
    expect(counts).toContain("7Records");
  });

  it("explains each empty distribution for an empty archive", async () => {
    await signInAs(["admin"]);

    render(await AdminAnalyticsPage());

    expect(await screen.findByText(/No published research has been tagged yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No discussions have been started yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No verification applications have been started yet/i)).toBeInTheDocument();
  });
});
